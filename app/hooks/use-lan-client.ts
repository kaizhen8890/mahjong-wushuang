'use client';

import { EmoteRoomAssets } from '@/lib/emote-transfer';
import { useRealtimeEvents } from './use-realtime-events';

import { useCallback, useEffect, useRef, useState } from 'react';

import { hasNativeLanRoom, LanRoomNative, type DiscoveredLanRoom } from '@/lib/lan-native';
import { CharacterAssetReceiver, readAssetFrame, sendCharacterAsset, type AssetFrame } from '@/lib/character-transfer';
import { getCharacterMedia } from '@/lib/characters';
import { MAX_WIRE_BYTES } from '@/lib/lan-protocol';
import {
  LAN_PROTOCOL_VERSION,
  createCommandRequest,
  createNotificationAck,
  createProtocolId,
  parseServerMessage,
  serializeWireMessage,
  type CommandResult,
  type ControllerCommand,

  type ControllerSkillCard,
  type DiscoveredRoom,
  type RemoteSnapshot,
  type ServerMessage,
} from '@/lib/lan-protocol';
import type {
  RemoteConnectionState,
  RemoteJoinInput,
  RemoteSeatOption,
} from '@/app/components/remote-controller';

const DEVICE_ID_KEY = 'mahjong-wushuang:controller-device-id:v1';

interface PendingJoin extends RemoteJoinInput {
  requestId: string;
}

function roomFromNative(room: DiscoveredLanRoom): DiscoveredRoom {
  return {
    roomId: `${room.host}:${room.port}`,
    serviceName: room.serviceName,
    host: room.host,
    port: room.port,
    protocol: 1,
  };
}

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = createProtocolId('device');
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function useLanClient() {
  const [supported] = useState(() => hasNativeLanRoom());
  const [connectionState, setConnectionState] = useState<RemoteConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [snapshot, setSnapshot] = useState<RemoteSnapshot | null>(null);
  const [discoveredRooms, setDiscoveredRooms] = useState<DiscoveredRoom[]>([]);
  const [skillCards, setSkillCards] = useState<ControllerSkillCard[]>([]);
  const [seatOptions, setSeatOptions] = useState<RemoteSeatOption[]>([]);
  const { realtimeEvent, emoteEvents, setRealtimeEvent } = useRealtimeEvents();

  const pendingJoinRef = useRef<PendingJoin | null>(null);
  const snapshotRef = useRef<RemoteSnapshot | null>(null);
  const connectedRef = useRef(false);
  const assetReceiver = useRef(new CharacterAssetReceiver());
  const assetAsked = useRef(new Map<string, number>());
  const commandWaitersRef = useRef(new Map<string, {
    resolve: (result: CommandResult) => void;
    reject: (cause: Error) => void;
    timer: number;
  }>());

  const emoteAssets = useRef<EmoteRoomAssets | null>(null);
  emoteAssets.current ??= new EmoteRoomAssets(LAN_PROTOCOL_VERSION, () => snapshotRef.current?.roomId ?? '',
    () => Boolean(connectedRef.current && snapshotRef.current), (_, text) => LanRoomNative.send({ text }),
    cause => setConnectionMessage(cause instanceof Error ? cause.message : '表情同步失败'));
  const updateRooms = useCallback((rooms: readonly DiscoveredLanRoom[]) => {
    const unique = new Map<string, DiscoveredRoom>();
    for (const room of rooms) unique.set(`${room.host}:${room.port}`, roomFromNative(room));
    setDiscoveredRooms([...unique.values()]);
  }, []);

  const sendClientMessage = useCallback(async (message: Parameters<typeof serializeWireMessage>[0]) => {
    await LanRoomNative.send({ text: serializeWireMessage(message) });
  }, []);
  const sendAsset = useCallback((roomId: string, frame: AssetFrame) => LanRoomNative.send({ text: JSON.stringify({ protocol: LAN_PROTOCOL_VERSION, roomId, sentAt: Date.now(), ...frame }) }), []);
  const ensureAssets = useCallback((value: RemoteSnapshot) => {
    for (const hash of [value.self.character?.avatarHash, value.self.character?.portraitHash]) if (hash) {
      void getCharacterMedia(hash).then(blob => {
        if (blob || Date.now() - (assetAsked.current.get(hash) ?? 0) < 4000) return;
        assetAsked.current.set(hash, Date.now());
        return sendAsset(value.roomId, { type: 'character.asset.request', hash });
      }).catch(cause => setConnectionMessage(cause instanceof Error ? cause.message : '角色图片同步失败'));
    }
  }, [sendAsset]);
  const handleAsset = useCallback((text: string): boolean => {
    if (emoteAssets.current!.handle('host', text)) return true;
    if (!text.includes('character.asset.')) return false;
    void (async () => {
      if (new TextEncoder().encode(text).length > MAX_WIRE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
      const value = JSON.parse(text) as Record<string, unknown>, frame = readAssetFrame(value), current = snapshotRef.current;
      if (!frame || !current || value.protocol !== LAN_PROTOCOL_VERSION || value.roomId !== current.roomId || !connectedRef.current) throw new Error('INVALID_CHARACTER_ASSET');
      if (![current.self.character?.avatarHash, current.self.character?.portraitHash].includes(frame.hash)) throw new Error('UNKNOWN_CHARACTER_ASSET');
      if (frame.type === 'character.asset.request') await sendCharacterAsset(frame.hash, part => sendAsset(current.roomId, part));
      else if (frame.type === 'character.asset.chunk') await assetReceiver.current.accept(frame.hash, frame);
      else ensureAssets(current);
    })().catch(cause => setConnectionMessage(cause instanceof Error ? cause.message : '角色图片同步失败'));
    return true;
  }, [sendAsset, ensureAssets]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!supported) return;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const installListeners = async () => {
      handles.push(await LanRoomNative.addListener('roomsChanged', ({ rooms, error }) => {
        updateRooms(rooms);
        if (error) setConnectionMessage(error);
      }));
      handles.push(await LanRoomNative.addListener('clientState', ({ state, message }) => {
        if (state === 'connecting') {
          setConnectionState('connecting');
          return;
        }
        if (state === 'connected') {
          connectedRef.current = true;
          setConnectionState('connecting');
          setConnectionMessage('已找到平板，正在核对房间码');
          const pending = pendingJoinRef.current;
          if (!pending) return;
          const deviceId = getDeviceId();
          const helloRequestId = createProtocolId('req');
          void sendClientMessage({
            protocol: LAN_PROTOCOL_VERSION,
            type: 'client.hello',
            sentAt: Date.now(),
            requestId: helloRequestId,
            deviceId,
            deviceName: `手机遥控 ${deviceId.slice(-4).toUpperCase()}`,
            appVersion: '0.14.2',
          }).then(() => sendClientMessage({
            protocol: LAN_PROTOCOL_VERSION,
            type: 'room.join',
            sentAt: Date.now(),
            requestId: pending.requestId,
            ...(pending.roomId ? { roomId: pending.roomId } : {}),
            roomCode: pending.roomCode,
            ...(pending.desiredPlayerId ? { desiredPlayerId: pending.desiredPlayerId } : {}),
          })).catch((cause: unknown) => {
            setConnectionState('error');
            setConnectionMessage(cause instanceof Error ? cause.message : '发送加入请求失败');
          });
          return;
        }
        connectedRef.current = false;
        if (state === 'error') {
          setConnectionState('error');
          setConnectionMessage(message || '无法连接平板');
        } else {
          emoteAssets.current?.clear();
          setConnectionState(snapshotRef.current ? 'disconnected' : 'idle');
          setConnectionMessage(message || (snapshotRef.current ? '与平板的连接已断开' : ''));
        }
      }));
      handles.push(await LanRoomNative.addListener('clientMessage', ({ text }) => {
        if (handleAsset(text)) return;
        const parsed = parseServerMessage(text);
        if (!parsed.ok) {
          setConnectionMessage(`收到无效牌桌消息：${parsed.error.message}`);
          return;
        }
        const message: ServerMessage = parsed.value;
        if (message.type === 'server.hello') {
          setConnectionMessage(`已连接 ${message.serviceName}`);
          return;
        }
        if (message.type === 'seat.offer') {
          setSeatOptions(message.seats.map((seat) => ({
            playerId: seat.playerId,
            wind: seat.currentWind,
            occupied: seat.occupied,
          })));
          return;
        }
        if (message.type === 'room.join-pending') {
          setConnectionState('awaiting-approval');
          setConnectionMessage('等待平板确认席位');
          return;
        }
        if (message.type === 'room.join-accepted') {
          emoteAssets.current?.clear();
    pendingJoinRef.current = null;
          snapshotRef.current = message.snapshot;
          setSnapshot(message.snapshot);
          ensureAssets(message.snapshot);
          setConnectionState('connected');
          setConnectionMessage('指令会实时同步到平板');
          void LanRoomNative.stopDiscovery().catch(() => undefined);
          return;
        }
        if (message.type === 'catalog.snapshot') {
          setSkillCards(message.cards);
          return;
        }
        if (message.type === 'state.snapshot') {
          const previous = snapshotRef.current;
          if (previous && previous.roomId === message.roomId && message.snapshot.revision < previous.revision) return;
          snapshotRef.current = message.snapshot;
          setSnapshot(message.snapshot);
          ensureAssets(message.snapshot);
          if (connectedRef.current) setConnectionState('connected');
          return;
        }
        if (message.type === 'timer.tick') {
          setSnapshot(current => {
            if (!current || current.roomId !== message.roomId || current.table.turnStartedAt !== message.turnStartedAt || current.table.turnPlayerId !== message.clock.playerId) return current;
            return { ...current, table: { ...current.table, clock: message.clock } };
          });
          return;
        }
        if (message.type === 'command.result') {
          const waiter = commandWaitersRef.current.get(message.commandId);
          if (waiter) {
            window.clearTimeout(waiter.timer);
            commandWaitersRef.current.delete(message.commandId);
            waiter.resolve(message);
          }
          return;
        }
        if (message.type === 'request.rejected') {
          setConnectionState(snapshotRef.current ? 'connected' : 'error');
          setConnectionMessage(message.message);
          return;
        }
        if (message.type === 'notification.push') {
          setSnapshot((current) => current ? {
            ...current,
            pendingNotifications: [...current.pendingNotifications.filter((entry) => entry.notificationId !== message.notification.notificationId), message.notification],
          } : current);
          return;
        }
        if (message.type === 'realtime.event') {
          setRealtimeEvent(message.event);
          return;
        }
        if (message.type === 'room.closed') {
          connectedRef.current = false;
          snapshotRef.current = null;
          setSnapshot(null);
          setConnectionState('disconnected');
          setConnectionMessage(message.reason);
          void LanRoomNative.disconnect().catch(() => undefined);
        }
      }));
    };
    let disposed = false;
    void installListeners().catch((cause: unknown) => {
      if (!disposed) setConnectionMessage(cause instanceof Error ? cause.message : '无法注册连接监听');
    }).finally(() => {
      if (disposed) void Promise.all(handles.splice(0).map((handle) => handle.remove()));
    });
    return () => {
      disposed = true;
      void Promise.all(handles.splice(0).map((handle) => handle.remove()));
    };
  }, [ensureAssets, handleAsset, sendClientMessage, supported, updateRooms, setRealtimeEvent]);

  const refreshRooms = useCallback(async () => {
    if (!supported) {
      setConnectionState('error');
      setConnectionMessage('局域网遥控需要已启用本地网络功能的 App');
      return;
    }
    setConnectionState('discovering');
    setConnectionMessage('正在寻找同一 Wi-Fi 下的平板');
    try {
      const result = await LanRoomNative.discoverRooms();
      updateRooms(result.rooms);
      window.setTimeout(() => setConnectionState((state) => state === 'discovering' ? 'idle' : state), 1800);
    } catch (cause) {
      setConnectionState('error');
      setConnectionMessage(cause instanceof Error ? cause.message : '自动发现失败，可手动输入 IP');
    }
  }, [supported, updateRooms]);

  const joinRoom = useCallback(async (input: RemoteJoinInput) => {
    if (!supported) throw new Error('请在支持本地网络的 App 中使用手机遥控');
    if (connectedRef.current) await LanRoomNative.disconnect();
    pendingJoinRef.current = { ...input, requestId: createProtocolId('req') };
    setSnapshot(null);
    snapshotRef.current = null;
    assetReceiver.current.clear(); assetAsked.current.clear();
    setConnectionState('connecting');
    setConnectionMessage('正在连接平板');
    await LanRoomNative.connect({ host: input.host, port: input.port });
  }, [supported]);

  const sendCommand = useCallback(async (command: ControllerCommand) => {
    const current = snapshotRef.current;
    if (!current || !connectedRef.current) throw new Error('牌桌尚未连接');
    if (command.kind === 'emote.send') await emoteAssets.current!.ensure('host', command.emoteId);
    const latest = snapshotRef.current;
    if (!latest || !connectedRef.current || latest.roomId !== current.roomId) throw new Error('房间已变化');
    const request = createCommandRequest(latest, command);
    return new Promise<CommandResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        commandWaitersRef.current.delete(request.commandId);
        reject(new Error('平板响应超时，请检查 Wi-Fi 连接'));
      }, 8_000);
      commandWaitersRef.current.set(request.commandId, { resolve, reject, timer });
      void sendClientMessage(request).catch((cause: unknown) => {
        window.clearTimeout(timer);
        commandWaitersRef.current.delete(request.commandId);
        reject(cause instanceof Error ? cause : new Error('指令发送失败'));
      });
    });
  }, [sendClientMessage]);

  const acknowledgeNotification = useCallback(async (notificationId: string) => {
    const current = snapshotRef.current;
    if (!current || !connectedRef.current) throw new Error('牌桌尚未连接');
    await sendClientMessage(createNotificationAck(current, notificationId));
  }, [sendClientMessage]);

  const disconnect = useCallback(async () => {
    emoteAssets.current?.clear();
    pendingJoinRef.current = null;
    connectedRef.current = false;
    for (const waiter of commandWaitersRef.current.values()) {
      window.clearTimeout(waiter.timer);
      waiter.reject(new Error('已离开牌桌'));
    }
    commandWaitersRef.current.clear();
    try {
      await LanRoomNative.disconnect();
    } catch {
      // A socket that already closed is equivalent to a successful disconnect.
    }
    snapshotRef.current = null;
    setSnapshot(null);
    setSeatOptions([]);
    setConnectionState('idle');
    setConnectionMessage('');
    setRealtimeEvent(null);
  }, [setRealtimeEvent]);

  return {
    supported,
    connectionState,
    connectionMessage,
    snapshot,
    discoveredRooms,
    skillCards,
    seatOptions,
    realtimeEvent,
    emoteEvents,
    joinRoom,
    refreshRooms,
    sendCommand,
    acknowledgeNotification,
    disconnect,
  };
}
