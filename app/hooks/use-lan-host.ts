'use client';

import { useRealtimeEvents } from './use-realtime-events';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { createControllerSkillCatalog, createControllerSnapshot, createSkillCatalogRevision } from '@/lib/controller-snapshot';
import { hasNativeLanRoom, LanRoomNative, type NativeHostInfo } from '@/lib/lan-native';
import {
  LAN_PROTOCOL_VERSION,
  createProtocolId,
  createRoomCode,
  normalizeRoomCode,
  parseClientMessage,
  serializeWireMessage,
  type CommandResult,
  type ControllerRealtimeEvent,
  type ControllerNotification,
  type RequestErrorCode,
  type ServerMessage,
} from '@/lib/lan-protocol';
import { applyRemoteControllerCommand, RemoteCommandError } from '@/lib/remote-command';
import type { GameState, SkillCard } from '@/lib/mahjong';
import { calculateTurnClock, turnElapsedMs } from '@/lib/mahjong';
import { CharacterAssetReceiver, readAssetFrame, sendCharacterAsset, type AssetFrame } from '@/lib/character-transfer';
import { getCharacterMedia } from '@/lib/characters';
import { MAX_WIRE_BYTES } from '@/lib/lan-protocol';

export interface HostPeerSummary {
  connectionId: string;
  deviceName: string;
  playerId?: string;
  connected: boolean;
}

export interface LanHostState {
  supported: boolean;
  starting: boolean;
  hostInfo: NativeHostInfo | null;
  roomId: string;
  roomCode: string;
  peers: HostPeerSummary[];
  error: string;
  realtimeEvent: ControllerRealtimeEvent | null;
  emoteEvents: ControllerRealtimeEvent[];
  broadcastRealtimeEvent: (input: { kind: 'emote' | 'draw'; actorPlayerId: string; emoteId?: string }) => Promise<void>;
  startRoom: () => Promise<void>;
  stopRoom: () => Promise<void>;
}

interface UseLanHostOptions {
  game: GameState;
  cards: SkillCard[];
  gameRef: RefObject<GameState>;
  commitRemote: (updater: (current: GameState) => GameState) => GameState;
}

interface PeerBinding {
  connectionId: string;
  deviceId: string;
  deviceName: string;
  playerId?: string;
  seatToken?: string;
}

function nowBase(type: string, roomId?: string) {
  return {
    protocol: LAN_PROTOCOL_VERSION,
    type,
    sentAt: Date.now(),
    ...(roomId ? { roomId } : {}),
  };
}

export function useLanHost({ game, cards, gameRef, commitRemote }: UseLanHostOptions): LanHostState {
  const [supported] = useState(() => hasNativeLanRoom());
  const [starting, setStarting] = useState(false);
  const [hostInfo, setHostInfo] = useState<NativeHostInfo | null>(null);
  const [roomId, setRoomId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [peers, setPeers] = useState<HostPeerSummary[]>([]);
  const [error, setError] = useState('');
  const { realtimeEvent, emoteEvents, setRealtimeEvent } = useRealtimeEvents();

  const cardsRef = useRef(cards);
  const hostInfoRef = useRef<NativeHostInfo | null>(null);
  const roomIdRef = useRef('');
  const roomCodeRef = useRef('');
  const revisionRef = useRef(1);
  const matchIdRef = useRef(createProtocolId('match'));
  const handIdRef = useRef(createProtocolId('hand'));
  const previousHandRef = useRef({ roundWind: game.roundWind, handNumber: game.handNumber, handEnded: game.handEnded });
  const bindingsRef = useRef(new Map<string, PeerBinding>());
  const sessionsRef = useRef(new Map<string, { playerId: string; deviceId: string }>());
  const noticesRef = useRef(new Map<string, ControllerNotification[]>());
  const commandResultsRef = useRef(new Map<string, CommandResult>());
  const lastPublishedGameRef = useRef<GameState | null>(null);
  const assetReceiver = useRef(new CharacterAssetReceiver());
  const assetAsked = useRef(new Map<string, number>());

  const refreshPeerUi = useCallback(() => {
    setPeers([...bindingsRef.current.values()].map((binding) => ({
      connectionId: binding.connectionId,
      deviceName: binding.deviceName || '手机遥控器',
      ...(binding.playerId ? { playerId: binding.playerId } : {}),
      connected: true,
    })));
  }, []);

  const sendTo = useCallback(async (connectionId: string, message: ServerMessage) => {
    await LanRoomNative.sendTo({ connectionId, text: serializeWireMessage(message) });
  }, []);
  const sendAsset = useCallback((connectionId: string, frame: AssetFrame) =>
    LanRoomNative.sendTo({ connectionId, text: JSON.stringify({ ...nowBase(frame.type, roomIdRef.current), ...frame }) }), []);
  const handleAsset = useCallback((connectionId: string, text: string): boolean => {
    if (!text.includes('character.asset.')) return false;
    void (async () => {
      if (new TextEncoder().encode(text).length > MAX_WIRE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
      const value = JSON.parse(text) as Record<string, unknown>, frame = readAssetFrame(value);
      const binding = bindingsRef.current.get(connectionId);
      if (!frame || value.protocol !== LAN_PROTOCOL_VERSION || value.roomId !== roomIdRef.current || !binding?.playerId) throw new Error('AUTH_FAILED');
      const choice = gameRef.current.players.find(player => player.id === binding.playerId)?.character;
      if (![choice?.avatarHash, choice?.portraitHash].includes(frame.hash)) throw new Error('INVALID_CHARACTER_ASSET');
      if (frame.type === 'character.asset.request') await sendCharacterAsset(frame.hash, part => sendAsset(connectionId, part));
      else if (frame.type === 'character.asset.chunk') await assetReceiver.current.accept(`${connectionId}:${frame.hash}`, frame);
      else throw new Error('NOT_ALLOWED');
    })().catch(cause => setError(cause instanceof Error ? cause.message : '角色图片同步失败'));
    return true;
  }, [gameRef, sendAsset]);
  const ensureAssets = useCallback((state: GameState) => {
    for (const peer of bindingsRef.current.values()) {
      const choice = state.players.find(player => player.id === peer.playerId)?.character;
      for (const hash of [choice?.avatarHash, choice?.portraitHash]) if (hash && peer.playerId) {
        void getCharacterMedia(hash).then(blob => {
          if (blob || Date.now() - (assetAsked.current.get(hash) ?? 0) < 4000) return;
          assetAsked.current.set(hash, Date.now());
          return sendAsset(peer.connectionId, { type: 'character.asset.request', hash });
        }).catch(cause => setError(cause instanceof Error ? cause.message : '角色图片同步失败'));
      }
    }
  }, [sendAsset]);

  const makeSnapshot = useCallback((playerId: string, state = gameRef.current, revision = revisionRef.current) => (
    createControllerSnapshot(state, cardsRef.current, {
      roomId: roomIdRef.current,
      matchId: matchIdRef.current,
      handId: handIdRef.current,
      revision,
      playerId,
      pendingNotifications: noticesRef.current.get(playerId) ?? [],
      skillCatalogRevision: createSkillCatalogRevision(cardsRef.current),
    })
  ), [gameRef]);

  const publishAll = useCallback(async (state = gameRef.current, revision = revisionRef.current) => {
    const tasks: Promise<void>[] = [];
    for (const binding of bindingsRef.current.values()) {
      if (!binding.playerId) continue;
      tasks.push(sendTo(binding.connectionId, {
        ...nowBase('state.snapshot', roomIdRef.current),
        type: 'state.snapshot',
        roomId: roomIdRef.current,
        snapshot: makeSnapshot(binding.playerId, state, revision),
      }));
    }
    await Promise.allSettled(tasks);
    ensureAssets(state);
  }, [gameRef, makeSnapshot, sendTo, ensureAssets]);

  const publishRealtimeEvent = useCallback(async (input: { kind: 'emote' | 'draw'; actorPlayerId: string; actorName?: string; emoteId?: string }) => {
    const actor = gameRef.current.players.find((player) => player.id === input.actorPlayerId);
    const event: ControllerRealtimeEvent = {
      eventId: createProtocolId('live'),
      kind: input.kind,
      actorPlayerId: input.actorPlayerId,
      actorName: input.actorName || actor?.name || '玩家',
      ...(input.emoteId ? { emoteId: input.emoteId } : {}),
      createdAt: Date.now(),
    };
    setRealtimeEvent(event);
    if (!hostInfoRef.current) return;
    const message: ServerMessage = {
      ...nowBase('realtime.event', roomIdRef.current),
      type: 'realtime.event',
      roomId: roomIdRef.current,
      event,
    };
    await Promise.allSettled([...bindingsRef.current.values()].map((peer) => sendTo(peer.connectionId, message)));
  }, [gameRef, sendTo, setRealtimeEvent]);

  useEffect(() => {
    if (!hostInfo) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      const state = gameRef.current;
      const now = Date.now();
      const message: ServerMessage = {
        protocol: LAN_PROTOCOL_VERSION, type: 'timer.tick', roomId: roomIdRef.current,
        sentAt: now, turnStartedAt: state.turnStartedAt, clock: calculateTurnClock(state, now),
      };
      await Promise.allSettled([...bindingsRef.current.values()].filter(peer => peer.playerId).map(peer => sendTo(peer.connectionId, message)));
      if (!cancelled) {
        const elapsed = turnElapsedMs(gameRef.current);
        timer = window.setTimeout(tick, 1000 - elapsed % 1000 + 10);
      }
    };
    void tick();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [hostInfo, game, gameRef, sendTo]);

  const broadcastRealtimeEvent = useCallback(async (input: { kind: 'emote' | 'draw'; actorPlayerId: string; emoteId?: string }) => {
    await publishRealtimeEvent(input);
  }, [publishRealtimeEvent]);

  const reject = useCallback(async (
    connectionId: string,
    requestId: string,
    code: RequestErrorCode,
    message: string,
    retryable = false,
  ) => {
    await sendTo(connectionId, {
      ...nowBase('request.rejected', roomIdRef.current),
      type: 'request.rejected',
      requestId,
      roomId: roomIdRef.current || undefined,
      errorCode: code,
      message,
      retryable,
    });
  }, [sendTo]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    if (!hostInfoRef.current || lastPublishedGameRef.current === game) return;
    const previous = previousHandRef.current;
    if (
      previous.roundWind !== game.roundWind ||
      previous.handNumber !== game.handNumber ||
      (previous.handEnded && !game.handEnded)
    ) {
      handIdRef.current = createProtocolId('hand');
      noticesRef.current.clear();
    }
    previousHandRef.current = { roundWind: game.roundWind, handNumber: game.handNumber, handEnded: game.handEnded };
    lastPublishedGameRef.current = game;
    revisionRef.current += 1;
    void publishAll(game, revisionRef.current);
  }, [game, publishAll]);

  useEffect(() => {
    if (!supported) return;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const installListeners = async () => {
      handles.push(await LanRoomNative.addListener('peerOpened', ({ connectionId }) => {
        if (!hostInfoRef.current) return;
        bindingsRef.current.set(connectionId, { connectionId, deviceId: '', deviceName: '正在加入的手机' });
        refreshPeerUi();
      }));
      handles.push(await LanRoomNative.addListener('peerClosed', ({ connectionId }) => {
        bindingsRef.current.delete(connectionId);
        refreshPeerUi();
      }));
      handles.push(await LanRoomNative.addListener('peerMessage', ({ connectionId, text }) => {
        void (async () => {
          if (!hostInfoRef.current) return;
          if (handleAsset(connectionId, text)) return;
          const parsed = parseClientMessage(text);
          if (!parsed.ok) {
            await reject(connectionId, createProtocolId('req'), 'INVALID_MESSAGE', parsed.error.message);
            return;
          }
          const message = parsed.value;
          if (message.type === 'client.hello') {
            const current = bindingsRef.current.get(connectionId) ?? { connectionId, deviceId: '', deviceName: '' };
            bindingsRef.current.set(connectionId, { ...current, deviceId: message.deviceId, deviceName: message.deviceName });
            refreshPeerUi();
            await sendTo(connectionId, {
              ...nowBase('server.hello', roomIdRef.current),
              type: 'server.hello',
              requestId: message.requestId,
              roomId: roomIdRef.current,
              serviceName: hostInfoRef.current?.serviceName ?? '麻将无双牌桌',
              playerCount: gameRef.current.settings.playerCount,
              requiresApproval: false,
            });
            await sendTo(connectionId, {
              ...nowBase('seat.offer', roomIdRef.current),
              type: 'seat.offer',
              requestId: message.requestId,
              roomId: roomIdRef.current,
              seats: gameRef.current.players.map((player) => ({
                playerId: player.id,
                playerName: player.name,
                currentWind: player.wind,
                occupied: [...bindingsRef.current.values()].some((binding) => binding.connectionId !== connectionId && binding.playerId === player.id),
              })),
            });
            return;
          }

          if (message.type === 'room.join') {
            if (normalizeRoomCode(message.roomCode) !== roomCodeRef.current) {
              await reject(connectionId, message.requestId, 'AUTH_FAILED', '房间码不正确');
              return;
            }
            const occupied = new Set([...bindingsRef.current.values()].filter((entry) => entry.connectionId !== connectionId).map((entry) => entry.playerId));
            const requested = message.desiredPlayerId
              ? gameRef.current.players.find((player) => player.id === message.desiredPlayerId)
              : undefined;
            if (requested && occupied.has(requested.id)) {
              await reject(connectionId, message.requestId, 'SEAT_TAKEN', `${requested.wind}家已经连接`, true);
              return;
            }
            const player = requested ?? gameRef.current.players.find((entry) => !occupied.has(entry.id));
            if (!player) {
              await reject(connectionId, message.requestId, 'SEAT_TAKEN', '当前没有可用席位', true);
              return;
            }
            const existing = bindingsRef.current.get(connectionId) ?? { connectionId, deviceId: '', deviceName: '手机遥控器' };
            const seatToken = createProtocolId('seat');
            const binding = { ...existing, playerId: player.id, seatToken };
            bindingsRef.current.set(connectionId, binding);
            sessionsRef.current.set(seatToken, { playerId: player.id, deviceId: binding.deviceId });
            refreshPeerUi();
            await sendTo(connectionId, {
              ...nowBase('room.join-accepted', roomIdRef.current),
              type: 'room.join-accepted',
              requestId: message.requestId,
              roomId: roomIdRef.current,
              playerId: player.id,
              seatToken,
              snapshot: makeSnapshot(player.id),
            });
            await sendTo(connectionId, {
              ...nowBase('catalog.snapshot', roomIdRef.current),
              type: 'catalog.snapshot',
              roomId: roomIdRef.current,
              revision: createSkillCatalogRevision(cardsRef.current),
              cards: createControllerSkillCatalog(cardsRef.current),
            });
            ensureAssets(gameRef.current);
            return;
          }

          if (message.type === 'room.resume') {
            const session = sessionsRef.current.get(message.seatToken);
            const existing = bindingsRef.current.get(connectionId);
            if (!session || message.roomId !== roomIdRef.current || (session.deviceId && session.deviceId !== message.deviceId) || !existing) {
              await reject(connectionId, message.requestId, 'AUTH_FAILED', '席位凭证已经失效，请重新加入');
              return;
            }
            bindingsRef.current.set(connectionId, { ...existing, playerId: session.playerId, seatToken: message.seatToken });
            refreshPeerUi();
            await sendTo(connectionId, {
              ...nowBase('room.join-accepted', roomIdRef.current),
              type: 'room.join-accepted',
              requestId: message.requestId,
              roomId: roomIdRef.current,
              playerId: session.playerId,
              seatToken: message.seatToken,
              snapshot: makeSnapshot(session.playerId),
            });
            ensureAssets(gameRef.current);
            return;
          }

          if (message.type === 'notification.ack') {
            const binding = bindingsRef.current.get(connectionId);
            if (!binding?.playerId || message.roomId !== roomIdRef.current) {
              await reject(connectionId, message.requestId, 'AUTH_FAILED', '遥控器尚未绑定席位');
              return;
            }
            const existing = noticesRef.current.get(binding.playerId) ?? [];
            noticesRef.current.set(binding.playerId, existing.filter((notice) => notice.notificationId !== message.notificationId));
            revisionRef.current += 1;
            await publishAll(gameRef.current, revisionRef.current);
            return;
          }

          if (message.type === 'ping') {
            await sendTo(connectionId, {
              ...nowBase('pong', roomIdRef.current),
              type: 'pong',
              requestId: message.requestId,
              nonce: message.nonce,
            });
            return;
          }

          if (message.type === 'command.request') {
            const binding = bindingsRef.current.get(connectionId);
            if (!binding?.playerId || message.roomId !== roomIdRef.current) {
              await reject(connectionId, message.requestId, 'AUTH_FAILED', '遥控器尚未绑定席位');
              return;
            }
            const replay = commandResultsRef.current.get(message.commandId);
            if (replay) {
              await sendTo(connectionId, { ...replay, replayed: true });
              return;
            }
            if (message.matchId !== matchIdRef.current || message.handId !== handIdRef.current) {
              await reject(connectionId, message.requestId, 'HAND_CHANGED', '牌桌已经进入另一局，请查看最新状态', true);
              return;
            }
            try {
              const outcome = applyRemoteControllerCommand(gameRef.current, cardsRef.current, binding.playerId, message.command);
              if (outcome.changed) {
                const next = commitRemote(() => outcome.nextGame);
                lastPublishedGameRef.current = next;
                for (const delivery of outcome.notifications) {
                  const queue = noticesRef.current.get(delivery.playerId) ?? [];
                  noticesRef.current.set(delivery.playerId, [...queue.slice(-11), delivery.notification]);
                }
                revisionRef.current += 1;
              }
              if (outcome.realtimeEvent) {
                await publishRealtimeEvent(outcome.realtimeEvent);
              }
              const result: CommandResult = {
                ...nowBase('command.result', roomIdRef.current),
                type: 'command.result',
                requestId: message.requestId,
                roomId: roomIdRef.current,
                commandId: message.commandId,
                status: 'accepted',
                revision: revisionRef.current,
                message: outcome.message,
                ...(outcome.preview ? { preview: outcome.preview } : {}),
              };
              commandResultsRef.current.set(message.commandId, result);
              if (commandResultsRef.current.size > 200) commandResultsRef.current.delete(commandResultsRef.current.keys().next().value as string);
              await sendTo(connectionId, result);
              // Other devices may act while sound/result sends are awaiting native I/O.
              // Never publish the older outcome with a newer revision.
              if (outcome.changed) await publishAll(gameRef.current, revisionRef.current);
            } catch (cause) {
              const code = cause instanceof RemoteCommandError ? cause.code : 'INTERNAL_ERROR';
              const textMessage = cause instanceof Error ? cause.message : '牌桌无法处理这项操作';
              const result: CommandResult = {
                ...nowBase('command.result', roomIdRef.current),
                type: 'command.result',
                requestId: message.requestId,
                roomId: roomIdRef.current,
                commandId: message.commandId,
                status: 'rejected',
                revision: revisionRef.current,
                errorCode: code,
                message: textMessage,
              };
              commandResultsRef.current.set(message.commandId, result);
              await sendTo(connectionId, result);
            }
          }
        })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '处理遥控消息失败'));
      }));
    };
    let disposed = false;
    void installListeners().catch((cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : '无法注册房间监听');
    }).finally(() => {
      if (disposed) void Promise.all(handles.splice(0).map((handle) => handle.remove()));
    });
    return () => {
      disposed = true;
      void Promise.all(handles.splice(0).map((handle) => handle.remove()));
    };
  }, [commitRemote, ensureAssets, gameRef, handleAsset, makeSnapshot, publishAll, publishRealtimeEvent, refreshPeerUi, reject, sendTo, supported]);

  const startRoom = useCallback(async () => {
    if (!supported || hostInfoRef.current || starting) return;
    setStarting(true);
    setError('');
    try {
      const nextCode = createRoomCode();
      const nextRoomId = createProtocolId('room');
      const info = await LanRoomNative.startHost({ preferredPort: 8765, serviceName: `麻将无双·${nextCode}` });
      roomCodeRef.current = nextCode;
      roomIdRef.current = nextRoomId;
      hostInfoRef.current = info;
      revisionRef.current = 1;
      matchIdRef.current = createProtocolId('match');
      handIdRef.current = createProtocolId('hand');
      bindingsRef.current.clear();
      sessionsRef.current.clear();
      noticesRef.current.clear();
      commandResultsRef.current.clear();
      assetReceiver.current.clear(); assetAsked.current.clear();
      lastPublishedGameRef.current = gameRef.current;
      setRoomCode(nextCode);
      setRoomId(nextRoomId);
      setHostInfo(info);
      setPeers([]);
      setRealtimeEvent(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法启动局域网房间');
    } finally {
      setStarting(false);
    }
  }, [gameRef, starting, supported, setRealtimeEvent]);

  const stopRoom = useCallback(async () => {
    setError('');
    try {
      if (hostInfoRef.current) {
        await LanRoomNative.broadcast({ text: serializeWireMessage({
          ...nowBase('room.closed', roomIdRef.current),
          type: 'room.closed',
          roomId: roomIdRef.current,
          reason: '平板已关闭房间',
        }) });
      }
      await LanRoomNative.stopHost();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '关闭房间时发生错误');
    } finally {
      hostInfoRef.current = null;
      bindingsRef.current.clear();
      sessionsRef.current.clear();
      noticesRef.current.clear();
      assetReceiver.current.clear(); assetAsked.current.clear();
      setHostInfo(null);
      setPeers([]);
      setRoomId('');
      setRoomCode('');
    }
    setRealtimeEvent(null);
  }, [setRealtimeEvent]);

  useEffect(() => () => {
    if (hostInfoRef.current) void LanRoomNative.stopHost();
  }, []);

  return { supported, starting, hostInfo, roomId, roomCode, peers, error, realtimeEvent, emoteEvents, broadcastRealtimeEvent, startRoom, stopRoom };
}
