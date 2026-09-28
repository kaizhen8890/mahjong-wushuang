'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Dices,
  Eye,
  EyeOff,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Target,
  Trophy,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MahjongTile, HandDisplay } from './mahjong-tile';
import { HandCalculator } from './hand-calculator';
import { CharacterAvatar, CharacterPicker, savePreferredCharacter } from './character-picker';
import { RemoteTenpaiChecker } from './remote-tenpai-checker';
import { RepeatEmoteButton } from './repeat-emote-button';
import { FloatingEmote, TurnTimerDisplay } from './game-overlays';
import { PresentationOverlay, usePresentationSequence, RollingScore, WinParticles } from './table-presentation';
import { useCountdownSound, useRealtimeSound } from '@/app/hooks/use-game-audio';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  TILE_IDS,
  TILE_LABELS,
  WINDS,
  YAKU,
  type SkillCard,
  type Wind,
} from '@/lib/mahjong';
import {
  DEFAULT_LAN_PORT,
  MAX_LAN_PORT_OFFSET,
  isValidRoomCode,
  normalizeRoomCode,
  type CommandResult,
  type ControllerCommand,
  type ControllerEffect,
  type ControllerRealtimeEvent,
  type ControllerSkillCard,
  type DiscoveredRoom,
  type RemoteSnapshot,
  type RemoteWinDraft,
  type SkillDuration,
} from '@/lib/lan-protocol';
import { GAME_EMOTES } from '@/lib/emotes';

export type RemoteConnectionState =
  | 'idle'
  | 'discovering'
  | 'connecting'
  | 'awaiting-approval'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface RemoteSeatOption {
  playerId: string;
  wind: Wind;
  occupied?: boolean;
}

export interface RemoteJoinInput {
  host: string;
  port: number;
  roomId?: string;
  roomCode: string;
  desiredPlayerId?: string;
}

export type RemoteSkillCard = SkillCard | ControllerSkillCard;

export interface RemoteControllerProps {
  connectionState: RemoteConnectionState;
  snapshot: RemoteSnapshot | null;
  discoveredRooms: readonly DiscoveredRoom[];
  skillCards: readonly RemoteSkillCard[];
  seatOptions?: readonly RemoteSeatOption[];
  connectionMessage?: string;
  realtimeEvent?: ControllerRealtimeEvent | null;
  emoteEvents?: ControllerRealtimeEvent[];
  joinRoom: (input: RemoteJoinInput) => void | Promise<void>;
  refreshRooms: () => void | Promise<void>;
  sendCommand: (command: ControllerCommand) => CommandResult | void | Promise<CommandResult | void>;
  acknowledgeNotification: (notificationId: string) => void | Promise<void>;
  disconnect: () => void | Promise<void>;
  backToMode: () => void;
}

interface SkillDraft {
  cardId: number;
  targetPlayerIds: string[];
  duration: SkillDuration;
  faceDown: boolean;
  effectText: string;
}

interface RevealDraft {
  effectId: string;
  targetPlayerIds: string[];
  effectText: string;
}

const CONNECTION_LABELS: Record<RemoteConnectionState, string> = {
  idle: '等待加入',
  discovering: '正在寻找牌桌',
  connecting: '正在连接',
  'awaiting-approval': '等待平板确认',
  connected: '已连接',
  reconnecting: '正在重新连接',
  disconnected: '连接已断开',
  error: '连接失败',
};

const DURATION_LABELS: Record<SkillDuration, string> = {
  once: '单次结算',
  hand: '本局有效',
  match: '整场有效',
  manual: '手动解除',
};

const EFFECT_DIRECTION_LABELS: Record<ControllerEffect['direction'], string> = {
  incoming: '对我生效',
  self: '我对自己使用',
  team: '队伍共享',
  outgoing: '我对其他人使用',
  table: '牌桌环境',
  'hidden-own': '我的暗置陷阱',
};

const COMMON_YAKU_IDS = [
  'riichi',
  'menzen-tsumo',
  'ippatsu',
  'pinfu',
  'tanyao',
  'seat-wind', 'round-wind', 'haku', 'hatsu', 'chun',
  'chiitoi',
  'toitoi',
  'sanshoku',
  'ittsu',
  'honitsu',
  'chinitsu',
];

const YAKU_EXCLUSIVE_GROUPS = [
  ['kokushi', 'kokushi-13'],
  ['suuankou', 'suuankou-tanki'],
  ['chuuren', 'junsei-chuuren'],
  ['tenhou', 'chiihou'],
  ['riichi', 'double-riichi'],
  ['iipeikou', 'ryanpeikou'],
  ['chanta', 'junchan'],
  ['honitsu', 'chinitsu'],
];

const EMPTY_WIN_DRAFT: RemoteWinDraft = {
  winType: 'ron',
  tiles: [],
  closed: true,
  fu: 30,
  selectedYakuIds: [],
  yakuOverrides: {},
  dora: 0,
  uraDora: 0,
  akaDora: 0,
  flowerDora: 0,
  bonusHan: 0,
  extraPoints: 0,
};

function cardTypeCode(card: RemoteSkillCard) {
  return 'typeCode' in card ? card.typeCode : card.type.code;
}

function cardDescription(card: RemoteSkillCard) {
  return card.effectDescription || ('summary' in card ? card.summary : '按卡面说明执行');
}

function seatRelation(selfWind: Wind, targetWind: Wind, playerCount: number) {
  const selfIndex = WINDS.indexOf(selfWind);
  const targetIndex = WINDS.indexOf(targetWind);
  const difference = (targetIndex - selfIndex + playerCount) % playerCount;
  if (difference === 0) return '自己';
  if (difference === 1) return '下家';
  if (playerCount === 4 && difference === 2) return '对家';
  return '上家';
}

function tileText(tile: string) {
  if (TILE_LABELS[tile]) return TILE_LABELS[tile];
  const suit = tile.at(-1);
  const number = tile.slice(0, -1);
  const label = suit === 'm' ? '万' : suit === 'p' ? '筒' : suit === 's' ? '索' : '';
  return number === '0' ? `赤5${label}` : `${number}${label}`;
}

function numericInput(value: string, maximum = 100) {
  return Math.min(maximum, Math.max(0, Math.round(Number(value) || 0)));
}

function newSkillDraft(card?: RemoteSkillCard): SkillDraft {
  return {
    cardId: card?.id ?? 0,
    targetPlayerIds: [],
    duration: 'hand',
    faceDown: card ? cardTypeCode(card) === '陷' : false,
    effectText: card ? cardDescription(card) : '',
  };
}

function TargetPicker({
  snapshot,
  selected,
  includeSelf = false,
  onToggle,
}: {
  snapshot: RemoteSnapshot;
  selected: readonly string[];
  includeSelf?: boolean;
  onToggle: (playerId: string) => void;
}) {
  const playerCount = snapshot.targetOptions.length + 1;
  const targets = [
    ...(includeSelf
      ? [{ playerId: snapshot.self.playerId, wind: snapshot.self.wind, active: snapshot.self.participation === 'playing' }]
      : []),
    ...snapshot.targetOptions,
  ];

  return (
    <fieldset className="remote-target-grid">
      <legend className="remote-sr-only">选择受影响玩家</legend>
      {targets.map((target) => {
        const checked = selected.includes(target.playerId);
        const relation = seatRelation(snapshot.self.wind, target.wind, playerCount);
        return (
          <button
            className={`remote-target-button ${checked ? 'remote-is-selected' : ''}`}
            disabled={!target.active}
            key={target.playerId}
            type="button"
            aria-pressed={checked}
            onClick={() => onToggle(target.playerId)}
          >
            <span>{target.wind}</span>
            <strong>{relation}</strong>
            <small>{target.active ? (checked ? '已选择' : '点击选择') : '不在本局'}</small>
          </button>
        );
      })}
    </fieldset>
  );
}

function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  maximum = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  maximum?: number;
}) {
  return (
    <div className="remote-number-field">
      <span>{label}</span>
      <div>
        <button type="button" aria-label={`${label}减少`} onClick={() => onChange(Math.max(0, value - step))}><Minus /></button>
        <Input
          aria-label={label}
          inputMode="numeric"
          min={0}
          max={maximum}
          type="number"
          value={value || ''}
          placeholder="0"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange(numericInput(event.target.value, maximum))}
        />
        <button type="button" aria-label={`${label}增加`} onClick={() => onChange(Math.min(maximum, value + step))}><Plus /></button>
      </div>
    </div>
  );
}

export function RemoteController({
  connectionState,
  snapshot,
  discoveredRooms,
  skillCards,
  seatOptions,
  connectionMessage,
  realtimeEvent,
  emoteEvents,
  joinRoom,
  refreshRooms,
  sendCommand,
  acknowledgeNotification,
  disconnect,
  backToMode,
}: RemoteControllerProps) {
  const [joinDraft, setJoinDraft] = useState({
    host: '',
    port: DEFAULT_LAN_PORT,
    roomId: '',
    roomCode: '',
    desiredPlayerId: 'auto',
  });
  const [joinError, setJoinError] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [acknowledgingNoticeId, setAcknowledgingNoticeId] = useState('');
  const [locallyAcknowledgedNoticeIds, setLocallyAcknowledgedNoticeIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [skillOpen, setSkillOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillDraft, setSkillDraft] = useState<SkillDraft>(() => newSkillDraft(skillCards[0]));
  const skillConfigRef = useRef<HTMLElement | null>(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealDraft, setRevealDraft] = useState<RevealDraft | null>(null);
  const [winOpen, setWinOpen] = useState(false);
  const [tenpaiOpen, setTenpaiOpen] = useState(false);
  const [winStep, setWinStep] = useState(1);
  const winBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { winBodyRef.current?.scrollTo({ top: 0 }); }, [winStep]);
  const [showAllYaku, setShowAllYaku] = useState(false);
  const [winDraft, setWinDraft] = useState<RemoteWinDraft>(EMPTY_WIN_DRAFT);
  const [pointAdjustOpen, setPointAdjustOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [pointDraft, setPointDraft] = useState({
    direction: 'deduct' as 'add' | 'deduct',
    amount: 1000,
    counterpartyPlayerId: 'outside',
    reason: '技能／罚点调整',
  });
  const discoveryRequested = useRef(false);

  const online = connectionState === 'connected';
  const joining = connectionState === 'connecting' || connectionState === 'awaiting-approval';
  const selectedSkill = useMemo(
    () => skillCards.find((card) => card.id === skillDraft.cardId) ?? skillCards[0],
    [skillCards, skillDraft.cardId],
  );
  const filteredSkills = useMemo(() => {
    const query = skillSearch.trim().toLocaleLowerCase('zh-CN');
    return skillCards.filter((card) => {
      const haystack = `${card.name} ${cardTypeCode(card)} ${cardDescription(card)}`.toLocaleLowerCase('zh-CN');
      return !query || haystack.includes(query);
    });
  }, [skillCards, skillSearch]);

  const requiredNotification = snapshot?.pendingNotifications.find((notice) => notice.requiresAck && !locallyAcknowledgedNoticeIds.includes(notice.notificationId)) ?? null;
  const passiveNotification = snapshot?.pendingNotifications.find((notice) => !notice.requiresAck && !locallyAcknowledgedNoticeIds.includes(notice.notificationId)) ?? null;
  const feedbackIsError = /失败|拒绝|尚未|不能|无法|请选择|不足|断开/.test(feedback);
  const timerEnabled = Boolean(snapshot?.table.timerEnabled && !snapshot.table.handEnded);
  const turnClock = snapshot?.table.clock ?? { enabled: false, fixedRemaining: 0, extraRemaining: 0, totalRemaining: 0, usingExtra: false, expired: false };
  const presentation = usePresentationSequence(snapshot?.presentations);
  useRealtimeSound(realtimeEvent);
  useCountdownSound(Boolean(timerEnabled && turnClock.enabled && snapshot?.table.isMyTurn), turnClock.totalRemaining);
  const lastTurnTap = useRef(0);
  const timerStatus = snapshot?.table.timerPaused ? '已暂停' : snapshot?.table.turnState !== 'thinking' ? '等待摸牌' : undefined;

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 3600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (snapshot) {
      discoveryRequested.current = false;
      return;
    }
    if (connectionState !== 'idle' || discoveryRequested.current) return;
    discoveryRequested.current = true;
    void Promise.resolve(refreshRooms()).catch((error: unknown) => {
      setJoinError(error instanceof Error ? error.message : '自动寻找牌桌失败，可改用手动连接');
    });
  }, [connectionState, refreshRooms, snapshot]);

  const issueCommand = useCallback(async (label: string, command: ControllerCommand) => {
    if (!online) {
      setFeedback('牌桌尚未连接，请等待重新连接');
      return false;
    }
    setPendingAction(label);
    try {
      const result = await sendCommand(command);
      if (result?.status === 'rejected') throw new Error(result.message || '平板拒绝了这项操作');
      if (command.kind !== 'emote.send' && command.kind !== 'draw.confirm' && command.kind !== 'discard.confirm') setFeedback(result?.message || `${label}已同步到牌桌`);
      return true;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : `${label}发送失败`);
      return false;
    } finally {
      setPendingAction('');
    }
  }, [online, sendCommand]);

  const acknowledgeNotice = useCallback(async (notificationId: string, announce = true) => {
    setAcknowledgingNoticeId(notificationId);
    try {
      await acknowledgeNotification(notificationId);
      setLocallyAcknowledgedNoticeIds((ids) => ids.includes(notificationId) ? ids : [...ids, notificationId]);
      if (announce) setFeedback('已确认收到效果');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '确认失败，请重试');
    } finally {
      setAcknowledgingNoticeId('');
    }
  }, [acknowledgeNotification]);

  const submitJoin = useCallback(async () => {
    const host = joinDraft.host.trim();
    const roomCode = normalizeRoomCode(joinDraft.roomCode);
    if (!host) {
      setJoinError('请输入平板的局域网地址，或先从上方选择找到的牌桌');
      return;
    }
    if (!Number.isInteger(joinDraft.port) || joinDraft.port < DEFAULT_LAN_PORT || joinDraft.port > DEFAULT_LAN_PORT + MAX_LAN_PORT_OFFSET) {
      setJoinError(`端口必须是 ${DEFAULT_LAN_PORT} 到 ${DEFAULT_LAN_PORT + MAX_LAN_PORT_OFFSET} 之间的整数`);
      return;
    }
    if (!isValidRoomCode(roomCode)) {
      setJoinError('请输入平板显示的 6 位房间码');
      return;
    }
    setJoinError('');
    try {
      await joinRoom({
        host,
        port: joinDraft.port,
        roomId: joinDraft.roomId || undefined,
        roomCode,
        desiredPlayerId: joinDraft.desiredPlayerId === 'auto' ? undefined : joinDraft.desiredPlayerId,
      });
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : '无法加入这张牌桌');
    }
  }, [joinDraft, joinRoom]);

  if (!snapshot) {
    const chosenRoom = discoveredRooms.find((room) => room.roomId === joinDraft.roomId);
    const fallbackSeatCount = chosenRoom?.playerCount ?? 4;
    const shownSeats: readonly RemoteSeatOption[] = seatOptions?.length
      ? seatOptions
      : WINDS.slice(0, fallbackSeatCount).map((wind, index) => ({ playerId: `player-${index + 1}`, wind }));

    return (
      <main className="remote-shell remote-join-shell">
        <header className="remote-join-header">
          <button type="button" onClick={backToMode} aria-label="返回模式选择"><ArrowLeft /></button>
          <div><span>麻将无双</span><strong>加入牌桌遥控</strong></div>
          <span className={`remote-connection-pill remote-connection-${connectionState}`}>
            {connectionState === 'error' || connectionState === 'disconnected' ? <WifiOff /> : <Wifi />}
            {CONNECTION_LABELS[connectionState]}
          </span>
        </header>

        <div className="remote-join-body">
          <section className="remote-join-section">
            <div className="remote-section-heading">
              <div><span>自动发现</span><h1>选择同一 Wi-Fi 下的牌桌</h1></div>
              <Button
                className="remote-refresh-button"
                variant="outline"
                disabled={connectionState === 'discovering'}
                onClick={() => void refreshRooms()}
              >
                <RefreshCw className={connectionState === 'discovering' ? 'remote-is-spinning' : ''} />
                重新寻找
              </Button>
            </div>
            <div className="remote-room-list">
              {discoveredRooms.length ? discoveredRooms.map((room) => {
                const selected = joinDraft.roomId === room.roomId;
                return (
                  <button
                    className={`remote-room-card ${selected ? 'remote-is-selected' : ''}`}
                    key={room.roomId}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      const advertisedCode = normalizeRoomCode(room.serviceName.split('·').at(-1) ?? '');
                      setJoinDraft((draft) => ({
                        ...draft,
                        host: room.host,
                        port: room.port,
                        roomId: room.roomId,
                        roomCode: isValidRoomCode(advertisedCode) ? advertisedCode : draft.roomCode,
                      }));
                    }}
                  >
                    <Wifi />
                    <span><strong>{room.serviceName}</strong><small>{room.host}:{room.port} · {room.playerCount ? `${room.playerCount} 人桌` : '牌桌主机'}</small></span>
                    {selected ? <Check /> : <ChevronRight />}
                  </button>
                );
              }) : (
                <div className="remote-room-empty">
                  <WifiOff />
                  <strong>暂时没有找到牌桌</strong>
                  <span>确认手机和平板连接同一个 Wi-Fi，也可以在下方手动输入。</span>
                </div>
              )}
            </div>
          </section>

          <section className="remote-join-section remote-manual-join">
            <div className="remote-section-heading"><div><span>手动连接</span><h2>输入平板地址与房间码</h2></div></div>
            <div className="remote-join-fields">
              <Label>平板 IP 地址<Input inputMode="decimal" placeholder="例如 192.168.1.23" value={joinDraft.host} onChange={(event) => setJoinDraft((draft) => ({ ...draft, host: event.target.value, roomId: '' }))} /></Label>
              <Label>端口<Input inputMode="numeric" min={DEFAULT_LAN_PORT} max={DEFAULT_LAN_PORT + MAX_LAN_PORT_OFFSET} type="number" value={joinDraft.port} onChange={(event) => setJoinDraft((draft) => ({ ...draft, port: Number(event.target.value) }))} /></Label>
              <Label>房间码<Input autoCapitalize="characters" autoCorrect="off" maxLength={8} placeholder="6 位房间码" value={joinDraft.roomCode} onChange={(event) => setJoinDraft((draft) => ({ ...draft, roomCode: normalizeRoomCode(event.target.value) }))} /></Label>
              <Label>我的席位
                <Select value={joinDraft.desiredPlayerId} onValueChange={(value) => setJoinDraft((draft) => ({ ...draft, desiredPlayerId: String(value) }))}>
                  <SelectTrigger className="remote-select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">由平板分配</SelectItem>
                    {shownSeats.map((seat) => <SelectItem key={seat.playerId} value={seat.playerId} disabled={seat.occupied}>{seat.wind}家{seat.occupied ? ' · 已连接' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Label>
            </div>
            {(joinError || connectionMessage) && <p className={`remote-join-message ${joinError ? 'remote-is-error' : ''}`}>{joinError || connectionMessage}</p>}
            <Button className="remote-join-button" disabled={joining} onClick={() => void submitJoin()}>
              {joining ? <RefreshCw className="remote-is-spinning" /> : <Wifi />}
              {connectionState === 'awaiting-approval' ? '等待平板确认席位' : joining ? '正在加入牌桌' : '加入牌桌'}
            </Button>
          </section>
        </div>
      </main>
    );
  }

  const selectSkill = (card: RemoteSkillCard) => {
    const typeCode = cardTypeCode(card);
    setSkillDraft({
      cardId: card.id,
      targetPlayerIds: typeCode === '单' ? [snapshot.self.playerId] : [],
      duration: 'hand',
      faceDown: typeCode === '陷',
      effectText: cardDescription(card),
    });
    window.requestAnimationFrame(() => skillConfigRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const toggleSkillTarget = (playerId: string) => setSkillDraft((draft) => ({
    ...draft,
    targetPlayerIds: draft.targetPlayerIds.includes(playerId)
      ? draft.targetPlayerIds.filter((id) => id !== playerId)
      : [...draft.targetPlayerIds, playerId],
  }));
  const openSkillFlow = () => {
    const card = skillCards[0];
    setSkillSearch('');
    setSkillDraft({
      ...newSkillDraft(card),
      targetPlayerIds: card && cardTypeCode(card) === '单' ? [snapshot.self.playerId] : [],
    });
    setSkillOpen(true);
  };
  const submitSkill = async () => {
    if (!selectedSkill) return;
    const typeCode = cardTypeCode(selectedSkill);
    const targets = typeCode === '单'
      ? [snapshot.self.playerId]
      : typeCode === '环' || (typeCode === '陷' && skillDraft.faceDown)
        ? []
        : skillDraft.targetPlayerIds;
    if ((typeCode === '攻' || typeCode === '团' || (typeCode === '陷' && !skillDraft.faceDown)) && targets.length === 0) {
      setFeedback('请先选择实际受影响的玩家');
      return;
    }
    const accepted = await issueCommand(skillDraft.faceDown ? '暗置陷阱' : `发动「${selectedSkill.name}」`, {
      kind: 'skill.activate',
      input: {
        cardId: selectedSkill.id,
        targetPlayerIds: targets,
        duration: skillDraft.duration,
        faceDown: typeCode === '陷' && skillDraft.faceDown,
        effectText: skillDraft.effectText.trim() || cardDescription(selectedSkill),
      },
    });
    if (accepted) setSkillOpen(false);
  };

  const beginWin = () => {
    const loser = snapshot.targetOptions.find((target) => target.active);
    setWinDraft({
      ...EMPTY_WIN_DRAFT,
      loserPlayerId: loser?.playerId,
      selectedYakuIds: snapshot.self.riichi ? ['riichi'] : [],
    });
    setWinStep(1);
    setShowAllYaku(false);
    setWinOpen(true);
  };

  const visibleYaku = showAllYaku ? YAKU : YAKU.filter((yaku) => COMMON_YAKU_IDS.includes(yaku.id));
  const selectedYaku = YAKU.filter((yaku) => winDraft.selectedYakuIds.includes(yaku.id));
  const yakuman = selectedYaku.reduce((total, yaku) => total + (yaku.yakuman ?? 0), 0);
  const yakuHan = selectedYaku.reduce((total, yaku) => total + (
    yaku.yakuman ? 0 : winDraft.yakuOverrides[yaku.id] ?? (winDraft.closed ? yaku.closedHan : yaku.openHan)
  ), 0);
  const totalHan = yakuHan + winDraft.dora + winDraft.uraDora + winDraft.akaDora + winDraft.flowerDora + winDraft.bonusHan;

  const submitWin = async () => {
    if (winDraft.winType === 'ron' && !winDraft.loserPlayerId) {
      setFeedback('荣和需要选择放铳者');
      setWinStep(1);
      return;
    }
    if (yakuman === 0 && yakuHan + winDraft.bonusHan === 0) {
      setFeedback('请选择至少一个役，或填写技能加番');
      setWinStep(2);
      return;
    }
    const accepted = await issueCommand('和牌结算', { kind: 'win.commit', draft: winDraft });
    if (accepted) setWinOpen(false);
  };

  const submitPointAdjustment = async () => {
    const amount = Math.max(1, Math.min(1_000_000, Math.round(pointDraft.amount)));
    const accepted = await issueCommand(pointDraft.direction === 'add' ? '加点' : '扣点', {
      kind: 'score.adjust',
      input: {
        direction: pointDraft.direction,
        amount,
        counterpartyPlayerId: pointDraft.counterpartyPlayerId === 'outside' ? undefined : pointDraft.counterpartyPlayerId,
        reason: pointDraft.reason.trim() || '技能／罚点调整',
      },
    });
    if (accepted) setPointAdjustOpen(false);
  };

  return (
    <main className="remote-shell remote-control-shell">
      <header className={`remote-controller-header ${snapshot.self.participation === 'won' && !(presentation.event?.playerId === snapshot.self.playerId && presentation.phase === 'intro') ? 'is-won' : ''}`}>
        <div className="remote-self-identity">
          <button type="button" className="remote-character-button" onClick={() => setCharacterOpen(true)} aria-label="选择我的角色"><CharacterAvatar choice={snapshot.self.character} /></button>
          <div><small>我的遥控器</small><strong>{snapshot.self.name}</strong></div>
        </div>
<div className={`remote-self-score ${snapshot.self.participation === 'won' ? 'is-won' : ''}`}><span>当前点数</span><RollingScore value={snapshot.self.score} playerId={snapshot.self.playerId} sequence={presentation} /><WinParticles active={presentation.event?.kind === 'win' && presentation.event.playerId === snapshot.self.playerId && presentation.phase === 'impact'} /></div>
        <button className="remote-disconnect-button" type="button" onClick={() => void disconnect()} aria-label="离开牌桌"><LogOut /></button>
      </header>
      {characterOpen && <CharacterPicker value={snapshot.self.character} onSelect={choice => { void issueCommand('选择角色', { kind: 'character.select', character: choice }).then(accepted => { if (accepted) savePreferredCharacter(choice, 'physical'); }); }} onClose={() => setCharacterOpen(false)} />}

      <div className={`remote-connection-banner remote-connection-${connectionState}`}>
        {online ? <Wifi /> : <WifiOff />}
        <span>{CONNECTION_LABELS[connectionState]}{connectionMessage ? ` · ${connectionMessage}` : ''}</span>
      </div>

      <section className="remote-controller-body">
        <div className="remote-round-strip">
          <span>{snapshot.table.roundWind}{snapshot.table.handNumber}局 · {snapshot.table.honba}本场</span>
          <strong>牌山 {snapshot.table.wallCount}</strong>
          <span>{snapshot.table.isMyTurn ? '当前操作：我' : '等待现场操作'}</span>
        </div>

        <div className="remote-command-grid">
          <button
            className={`remote-command remote-command-draw ${snapshot.controls.canDiscard ? 'is-discard-ready' : ''}`}
            type="button"
            disabled={!online || !(snapshot.controls.canDraw || snapshot.controls.canDiscard) || Boolean(pendingAction)}
            onClick={() => {
              if (Date.now() - lastTurnTap.current < 500) return;
              lastTurnTap.current = Date.now();
              void issueCommand('摸牌出牌', { kind: snapshot.controls.canDiscard ? 'discard.confirm' : 'draw.confirm', turnStartedAt: snapshot.table.turnStartedAt ?? 0 });
            }}
          >
            <Dices />
            <span><strong>{pendingAction === '摸牌出牌' ? '正在同步…' : snapshot.controls.canDiscard ? '我已出牌' : '确认摸牌'}</strong><small>{snapshot.table.timerPaused ? '计时已暂停，等待平板恢复' : snapshot.controls.canDiscard ? '出牌后点这里，停止本巡计时' : '牌山 −1，开始我的这巡'}</small></span>
            {timerEnabled && <TurnTimerDisplay
              compact
              statusLabel={timerStatus}
              playerLabel={snapshot.table.isMyTurn ? '我的思考时间' : `${snapshot.table.turnWind ?? ''}家计时`}
              fixedRemaining={turnClock.fixedRemaining}
              extraRemaining={turnClock.extraRemaining}
              usingExtra={turnClock.usingExtra}
              expired={turnClock.expired}
            />}
          </button>

          <button
            className="remote-command remote-command-riichi"
            type="button"
            disabled={!online || !snapshot.controls.canRiichi || Boolean(pendingAction)}
            onClick={() => void issueCommand('立直', { kind: 'riichi.declare' })}
          >
            <CircleDollarSign />
            <span><strong>{snapshot.self.riichi ? '已立直' : '立直'}</strong></span>
          </button>

          <button className="remote-command remote-command-win" type="button" disabled={!online || !snapshot.controls.canWin || Boolean(pendingAction)} onClick={beginWin}>
            <Trophy />
            <span><strong>和牌</strong></span>
          </button>

          <button className="remote-command remote-command-tenpai" type="button" onClick={() => setTenpaiOpen(true)}>
            <Search />
            <span><strong>查看听牌</strong></span>
          </button>

          <button className="remote-command remote-command-skill" type="button" disabled={!online || !snapshot.table.wushuang || !snapshot.controls.canUseSkill || Boolean(pendingAction)} onClick={openSkillFlow}>
            <Sparkles />
            <span><strong>发动技能</strong></span>
          </button>

          <button className="remote-command remote-command-points" type="button" disabled={!online || snapshot.self.participation !== 'playing' || Boolean(pendingAction)} onClick={() => setPointAdjustOpen(true)}>
            <Plus />
            <span><strong>加点/扣点</strong></span>
          </button>

          <button className="remote-command remote-command-effects" type="button" onClick={() => setEffectsOpen(true)}>
            <ShieldCheck />
            <span><strong>我的效果</strong></span>
            {snapshot.effects.length > 0 && <b>{snapshot.effects.length}</b>}
          </button>
        </div>

        {snapshot.table.handEnded && <div className="remote-state-note"><AlertTriangle /><span><strong>本局已经结算</strong><small>等待平板开始下一局。</small></span></div>}
        {snapshot.self.participation !== 'playing' && <div className="remote-state-note"><ShieldCheck /><span><strong>{snapshot.self.participation === 'won' ? '本局已经和牌' : '当前已退出本局'}</strong><small>仍可查看收到的技能效果与牌桌消息。</small></span></div>}
      </section>

      <footer className="remote-controller-footer">
        <button type="button" onClick={() => { void Promise.resolve(disconnect()).finally(backToMode); }}><ChevronLeft /> 模式选择</button>
        <span>{pendingAction ? `${pendingAction}发送中` : `房间 ${snapshot.roomId.slice(-6)}`}</span>
        <span>修订 {snapshot.revision}</span>
      </footer>

      <button className="remote-emote-launcher" type="button" aria-label="发送表情" onClick={() => setEmoteOpen(true)}><Smile /></button>

      {feedback && <output className={`remote-feedback ${feedbackIsError ? 'remote-is-error' : ''}`}>{feedbackIsError ? <AlertTriangle /> : <Check />}{feedback}</output>}
      {passiveNotification && <output className="remote-passive-notice"><Sparkles /><span><strong>{passiveNotification.title}</strong><small>{passiveNotification.body}</small></span><button type="button" disabled={acknowledgingNoticeId === passiveNotification.notificationId} aria-label="收起消息" onClick={() => void acknowledgeNotice(passiveNotification.notificationId, false)}><Check /></button></output>}
      <FloatingEmote events={emoteEvents} />
      <PresentationOverlay sequence={presentation} />

      <Drawer open={emoteOpen} onOpenChange={setEmoteOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-emote-drawer">
          <DrawerHeader><DrawerTitle>发送表情</DrawerTitle><DrawerDescription>点击发送，长按连续发送；松手或滑动列表即可停止。</DrawerDescription></DrawerHeader>
          <div className="remote-emote-grid">
            {GAME_EMOTES.map((emote) => <RepeatEmoteButton key={emote.id} emote={emote} disabled={!online} onSend={() => issueCommand(`发送「${emote.label}」`, { kind: 'emote.send', emoteId: emote.id })} />)}
          </div>
          <DrawerFooter className="remote-flow-footer remote-emote-footer"><Button variant="outline" onClick={() => setEmoteOpen(false)}>收起</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={skillOpen} onOpenChange={setSkillOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-skill-drawer">
          <DrawerHeader><DrawerTitle>发动技能卡</DrawerTitle><DrawerDescription>使用者固定为你自己；公开技能会同步到牌桌和其他玩家。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body">
            <Label className="remote-search-field"><Search /> <Input placeholder="搜索卡名或效果" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} /></Label>
            <div className="remote-skill-list">
              {filteredSkills.map((card) => {
                const selected = card.id === selectedSkill?.id;
                return <button className={selected ? 'remote-is-selected' : ''} type="button" key={card.id} onClick={() => selectSkill(card)}><span>{cardTypeCode(card)}</span><div><strong>{card.name}</strong><small>{cardDescription(card)}</small></div>{selected && <Check />}</button>;
              })}
              {!filteredSkills.length && <p className="remote-empty-copy">没有找到符合条件的技能卡。</p>}
            </div>

            {selectedSkill && <section className="remote-skill-config" ref={skillConfigRef}>
              <div className="remote-selected-skill"><span>{cardTypeCode(selectedSkill)}</span><div><strong>{selectedSkill.name}</strong><p>{cardDescription(selectedSkill)}</p></div></div>
              {cardTypeCode(selectedSkill) === '陷' && <Label className="remote-check-row"><Checkbox checked={skillDraft.faceDown} onCheckedChange={(checked) => setSkillDraft((draft) => ({ ...draft, faceDown: checked, targetPlayerIds: checked ? [] : draft.targetPlayerIds }))} /><span><strong>暗置陷阱</strong><small>暗置时不公开卡名与效果，触发时再选择目标。</small></span></Label>}
              {(cardTypeCode(selectedSkill) === '团' || cardTypeCode(selectedSkill) === '攻' || (cardTypeCode(selectedSkill) === '陷' && !skillDraft.faceDown)) && <div className="remote-config-block"><h3>实际受影响玩家</h3><TargetPicker snapshot={snapshot} selected={skillDraft.targetPlayerIds} includeSelf={cardTypeCode(selectedSkill) === '团'} onToggle={toggleSkillTarget} /></div>}
              {cardTypeCode(selectedSkill) === '单' && <p className="remote-inline-note"><Target />这张卡只对你自己生效，但发动记录会公开。</p>}
              {cardTypeCode(selectedSkill) === '环' && <p className="remote-inline-note"><Target />这张卡作用于整张牌桌。</p>}
              <div className="remote-config-grid">
                <Label>持续范围<Select value={skillDraft.duration} onValueChange={(value) => setSkillDraft((draft) => ({ ...draft, duration: String(value) as SkillDuration }))}><SelectTrigger className="remote-select-trigger"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DURATION_LABELS).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></Label>
                <Label>显示给玩家的效果说明<Textarea maxLength={500} value={skillDraft.effectText} onChange={(event) => setSkillDraft((draft) => ({ ...draft, effectText: event.target.value }))} /></Label>
              </div>
            </section>}
          </div>
          <DrawerFooter className="remote-flow-footer"><Button variant="outline" onClick={() => setSkillOpen(false)}>取消</Button><Button disabled={!selectedSkill || Boolean(pendingAction)} onClick={() => void submitSkill()}><Send />{skillDraft.faceDown ? '确认暗置' : '确认发动'}</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={pointAdjustOpen} onOpenChange={setPointAdjustOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-points-drawer">
          <DrawerHeader><DrawerTitle>加点 / 扣点</DrawerTitle><DrawerDescription>用于技能费用、技能奖励或现场罚点。可以选择由另一家转移，或直接作为场外增减。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body remote-points-body">
            <div className="remote-choice-pair">
              <button className={pointDraft.direction === 'deduct' ? 'remote-is-selected' : ''} type="button" aria-pressed={pointDraft.direction === 'deduct'} onClick={() => setPointDraft((draft) => ({ ...draft, direction: 'deduct' }))}>从我扣点<small>支付技能费用或罚点</small></button>
              <button className={pointDraft.direction === 'add' ? 'remote-is-selected' : ''} type="button" aria-pressed={pointDraft.direction === 'add'} onClick={() => setPointDraft((draft) => ({ ...draft, direction: 'add' }))}>给我加点<small>领取技能奖励</small></button>
            </div>
            <NumberStepper label="调整点数" value={pointDraft.amount} step={100} maximum={1_000_000} onChange={(amount) => setPointDraft((draft) => ({ ...draft, amount }))} />
            <div className="remote-point-presets" aria-label="常用点数">
              {[100, 500, 1000, 2000, 4000, 8000].map((amount) => <button className={pointDraft.amount === amount ? 'remote-is-selected' : ''} type="button" key={amount} onClick={() => setPointDraft((draft) => ({ ...draft, amount }))}>{amount.toLocaleString('zh-CN')}</button>)}
            </div>
            <Label>点数来源 / 去向<Select value={pointDraft.counterpartyPlayerId} onValueChange={(value) => setPointDraft((draft) => ({ ...draft, counterpartyPlayerId: String(value) }))}><SelectTrigger className="remote-select-trigger"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="outside">场外增减（不改其他玩家）</SelectItem>{snapshot.targetOptions.filter((target) => target.active).map((target) => <SelectItem key={target.playerId} value={target.playerId}>{target.wind}家 · {seatRelation(snapshot.self.wind, target.wind, snapshot.targetOptions.length + 1)}</SelectItem>)}</SelectContent></Select></Label>
            <Label>原因<Input maxLength={80} value={pointDraft.reason} onChange={(event) => setPointDraft((draft) => ({ ...draft, reason: event.target.value }))} /></Label>
            <p className="remote-inline-note"><CircleDollarSign />选择另一家时会做等额点数转移；选择场外增减时只修改你的点数。</p>
          </div>
          <DrawerFooter className="remote-flow-footer"><Button variant="outline" onClick={() => setPointAdjustOpen(false)}>取消</Button><Button disabled={!pointDraft.amount || Boolean(pendingAction)} onClick={() => void submitPointAdjustment()}><Send />确认同步</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={effectsOpen} onOpenChange={setEffectsOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-effects-drawer">
          <DrawerHeader><DrawerTitle>我的场上效果</DrawerTitle><DrawerDescription>只列出与你有关的技能和牌桌环境，不显示其他玩家名牌。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body remote-effect-list">
            {snapshot.effects.map((effect) => <article className={`remote-effect-card remote-effect-${effect.direction}`} key={effect.effectId}>
              <div className="remote-effect-heading"><span>{effect.hidden ? <EyeOff /> : <Eye />}{EFFECT_DIRECTION_LABELS[effect.direction]}</span><small>{DURATION_LABELS[effect.duration]}</small></div>
              <h3>{effect.hidden ? '暗置陷阱' : effect.cardName}</h3>
              <p>{effect.hidden ? '只有你能看到这张暗置记录；实际触发时再揭示。' : effect.effectText}</p>
              <small>{effect.sourceLabel}</small>
              <div className="remote-effect-actions">
                {effect.direction === 'hidden-own' && <Button variant="outline" onClick={() => { setRevealDraft({ effectId: effect.effectId, targetPlayerIds: [], effectText: effect.effectText }); setEffectsOpen(false); setRevealOpen(true); }}><Eye /> 揭示并发动</Button>}
                {(effect.direction === 'self' || effect.direction === 'outgoing') && <Button variant="destructive" disabled={Boolean(pendingAction)} onClick={() => void issueCommand('解除技能效果', { kind: 'effect.resolve-own', effectId: effect.effectId })}>结束效果</Button>}
              </div>
            </article>)}
            {!snapshot.effects.length && <div className="remote-empty-copy"><ShieldCheck /><strong>当前没有与你有关的效果</strong><span>有人对你发动技能时，这里会立即更新。</span></div>}
          </div>
          <DrawerFooter className="remote-flow-footer"><Button variant="outline" onClick={() => setEffectsOpen(false)}>返回指令区</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent className="remote-dialog remote-reveal-dialog">
          <DialogHeader><DialogTitle>揭示并发动陷阱</DialogTitle><DialogDescription>选择实际受影响玩家；确认后所有玩家都会看到公开记录。</DialogDescription></DialogHeader>
          {revealDraft && <div className="remote-dialog-body"><TargetPicker snapshot={snapshot} selected={revealDraft.targetPlayerIds} onToggle={(playerId) => setRevealDraft((draft) => draft ? ({ ...draft, targetPlayerIds: draft.targetPlayerIds.includes(playerId) ? draft.targetPlayerIds.filter((id) => id !== playerId) : [...draft.targetPlayerIds, playerId] }) : draft)} /><Label>公开效果说明<Textarea maxLength={500} value={revealDraft.effectText} onChange={(event) => setRevealDraft((draft) => draft ? ({ ...draft, effectText: event.target.value }) : draft)} /></Label></div>}
          <DialogFooter className="remote-dialog-footer"><Button variant="outline" onClick={() => setRevealOpen(false)}>继续暗置</Button><Button disabled={!revealDraft?.targetPlayerIds.length || Boolean(pendingAction)} onClick={() => { if (!revealDraft) return; void issueCommand('揭示陷阱', { kind: 'skill.reveal', input: revealDraft }).then((accepted) => { if (accepted) setRevealOpen(false); }); }}><Eye /> 确认发动</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={winOpen} onOpenChange={setWinOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-win-drawer">
          <DrawerHeader><DrawerTitle>手机和牌录入</DrawerTitle><DrawerDescription>和牌者固定为你自己；平板会重新计算点数并直接同步结算。</DrawerDescription></DrawerHeader>
          <div className="remote-stepper" aria-label={`和牌录入第 ${winStep} 步`}><span className={winStep >= 1 ? 'remote-is-active' : ''}>1</span><i /><span className={winStep >= 2 ? 'remote-is-active' : ''}>2</span><i /><span className={winStep >= 3 ? 'remote-is-active' : ''}>3</span></div>
          <div ref={winBodyRef} className="remote-flow-body remote-win-body">
            {winStep === 1 && <section className="remote-win-step">
              <h3>和牌方式</h3>
              <div className="remote-choice-pair"><button className={winDraft.winType === 'ron' ? 'remote-is-selected' : ''} type="button" aria-pressed={winDraft.winType === 'ron'} onClick={() => setWinDraft((draft) => ({ ...draft, winType: 'ron', selectedYakuIds: draft.selectedYakuIds.filter((id) => !['menzen-tsumo', 'haitei', 'rinshan'].includes(id)) }))}>荣和<small>由一名玩家支付</small></button><button className={winDraft.winType === 'tsumo' ? 'remote-is-selected' : ''} type="button" aria-pressed={winDraft.winType === 'tsumo'} onClick={() => setWinDraft((draft) => ({ ...draft, winType: 'tsumo', loserPlayerId: undefined, selectedYakuIds: draft.selectedYakuIds.filter((id) => !['houtei', 'chankan'].includes(id)) }))}>自摸<small>其他玩家共同支付</small></button></div>
              {winDraft.winType === 'ron' && <div className="remote-config-block"><h3>放铳风位</h3><TargetPicker snapshot={snapshot} selected={winDraft.loserPlayerId ? [winDraft.loserPlayerId] : []} onToggle={(playerId) => setWinDraft((draft) => ({ ...draft, loserPlayerId: playerId }))} /></div>}
              <div className="remote-choice-pair"><button className={winDraft.closed ? 'remote-is-selected' : ''} type="button" aria-pressed={winDraft.closed} onClick={() => setWinDraft((draft) => ({ ...draft, closed: true }))}>门清</button><button className={!winDraft.closed ? 'remote-is-selected' : ''} type="button" aria-pressed={!winDraft.closed} onClick={() => setWinDraft((draft) => ({ ...draft, closed: false, selectedYakuIds: draft.selectedYakuIds.filter((id) => { const yaku = YAKU.find((candidate) => candidate.id === id); return Boolean(yaku?.yakuman || (yaku?.openHan ?? 0) > 0); }) }))}>副露</button></div>
              <Label>符数<Select value={String(winDraft.fu)} onValueChange={(value) => setWinDraft((draft) => ({ ...draft, fu: Number(value) }))}><SelectTrigger className="remote-select-trigger"><SelectValue /></SelectTrigger><SelectContent>{[20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((fu) => <SelectItem key={fu} value={String(fu)}>{fu} 符</SelectItem>)}</SelectContent></Select></Label>
            </section>}

            {winStep === 2 && <section className="remote-win-step">
              <div className="remote-step-heading"><div><h3>录入牌张</h3><p>牌张为可选记录，可超过 14 张；点击已选牌可移除。</p></div><strong>{winDraft.tiles.length} 张</strong></div>
              <div className="remote-selected-tiles">{winDraft.tiles.map((tile, index) => <button type="button" key={`${tile}-${index}`} onClick={() => setWinDraft((draft) => ({ ...draft, tiles: draft.tiles.filter((_, tileIndex) => tileIndex !== index) }))} aria-label={tileText(tile)}><MahjongTile tile={tile}/></button>)}{!winDraft.tiles.length && <span>在这里录入牌张，下方系统自动识别；也可不录牌，手动选择役种。</span>}</div>
              <div className="remote-tile-picker">
                {[
                  ['万子', ['0m', ...TILE_IDS.filter((tile) => tile.endsWith('m'))]],
                  ['筒子', ['0p', ...TILE_IDS.filter((tile) => tile.endsWith('p'))]],
                  ['索子', ['0s', ...TILE_IDS.filter((tile) => tile.endsWith('s'))]],
                  ['字牌', TILE_IDS.filter((tile) => tile.endsWith('z'))],
                ].map(([label, tiles]) => <div key={label as string}><span>{label as string}</span><section>{(tiles as string[]).map((tile) => <button type="button" key={tile} onClick={() => setWinDraft((draft) => ({ ...draft, tiles: [...draft.tiles, tile] }))} aria-label={tileText(tile)}><MahjongTile tile={tile}/></button>)}</section></div>)}
              </div>
            </section>}
            <div hidden={winStep !== 2}><HandCalculator tiles={winDraft.tiles} closed={winDraft.closed} winType={winDraft.winType} seatWind={snapshot.self.wind} roundWind={snapshot.table.roundWind} selected={winDraft.selectedYakuIds} bonusHan={winDraft.dora+winDraft.uraDora+winDraft.akaDora+winDraft.flowerDora+winDraft.bonusHan} overrides={winDraft.yakuOverrides} openTanyao={snapshot.table.openTanyao} kiriage={snapshot.table.kiriageMangan} kazoe={snapshot.table.kazoeYakuman} onApply={(ids,fu,closed,analysis)=>setWinDraft(form=>JSON.stringify(form.analysis)===JSON.stringify(analysis)&&JSON.stringify(form.selectedYakuIds)===JSON.stringify(ids)&&(fu===undefined||fu===form.fu)&&(closed===undefined||closed===form.closed)?form:{...form,analysis,selectedYakuIds:ids,fu:fu??form.fu,closed:closed??form.closed})}/></div>
            {winStep === 2 && <section className="remote-win-step">
              <div className="remote-yaku-heading"><h3>役种</h3><button type="button" onClick={() => setShowAllYaku((shown) => !shown)}>{showAllYaku ? '仅显示常用役' : '显示全部役种'}</button></div>
              <div className="remote-yaku-grid">{visibleYaku.map((yaku) => {
                const unavailable =
                  (!winDraft.closed && !yaku.yakuman && yaku.openHan === 0) ||
                  (['menzen-tsumo', 'haitei', 'rinshan'].includes(yaku.id) && winDraft.winType !== 'tsumo') ||
                  (['houtei', 'chankan'].includes(yaku.id) && winDraft.winType !== 'ron');
                const checked = !unavailable && winDraft.selectedYakuIds.includes(yaku.id);
                const defaultHan = winDraft.closed ? yaku.closedHan : yaku.openHan;
                return <button className={checked ? 'remote-is-selected' : ''} disabled={unavailable} type="button" key={yaku.id} aria-pressed={checked} onClick={() => setWinDraft((draft) => { const exclusiveGroup = YAKU_EXCLUSIVE_GROUPS.find((group) => group.includes(yaku.id)) ?? []; const retained = draft.selectedYakuIds.filter((id) => id !== yaku.id && (checked || !exclusiveGroup.includes(id))); return { ...draft, selectedYakuIds: checked ? retained : [...retained, yaku.id] }; })}><strong>{yaku.name}</strong><small>{yaku.yakuman ? `${yaku.yakuman} 倍役满` : `${defaultHan} 番`}</small></button>;
              })}</div>
              {selectedYaku.filter((yaku) => !yaku.yakuman).length > 0 && <div className="remote-yaku-overrides"><h3>技能修改番数</h3>{selectedYaku.filter((yaku) => !yaku.yakuman).map((yaku) => { const defaultHan = winDraft.closed ? yaku.closedHan : yaku.openHan; return <Label key={yaku.id}>{yaku.name}<Input inputMode="numeric" min={0} max={30} type="number" value={winDraft.yakuOverrides[yaku.id] ?? defaultHan} onChange={(event) => setWinDraft((draft) => ({ ...draft, yakuOverrides: { ...draft.yakuOverrides, [yaku.id]: numericInput(event.target.value, 30) } }))} /></Label>; })}</div>}
            </section>}

            {winStep === 3 && <section className="remote-win-step">
              <h3>宝牌与最终确认</h3><HandDisplay tiles={winDraft.tiles}/>
              <div className="remote-number-grid">
                <NumberStepper label="宝牌" value={winDraft.dora} onChange={(value) => setWinDraft((draft) => ({ ...draft, dora: value }))} />
                <NumberStepper label="里宝牌" value={winDraft.uraDora} onChange={(value) => setWinDraft((draft) => ({ ...draft, uraDora: value }))} />
                <NumberStepper label="赤宝牌" value={winDraft.akaDora} onChange={(value) => setWinDraft((draft) => ({ ...draft, akaDora: value }))} />
                <NumberStepper label="花 / 北" value={winDraft.flowerDora} onChange={(value) => setWinDraft((draft) => ({ ...draft, flowerDora: value }))} />
                <NumberStepper label="技能加番" value={winDraft.bonusHan} onChange={(value) => setWinDraft((draft) => ({ ...draft, bonusHan: value }))} />
              </div>
              <div className="remote-extra-points">
                <NumberStepper label="技能额外得点" value={winDraft.extraPoints} step={100} maximum={1_000_000} onChange={(value) => setWinDraft((draft) => ({ ...draft, extraPoints: value }))} />
                <small>填写“恭喜发财”等固定增加的和牌点数。荣和由放铳者支付，自摸由其余玩家合计支付。</small>
              </div>
              <div className="remote-win-summary">
                <span>{snapshot.self.wind}家 · {snapshot.self.name}</span>
                <strong>{yakuman ? `${yakuman} 倍役满` : `${totalHan} 番 ${winDraft.fu} 符`}</strong>
                <p>{winDraft.winType === 'tsumo' ? '自摸' : `荣和 · ${snapshot.targetOptions.find((target) => target.playerId === winDraft.loserPlayerId)?.wind ?? '未选'}家放铳`} · {winDraft.closed ? '门清' : '副露'} · {selectedYaku.map((yaku) => yaku.name).join('、') || '尚未选择役种'}</p>
                <small>{winDraft.analysis?.automatic ? '本次采用自动识别的役与符；平板会复核完整牌姿后结算。' : '本次按当前勾选的役与符数结算。请确认上方番数、符数及役种。'}</small>
              </div>
            </section>}
          </div>
          <DrawerFooter className="remote-flow-footer remote-win-footer">
            {winStep > 1 && <Button variant="outline" onClick={() => setWinStep((step) => Math.max(1, step - 1))}><ChevronLeft /> 上一步</Button>}
            {winStep < 3 ? <Button onClick={() => setWinStep((step) => Math.min(3, step + 1))}>下一步 <ChevronRight /></Button> : <Button disabled={Boolean(pendingAction)} onClick={() => void submitWin()}><Trophy /> 确认和牌并结算</Button>}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={tenpaiOpen} onOpenChange={setTenpaiOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-tenpai-drawer">
          <DrawerHeader><DrawerTitle>输入牌型查看听牌</DrawerTitle><DrawerDescription>听牌张只在这部手机上计算，不发送牌姿给平板。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body"><RemoteTenpaiChecker players={(snapshot.targetOptions.length + 1) as 3 | 4} /></div>
        </DrawerContent>
      </Drawer>

      <Dialog open={Boolean(requiredNotification) && !presentation.event}>
        <DialogContent className="remote-dialog remote-impact-dialog" showCloseButton={false}>
          {requiredNotification && <>
            <div className="remote-impact-icon"><AlertTriangle /></div>
            <DialogHeader><DialogTitle>{requiredNotification.title}</DialogTitle><DialogDescription>{requiredNotification.sourceLabel ? `${requiredNotification.sourceLabel}向你发送了需要确认的牌桌效果` : '你收到了需要确认的牌桌效果'}</DialogDescription></DialogHeader>
            <div className="remote-impact-copy"><p>{requiredNotification.body}</p>{requiredNotification.durationLabel && <span>{requiredNotification.durationLabel}</span>}</div>
            <DialogFooter className="remote-dialog-footer"><Button disabled={acknowledgingNoticeId === requiredNotification.notificationId} onClick={() => void acknowledgeNotice(requiredNotification.notificationId)}><Check />{acknowledgingNoticeId === requiredNotification.notificationId ? '正在确认…' : '我已了解'}</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </main>
  );
}
