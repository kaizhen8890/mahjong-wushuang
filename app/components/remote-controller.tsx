'use client';
import { GodSkillWorkbench } from './god-skill-workbench';
import { NfcIntentTarget } from './nfc-card-scanner';
import { nfcCardArtwork } from '@/lib/nfc-cards';
import { godCardCost } from '@/lib/god-card-cost';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Dices,
  Eye,
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

import { EffectSummary } from './effect-summary';
import { Button } from '@/components/ui/button';
import { HandDisplay } from './mahjong-tile';
import { HandCalculator, type HandCalculatorDraft } from './hand-calculator';
import { RemoteWinTileEntry } from './remote-win-tile-entry';
import './remote-win-entry.css';
import { SkillCatalogPicker, SkillCardArt } from './skill-catalog-picker';
import './point-flows.css';
import './room-record-panels.css';
import { WushuangWorkbench } from './wushuang-workbench';
import { isWushuangCard } from '@/lib/wushuang-session';
import { CharacterAvatar, CharacterPicker, savePreferredCharacter } from './character-picker';
import { RemoteTenpaiChecker } from './remote-tenpai-checker';
import { EmotePicker } from './emote-picker';
import { EnvironmentFields, EnvironmentBonusField, EnvironmentControls, ExperiencePresentation, NightMode } from './skill-experience';
import { CoinDecisionDialog } from './coin-decision-dialog';
import { usesDecisionCoin } from '@/lib/skill-experience';
import type { CoinDecision } from '@/lib/skill-random';
import type { EnvironmentOptions } from '@/lib/skill-experience';
import { useSilenceMode } from '@/app/hooks/use-night-brightness';
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
  activationId?: string;
  environment?: EnvironmentOptions;
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
  bonusHan: 0, environmentNumberCount: 0,
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

function numericInput(value: string, maximum = 100) {
  return Math.min(maximum, Math.max(0, Math.round(Number(value) || 0)));
}

function newSkillDraft(card?: RemoteSkillCard): SkillDraft {
  return {
    activationId: crypto.randomUUID(), environment: {},
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
  const [coinPrompt, setCoinPrompt] = useState<'activation' | 'reveal' | null>(null);
  const [godCostConfirmed, setGodCostConfirmed] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [wushuangOpen, setWushuangOpen] = useState(false);
  const [godOpen, setGodOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillStep, setSkillStep] = useState<'choose' | 'configure'>('choose');
  const commandPending = useRef(false);
  const [commandError, setCommandError] = useState('');
  const [skillDraft, setSkillDraft] = useState<SkillDraft>(() => newSkillDraft(skillCards[0]));
  const skillBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { skillBodyRef.current?.scrollTo({ top: 0 }); }, [skillStep]);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [endEffectId, setEndEffectId] = useState<string | null>(null);
  const [revealDraft, setRevealDraft] = useState<RevealDraft | null>(null);
  const [winOpen, setWinOpen] = useState(false);
  const [tenpaiOpen, setTenpaiOpen] = useState(false);
  const [winStep, setWinStep] = useState(1);
  const [winSection, setWinSection] = useState<'tiles'|'analysis'|'yaku'>('tiles');
  const [showManualFu, setShowManualFu] = useState(false);
  const winBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { winBodyRef.current?.scrollTo({ top: 0 }); }, [winStep, winSection, showManualFu]);
  const [showAllYaku, setShowAllYaku] = useState(false);
  const [winCalculatorDraft, setWinCalculatorDraft] = useState<HandCalculatorDraft>();
  const [winCalculatorRevision, setWinCalculatorRevision] = useState(0);
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
  const requiredNotification = snapshot?.pendingNotifications.find((notice) => notice.requiresAck && !locallyAcknowledgedNoticeIds.includes(notice.notificationId)) ?? null;
  const passiveNotification = snapshot?.pendingNotifications.find((notice) => !notice.requiresAck && !locallyAcknowledgedNoticeIds.includes(notice.notificationId)) ?? null;
  const feedbackIsError = /失败|拒绝|尚未|不能|无法|请选择|不足|断开/.test(feedback);
  const timerEnabled = Boolean(snapshot?.table.timerEnabled && !snapshot.table.handEnded);
  const turnClock = snapshot?.table.clock ?? { enabled: false, fixedRemaining: 0, extraRemaining: 0, totalRemaining: 0, usingExtra: false, expired: false };
  const presentation = usePresentationSequence(snapshot?.presentations);
  useSilenceMode(snapshot?.environment?.kind === 'silence');
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
    if (commandPending.current) return false;
    setCommandError('');
    if (!online) {
      setFeedback('牌桌尚未连接，请等待重新连接');
      setCommandError('牌桌尚未连接，请等待重新连接');
      return false;
    }
    commandPending.current = true;
    setPendingAction(label);
    try {
      const result = await sendCommand(command);
      if (result?.status === 'rejected') throw new Error(result.message || '平板拒绝了这项操作');
      if (command.kind !== 'emote.send' && command.kind !== 'draw.confirm' && command.kind !== 'discard.confirm') setFeedback(result?.message || `${label}已同步到牌桌`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label}发送失败`;
      setFeedback(message); setCommandError(message);
      return false;
    } finally {
      commandPending.current = false;
      setPendingAction('');
    }
  }, [online, sendCommand]);

  const noticeAcknowledging = useRef(false);
  const acknowledgeNotice = useCallback(async (notificationId: string, announce = true) => {
    if (noticeAcknowledging.current) return;
    noticeAcknowledging.current = true;
    setAcknowledgingNoticeId(notificationId);
    try {
      await acknowledgeNotification(notificationId);
      setLocallyAcknowledgedNoticeIds((ids) => ids.includes(notificationId) ? ids : [...ids, notificationId]);
      if (announce) setFeedback('已确认收到效果');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '确认失败，请重试');
    } finally {
      noticeAcknowledging.current = false;
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
      <NfcIntentTarget cards={[]} canPrepare={false} onPrepare={()=>{}} allowMusic/>
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
              <div><span>自动发现</span><h1>同一 Wi-Fi 下的牌桌</h1></div>
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
                  <span>请连接平板所在 Wi-Fi，或在下方手动输入地址。</span>
                </div>
              )}
            </div>
          </section>

          <section className="remote-join-section remote-manual-join">
            <div className="remote-section-heading"><div><span>核对连接</span><h2>房间码与我的席位</h2></div></div>{chosenRoom && <p className="remote-selected-room"><Wifi />{chosenRoom.serviceName}</p>}
            <div className="remote-join-fields">
              <details className="remote-address-details"><summary>手动连接 · 输入平板地址</summary><div><Label>平板 IP 地址<Input inputMode="decimal" placeholder="例如 192.168.1.23" value={joinDraft.host} onChange={(event) => setJoinDraft((draft) => ({ ...draft, host: event.target.value, roomId: '' }))} /></Label><Label>端口<Input inputMode="numeric" min={DEFAULT_LAN_PORT} max={DEFAULT_LAN_PORT + MAX_LAN_PORT_OFFSET} type="number" value={joinDraft.port} onChange={(event) => setJoinDraft((draft) => ({ ...draft, port: Number(event.target.value) }))} /></Label></div></details>
              <Label>房间码<Input autoCapitalize="characters" autoCorrect="off" maxLength={8} placeholder="6 位房间码" value={joinDraft.roomCode} onChange={(event) => setJoinDraft((draft) => ({ ...draft, roomCode: normalizeRoomCode(event.target.value) }))} /></Label>
              <fieldset className="remote-join-seats"><legend>我的席位</legend><div><button type="button" aria-pressed={joinDraft.desiredPlayerId === 'auto'} onClick={() => setJoinDraft(draft => ({ ...draft, desiredPlayerId: 'auto' }))}>由平板分配</button>{shownSeats.map(seat => <button key={seat.playerId} type="button" aria-pressed={joinDraft.desiredPlayerId === seat.playerId} disabled={seat.occupied} onClick={() => setJoinDraft(draft => ({ ...draft, desiredPlayerId: seat.playerId }))}><b>{seat.wind}</b><small>{seat.occupied ? '已连接' : '选择此席'}</small></button>)}</div></fieldset>
            </div>
          </section>
        </div>
        <footer className="remote-join-footer">
            {(joinError || (connectionState !== 'discovering' && connectionState !== 'idle' && connectionMessage)) && <p role="status" className={`remote-join-message ${joinError ? 'remote-is-error' : ''}`}>{joinError || connectionMessage}</p>}
            <Button className="remote-join-button" disabled={joining} onClick={() => void submitJoin()}>
              {joining ? <RefreshCw className="remote-is-spinning" /> : <Wifi />}
              {connectionState === 'awaiting-approval' ? '等待平板确认席位' : joining ? '正在加入牌桌' : '加入牌桌'}
            </Button>
        </footer>
      </main>
    );
  }

  const selectSkill = (card: RemoteSkillCard) => {
    setSkillStep('configure'); setCommandError('');
    if (card.id === skillDraft.cardId) return;
    setGodCostConfirmed(false);
    setSkillDraft({ ...newSkillDraft(card), targetPlayerIds: cardTypeCode(card) === '单' ? [snapshot.self.playerId] : [] });
  };
  const leaveSkillStep = () => {
    if (commandPending.current) return;
    if (skillStep === 'configure') setSkillStep('choose'); else setSkillOpen(false);
  };
  const toggleSkillTarget = (playerId: string) => setSkillDraft((draft) => ({
    ...draft,
    targetPlayerIds: draft.targetPlayerIds.includes(playerId)
      ? draft.targetPlayerIds.filter((id) => id !== playerId)
      : [...draft.targetPlayerIds, playerId],
  }));
  const openSkillFlow = () => {
    setSkillStep('choose'); setCommandError('');
    const card = skillCards[0];
    setSkillSearch('');
    setSkillDraft({
      ...newSkillDraft(card),
      targetPlayerIds: card && cardTypeCode(card) === '单' ? [snapshot.self.playerId] : [],
    });
    setGodCostConfirmed(false);
    setSkillOpen(true);
  };
  const submitSkill = async (coinDecision?: CoinDecision) => {
    if (!selectedSkill || commandPending.current) return;
    if(isWushuangCard(selectedSkill)){setSkillOpen(false);setWushuangOpen(true);return;}
    if(godCardCost(selectedSkill)&&coinDecision===undefined){setSkillOpen(false);setGodOpen(true);return;}
    if (godCardCost(selectedSkill) && !godCostConfirmed) { setFeedback('请先一次确认实体代价已交出'); return; }
    const typeCode = cardTypeCode(selectedSkill);
    const targets = typeCode === '单'
      ? [snapshot.self.playerId]
      : typeCode === '环' || (typeCode === '陷' && skillDraft.faceDown)
        ? []
        : skillDraft.targetPlayerIds;
    if ((typeCode === '攻' || typeCode === '团' || (typeCode === '陷' && !skillDraft.faceDown)) && targets.length === 0) {
      setFeedback('请先选择实际受影响的玩家'); setCommandError('请先选择实际受影响的玩家');
      return;
    }
    if (!(typeCode === '陷' && skillDraft.faceDown) && usesDecisionCoin(selectedSkill) && coinDecision === undefined) {
      setFeedback(''); setCoinPrompt('activation'); setSkillOpen(false); return;
    }
    const accepted = await issueCommand(skillDraft.faceDown ? '暗置陷阱' : `发动「${selectedSkill.name}」`, {
      kind: 'skill.activate',
      input: {
        wushuangCostConfirmed: godCostConfirmed, cardId: selectedSkill.id, activationId: skillDraft.activationId, environment: skillDraft.environment, coinDecision,
        targetPlayerIds: targets,
        duration: skillDraft.duration,
        faceDown: typeCode === '陷' && skillDraft.faceDown,
        effectText: skillDraft.effectText.trim() || cardDescription(selectedSkill),
      },
    });
    if (accepted) { setCoinPrompt(null); setSkillOpen(false); }
  };

  const endEffect = snapshot.effects.find(effect => effect.effectId === endEffectId);
  const effectDestination = (effect: ControllerEffect) => effect.direction === 'table' ? '整张牌桌' : effect.direction === 'team' ? '我所在队伍' : effect.direction === 'outgoing' ? '其他玩家' : '我';
  const effectCard = (effect: ControllerEffect) => ({ id: effect.cardId, name: effect.cardName, effectDescription: effect.effectText });
  const revealIssue = !revealDraft?.targetPlayerIds.length ? '请选择实际受影响玩家' : revealDraft.targetPlayerIds.some(id => !snapshot.targetOptions.some(target => target.playerId === id && target.active)) ? '有目标已结束本局，请重新选择' : '';
  const closeReveal = () => { if (!commandPending.current) setRevealOpen(false); };
  const noticeEffect = snapshot.effects.find(effect => effect.effectId === requiredNotification?.effectId && !effect.hidden);
  const submitReveal = async (coinDecision?: CoinDecision) => {
    if (!revealDraft || commandPending.current) return;
    if (!revealDraft.targetPlayerIds.length || revealDraft.targetPlayerIds.some(id => !snapshot.targetOptions.some(target => target.playerId === id && target.active))) { setCommandError('请选择仍在本局的受影响玩家'); return; }
    const effect = snapshot.effects.find(e => e.effectId === revealDraft.effectId);
    if (effect?.coinDecisionAvailable && coinDecision === undefined) {
      setFeedback(''); setCoinPrompt('reveal'); setRevealOpen(false); return;
    }
    const accepted = await issueCommand('揭示陷阱', { kind: 'skill.reveal', input: { ...revealDraft, coinDecision } });
    if (accepted) { setCoinPrompt(null); setRevealOpen(false); }
  };

  const beginWin = () => {
    setWinSection('tiles');
    setShowManualFu(false);
    setWinCalculatorDraft(undefined);
    setWinCalculatorRevision(value => value + 1);
    setCommandError('');
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
    yaku.yakuman ? 0 : snapshot.environment?.kind === 'yaku' && snapshot.environment.yakuId === yaku.id ? 5 : winDraft.yakuOverrides[yaku.id] ?? (winDraft.closed ? yaku.closedHan : yaku.openHan)
  ), 0);
  const totalHan = (snapshot.environment?.kind === 'number' ? Math.floor((winDraft.environmentNumberCount ?? 0) / 2) : 0) + yakuHan + winDraft.dora + winDraft.uraDora + winDraft.akaDora + winDraft.flowerDora + winDraft.bonusHan;

  const winIssue = winDraft.winType === 'ron' && !snapshot.targetOptions.some(target => target.playerId === winDraft.loserPlayerId && target.active)
    ? '请选择仍在本局的放铳者。' : yakuman === 0 && yakuHan + winDraft.bonusHan === 0 ? '尚未选择有效役种或技能加番；宝牌不能单独构成和牌。' : '';
  const leaveWinStep = () => {
    if (commandPending.current) return;
    if (winStep === 2 && winSection !== 'tiles') { setWinSection(winSection === 'yaku' && winDraft.tiles.length ? 'analysis' : 'tiles'); return; }
    if (winStep > 1) setWinStep(step => step - 1); else setWinOpen(false);
  };
  const advanceWinStep = () => {
    if (winStep === 1 && winDraft.winType === 'ron' && !snapshot.targetOptions.some(target => target.playerId === winDraft.loserPlayerId && target.active)) { setCommandError('请选择仍在本局的放铳者。'); return; }
    setCommandError('');
    if (winStep === 2 && winSection !== 'yaku') { setWinSection(winSection === 'tiles' && winDraft.tiles.length ? 'analysis' : 'yaku'); return; }
    setWinStep(step => Math.min(3, step + 1));
  };
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

  const pointAmount = Number.isFinite(pointDraft.amount) ? Math.max(0, Math.min(1_000_000, Math.round(pointDraft.amount))) : 0;
  const pointTarget = snapshot.targetOptions.find(target => target.playerId === pointDraft.counterpartyPlayerId);
  const pointOutside = pointDraft.counterpartyPlayerId === 'outside';
  const pointIssue = !pointAmount ? '请填写大于 0 的点数。' : !pointOutside && !pointTarget?.active ? '这位玩家已不在本局，请重新选择来源或去向。' : snapshot.self.participation !== 'playing' ? '你已结束本局，当前不能调整点数。' : '';
  const selfParty = { label: `${snapshot.self.wind} · ${snapshot.self.name}`, character: snapshot.self.character, outside: false };
  const otherParty = { label: pointOutside ? '场外记账' : pointTarget ? `${pointTarget.wind} · ${pointTarget.name || '玩家'}` : '请选择玩家', character: pointTarget?.character, outside: pointOutside };
  const pointParties = pointDraft.direction === 'deduct' ? [selfParty, otherParty] : [otherParty, selfParty];
  const pointSummary = `${snapshot.self.name}${pointDraft.direction === 'deduct' ? '扣除' : '增加'} ${pointAmount.toLocaleString('zh-CN')} 点${pointOutside ? '，其他玩家不变' : `；${pointTarget?.name || pointTarget?.wind || '所选玩家'}${pointDraft.direction === 'deduct' ? '增加' : '扣除'}同额点数`}`;
  const updatePointDraft = (patch: Partial<typeof pointDraft>) => { setCommandError(''); setPointDraft(draft => ({ ...draft, ...patch })); };
  const closePointAdjustment = () => { if (!commandPending.current) setPointAdjustOpen(false); };
  const submitPointAdjustment = async () => {
    if (commandPending.current || pointIssue) return;
    const amount = pointAmount;
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
      <NfcIntentTarget cards={skillCards.map(c=>({...c,artwork:nfcCardArtwork(c)}))} disabled={snapshot.environment?.kind==='night'} canPrepare={online&&snapshot.table.wushuang&&snapshot.controls.canUseSkill&&!pendingAction} onPrepare={id=>{const card=skillCards.find(c=>c.id===id);if(!card)return;setGodOpen(false);setWushuangOpen(false);setSkillOpen(false);setGodCostConfirmed(false);setSkillDraft(newSkillDraft(card));setSkillSearch(card.name);setSkillStep('configure');setCommandError('');if(isWushuangCard(card)){setSkillOpen(false);setWushuangOpen(true);}else if(godCardCost(card))setGodOpen(true);else setSkillOpen(true);}}/>
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

      <section className={`remote-controller-body ${snapshot.environment ? "has-environment" : ""}`}>
        <div className="remote-round-strip">
          <span>{snapshot.table.roundWind}{snapshot.table.handNumber}局 · {snapshot.table.honba}本场</span>
          <strong>牌山 {snapshot.table.wallCount}</strong>
          <span>{snapshot.table.isMyTurn ? '当前操作：我' : '等待现场操作'}</span>
        </div>

        <EnvironmentControls environment={snapshot.environment} actorId={snapshot.self.playerId} seats={[{ id: snapshot.self.playerId, name: snapshot.self.name, character: snapshot.self.character, wind: snapshot.self.wind, active: snapshot.self.participation === 'playing' }, ...snapshot.targetOptions.map(s => ({ id: s.playerId, name: s.name ?? `${s.wind}家`, character: s.character, wind: s.wind, active: s.active, enemy: s.enemy }))]} disabled={!online || Boolean(pendingAction)} action={async (_, input) => { if (!await issueCommand('环境操作', input)) throw new Error('操作未确认，请检查牌桌状态'); }} />
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

          <button className="remote-command remote-command-points" type="button" disabled={!online || snapshot.self.participation !== 'playing' || Boolean(pendingAction)} onClick={() => { setCommandError(''); setPointAdjustOpen(true); }}>
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

      {snapshot.wushuangSessions?.filter(s=>s.status==='pending').map(s=><button key={s.effectId} type='button' className='ws-resume' onClick={()=>setWushuangOpen(true)}><Sparkles/>无双待结算 · {s.face==='heads'?'正面':'反面'}<ChevronRight/></button>)}
      <footer className="remote-controller-footer">
        <button type="button" onClick={() => { void Promise.resolve(disconnect()).finally(backToMode); }}><ChevronLeft /> 模式选择</button>
        <span>{pendingAction ? `${pendingAction}发送中` : `房间 ${snapshot.roomId.slice(-6)}`}</span>
        <span>修订 {snapshot.revision}</span>
      </footer>

      <button className="remote-emote-launcher" type="button" aria-label="发送表情" disabled={snapshot.environment?.kind === 'night' || snapshot.environment?.kind === 'silence'} onClick={() => setEmoteOpen(true)}><Smile /></button>

      {feedback && <output className={`remote-feedback ${feedbackIsError ? 'remote-is-error' : ''}`}>{feedbackIsError ? <AlertTriangle /> : <Check />}{feedback}</output>}
      {passiveNotification && <output className="remote-passive-notice"><Sparkles /><span><strong>{passiveNotification.title}</strong><small>{passiveNotification.body}</small></span><button type="button" disabled={acknowledgingNoticeId === passiveNotification.notificationId} aria-label="收起消息" onClick={() => void acknowledgeNotice(passiveNotification.notificationId, false)}><Check /></button></output>}
      <FloatingEmote events={emoteEvents} />
      <ExperiencePresentation events={snapshot.experienceEvents} dark={snapshot.environment?.kind === 'night'} contextKey={snapshot.environment?.effectId} phone onComplete={event=>{if(event.cardName==='麻将无双'&&event.actorId===snapshot.self.playerId)setWushuangOpen(true);}} />
      <NightMode active={snapshot.environment?.kind === 'night'} effectId={snapshot.environment?.effectId} events={snapshot.experienceEvents} phone />
      <PresentationOverlay sequence={presentation} />

      <Drawer open={emoteOpen} onOpenChange={setEmoteOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-emote-drawer">
          <DrawerTitle className="sr-only">表情库</DrawerTitle>
          <EmotePicker disabled={!online || snapshot.environment?.kind === 'night' || snapshot.environment?.kind === 'silence'} send={id => issueCommand('发送表情', { kind: 'emote.send', emoteId: id })} onClose={() => setEmoteOpen(false)} />
        </DrawerContent>
      </Drawer>

      <WushuangWorkbench key={`${snapshot.matchId}:${snapshot.handId}:${snapshot.self.playerId}`} open={wushuangOpen}
        storageKey={`mahjong-wushuang:remote-workspace:${snapshot.matchId}:${snapshot.handId}:${snapshot.self.playerId}`}
        actor={{id:snapshot.self.playerId,name:snapshot.self.name,character:snapshot.self.character,wind:snapshot.self.wind,active:snapshot.self.participation==='playing',score:snapshot.self.score}}
        targets={snapshot.targetOptions.map(p=>({id:p.playerId,name:p.name??`${p.wind}家`,character:p.character,wind:p.wind,active:p.active,enemy:p.enemy}))}
        context={{seatWind:snapshot.self.wind,roundWind:snapshot.table.roundWind,rules:{playerCount:snapshot.table.playerCount??4,akaDora:snapshot.table.akaDora!==false,openTanyao:snapshot.table.openTanyao!==false,kiriageMangan:Boolean(snapshot.table.kiriageMangan),kazoeYakuman:snapshot.table.kazoeYakuman!==false}}}
        session={snapshot.wushuangSessions?.at(-1)} deposits={snapshot.table.riichiSticks} disabled={!online||Boolean(pendingAction)}
        close={()=>setWushuangOpen(false)} backToCards={()=>{setWushuangOpen(false);setSkillOpen(true);}}
        activate={async(decision,targetId,activationId)=>{if(!online)throw Error('请先连接牌桌');const result=await sendCommand({kind:'skill.activate',input:{cardId:41,activationId,coinDecision:decision,wushuangCostConfirmed:true,targetPlayerIds:decision==='heads'?[]:targetId?[targetId]:[],duration:'hand',faceDown:false}});if(result?.status==='rejected')throw Error(result.message);setWushuangOpen(false);}}
        send={async command=>{if(!online)throw Error('请先连接牌桌');const result=await sendCommand(command);if(result?.status==='rejected')throw Error(result.message);if(command.kind==='wushuang.commit')setWushuangOpen(false);}} />
      {godOpen && selectedSkill && godCardCost(selectedSkill) && <GodSkillWorkbench key={skillDraft.activationId} card={{...selectedSkill,artwork:nfcCardArtwork(selectedSkill)}} actorName={snapshot.self.name}
        targets={snapshot.targetOptions.map(p=>({id:p.playerId,name:p.name||`${p.wind}家`,character:p.character,wind:p.wind,active:p.active,enemy:p.enemy===true}))}
        disabled={!online||!snapshot.controls.canUseSkill||Boolean(pendingAction)||snapshot.environment?.kind==='night'} close={()=>setGodOpen(false)}
        activate={async input=>{const accepted=await issueCommand(`发动「${selectedSkill.name}」`,{kind:'skill.activate',input});if(!accepted)throw Error('牌桌尚未确认发动，请检查连接与当前对局条件后重试');setGodOpen(false);setSkillOpen(false);}}/>}
      <CoinDecisionDialog open={coinPrompt !== null} cardName={coinPrompt === 'reveal' ? snapshot.effects.find(e => e.effectId === revealDraft?.effectId)?.cardName ?? '陷阱卡' : selectedSkill?.name ?? '技能卡'} error={feedback} disabled={Boolean(pendingAction)}
        choose={decision => coinPrompt === 'reveal' ? submitReveal(decision) : submitSkill(decision)}
        cancel={() => { if (coinPrompt === 'reveal') setRevealOpen(true); else setSkillOpen(true); setCoinPrompt(null); setFeedback(''); }} />
      <Drawer open={skillOpen} onOpenChange={open => { if (!open) leaveSkillStep(); }} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-skill-drawer skill-flow-drawer">
          <DrawerHeader><DrawerTitle>{skillStep === 'choose' ? '选择技能卡' : '配置技能'}</DrawerTitle><DrawerDescription>{skillStep === 'choose' ? '按类型找卡，点卡片进入配置。' : `${snapshot.self.wind}家 · ${snapshot.self.name} · 使用者固定为自己`}</DrawerDescription></DrawerHeader>
          <div ref={skillBodyRef} className="remote-flow-body" inert={Boolean(pendingAction)}>
            <div hidden={skillStep !== 'choose'}><SkillCatalogPicker remote cards={skillCards} selectedId={selectedSkill?.id} query={skillSearch} onQuery={setSkillSearch} onSelect={selectSkill} /></div>
            {selectedSkill && <section className="remote-skill-config" hidden={skillStep !== 'configure'}>
              <div className="skill-chosen-heading"><SkillCardArt card={selectedSkill} remote /><div><small>{cardTypeCode(selectedSkill)} · {skillDraft.faceDown ? '暗置' : '公开发动'}</small><h3>{selectedSkill.name}</h3><p>{cardDescription(selectedSkill)}</p></div></div>
              {(godCardCost(selectedSkill) || (selectedSkill && isWushuangCard(selectedSkill))) ? <p className="skill-flow-note">下一步进入专属页面，一次确认实体代价与发动条件。</p> : <>
              <EnvironmentFields name={selectedSkill.name} value={skillDraft.environment} change={environment => setSkillDraft(draft => ({ ...draft, environment }))} />{cardTypeCode(selectedSkill) === '陷' && <Label className="remote-check-row"><Checkbox checked={skillDraft.faceDown} onCheckedChange={(checked) => setSkillDraft((draft) => ({ ...draft, faceDown: checked, targetPlayerIds: checked ? [] : draft.targetPlayerIds }))} /><span><strong>暗置陷阱</strong><small>暗置时不公开卡名与效果，触发时再选择目标。</small></span></Label>}
              {(['宿星审判'].includes(selectedSkill.name) || cardTypeCode(selectedSkill) === '团' || cardTypeCode(selectedSkill) === '攻' || (cardTypeCode(selectedSkill) === '陷' && !skillDraft.faceDown)) && <div className="remote-config-block"><h3>实际受影响玩家</h3><TargetPicker snapshot={snapshot} selected={skillDraft.targetPlayerIds} includeSelf={cardTypeCode(selectedSkill) === '团'} onToggle={toggleSkillTarget} /></div>}
              {cardTypeCode(selectedSkill) === '单' && <p className="remote-inline-note"><Target />这张卡只对你自己生效，但发动记录会公开。</p>}
              {cardTypeCode(selectedSkill) === '环' && <p className="remote-inline-note"><Target />这张卡作用于整张牌桌。</p>}
              <details className="skill-advanced"><summary>持续与说明 · {DURATION_LABELS[skillDraft.duration]}</summary>
              <div className="remote-config-grid">
                <Label>持续范围<Select value={skillDraft.duration} onValueChange={(value) => setSkillDraft((draft) => ({ ...draft, duration: String(value) as SkillDuration }))}><SelectTrigger className="remote-select-trigger"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DURATION_LABELS).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></Label>
                <Label>显示给玩家的效果说明<Textarea maxLength={500} value={skillDraft.effectText} onChange={(event) => setSkillDraft((draft) => ({ ...draft, effectText: event.target.value }))} /></Label>
              </div>
              </details></>}
            </section>}
          </div>
          <DrawerFooter className="remote-flow-footer"><output className="flow-feedback">{pendingAction ? '等待牌桌确认…' : commandError || (skillStep === 'configure' ? `${skillDraft.faceDown ? '不公开卡名与效果' : (selectedSkill ? cardTypeCode(selectedSkill) : '') === '环' ? '整张牌桌' : (selectedSkill ? cardTypeCode(selectedSkill) : '') === '单' ? '自己' : skillDraft.targetPlayerIds.length ? `${skillDraft.targetPlayerIds.length} 位目标` : '请选择目标'} · ${DURATION_LABELS[skillDraft.duration]}` : '选择卡片只准备，不会立即发动。')}</output><Button variant="outline" disabled={Boolean(pendingAction)} onClick={leaveSkillStep}>{skillStep === 'choose' ? '取消' : '返回选卡'}</Button><Button disabled={!selectedSkill || Boolean(pendingAction)} onClick={() => skillStep === 'choose' ? setSkillStep('configure') : void submitSkill()}><Send />{skillStep === 'choose' ? '配置这张卡' : (godCardCost(selectedSkill) || (selectedSkill && isWushuangCard(selectedSkill))) ? '进入专属页面' : skillDraft.faceDown ? '确认暗置' : '确认发动'}</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={pointAdjustOpen} onOpenChange={open => { if (!open) closePointAdjustment(); }} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-points-drawer point-flow-drawer">
          <DrawerHeader><DrawerTitle>加点 / 扣点</DrawerTitle><DrawerDescription>选择方向与点数，核对双方变化后同步到牌桌。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body remote-points-body" inert={Boolean(pendingAction)}>
            <section className="points-amount-panel">
              <div className="remote-choice-pair"><button className={pointDraft.direction === 'deduct' ? 'remote-is-selected' : ''} type="button" aria-pressed={pointDraft.direction === 'deduct'} onClick={() => updatePointDraft({ direction: 'deduct' })}>− 从我扣点<small>支付费用或罚点</small></button><button className={pointDraft.direction === 'add' ? 'remote-is-selected' : ''} type="button" aria-pressed={pointDraft.direction === 'add'} onClick={() => updatePointDraft({ direction: 'add' })}>＋ 给我加点<small>领取奖励</small></button></div>
              <NumberStepper label="调整点数" value={pointDraft.amount} step={100} maximum={1_000_000} onChange={amount => updatePointDraft({ amount })} />
              <div className="remote-point-presets" aria-label="常用点数">{[100, 500, 1000, 2000, 4000, 8000].map(amount => <button className={pointDraft.amount === amount ? 'remote-is-selected' : ''} type="button" key={amount} aria-pressed={pointDraft.amount === amount} onClick={() => updatePointDraft({ amount })}>{amount.toLocaleString('zh-CN')}</button>)}</div>
            </section>
            <div className="points-transfer-preview" aria-label="点数变化预览">{pointParties.map((party, index) => <div className="points-transfer-party" key={index} style={{ gridColumn: index ? 3 : 1, gridRow: 1 }}>{party.outside ? <span className="points-outside-icon"><CircleDollarSign /></span> : <CharacterAvatar choice={party.character} />}<strong>{party.label}</strong>{party.outside ? <small>不改其他玩家</small> : <b className={index ? 'positive' : 'negative'}>{index ? '+' : '−'}{pointAmount.toLocaleString('zh-CN')}</b>}</div>)}<span className="points-transfer-arrow" style={{ gridColumn: 2, gridRow: 1 }} aria-hidden="true"><ArrowRight /></span></div>
            <section className="points-target-panel">
              <h3 className="points-target-heading">{pointDraft.direction === 'deduct' ? '点数记给谁？' : '点数从哪里来？'}</h3>
              <div className="points-targets" aria-label="点数来源或去向"><button type="button" aria-pressed={pointOutside} onClick={() => updatePointDraft({ counterpartyPlayerId: 'outside' })}><CircleDollarSign /><span><strong>场外增减</strong><small>只改自己的点数</small></span></button>{snapshot.targetOptions.map(target => <button type="button" key={target.playerId} disabled={!target.active} aria-pressed={pointDraft.counterpartyPlayerId === target.playerId} aria-label={`点数往来：${target.wind} · ${target.name || '玩家'}`} onClick={() => updatePointDraft({ counterpartyPlayerId: target.playerId })}><CharacterAvatar choice={target.character} /><span><strong>{target.wind} · {target.name || '玩家'}</strong><small>{target.active ? seatRelation(snapshot.self.wind, target.wind, snapshot.targetOptions.length + 1) : '已结束本局'}</small></span></button>)}</div>
              <Label>原因<Input maxLength={80} value={pointDraft.reason} onChange={event => updatePointDraft({ reason: event.target.value })} /></Label>
            </section>
          </div>
          <DrawerFooter className="remote-flow-footer"><output className="flow-feedback" aria-live="polite">{pendingAction ? '等待牌桌确认，请勿重复提交…' : commandError || pointIssue || pointSummary}</output><Button variant="outline" disabled={Boolean(pendingAction)} onClick={closePointAdjustment}>取消</Button><Button disabled={Boolean(pointIssue) || Boolean(pendingAction) || !online} onClick={() => void submitPointAdjustment()}><Send />{pointDraft.direction === 'deduct' ? '确认扣点' : '确认加点'}</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={effectsOpen} onOpenChange={setEffectsOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-effects-drawer">
          <DrawerHeader><DrawerTitle>我的场上效果</DrawerTitle><DrawerDescription>查看与你有关的技能、牌桌环境和自己的暗置记录。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body remote-effect-list">
            {snapshot.effects.map(effect => <section className="remote-effect-group" key={effect.effectId}><h3>{EFFECT_DIRECTION_LABELS[effect.direction]}</h3><EffectSummary hidden={effect.hidden} remote card={effect.hidden ? undefined : effectCard(effect)} title={effect.cardName} from={effect.sourceLabel} to={effectDestination(effect)} duration={DURATION_LABELS[effect.duration]} state={effect.state} text={effect.hidden ? undefined : effect.effectText}>
              {effect.direction === 'hidden-own' && <Button variant="outline" onClick={() => { setCommandError(''); setRevealDraft({ effectId: effect.effectId, targetPlayerIds: [], effectText: effect.effectText }); setEffectsOpen(false); setRevealOpen(true); }}><Eye /> 揭示并发动</Button>}
              {(effect.direction === 'self' || effect.direction === 'outgoing') && <Button variant="outline" disabled={Boolean(pendingAction)} onClick={() => { setCommandError(''); setEndEffectId(effect.effectId); setEffectsOpen(false); }}>管理／结束效果</Button>}
            </EffectSummary></section>)}
            {!snapshot.effects.length && <div className="remote-empty-copy"><ShieldCheck /><strong>当前没有与你有关的效果</strong><span>有人对你发动技能时，这里会立即更新。</span></div>}
          </div>
          <DrawerFooter className="remote-flow-footer"><Button variant="outline" onClick={() => setEffectsOpen(false)}>返回指令区</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={Boolean(endEffectId)} onOpenChange={open => { if (!open && !commandPending.current) setEndEffectId(null); }}>
        <DialogContent className="remote-dialog effect-manage-workspace remote-effect-manager" showCloseButton={!pendingAction}>
          <DialogHeader><DialogTitle>结束技能效果</DialogTitle><DialogDescription>结束后将移出场上效果，已经发生的点数变化会保留。</DialogDescription></DialogHeader>
          <div className="effect-manage-body">{endEffect ? <EffectSummary remote card={effectCard(endEffect)} title={endEffect.cardName} from={endEffect.sourceLabel} to={effectDestination(endEffect)} duration={DURATION_LABELS[endEffect.duration]} state={endEffect.state} text={endEffect.effectText} expanded /> : <p>这个效果已结束或已不在列表中。</p>}</div>
          <DialogFooter className="remote-dialog-footer"><output className="effect-action-feedback">{pendingAction ? '等待牌桌确认…' : commandError}</output><Button variant="outline" disabled={Boolean(pendingAction)} onClick={() => setEndEffectId(null)}>保留效果</Button><Button variant="destructive" disabled={!endEffect || Boolean(pendingAction) || !online} onClick={async () => { if (endEffect && await issueCommand('解除技能效果', { kind: 'effect.resolve-own', effectId: endEffect.effectId })) setEndEffectId(null); }}>确认结束效果</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={revealOpen} onOpenChange={open => { if (!open) closeReveal(); }}>
        <DialogContent className="remote-dialog remote-reveal-dialog effect-manage-workspace" showCloseButton={!pendingAction}>
          <DialogHeader><DialogTitle>揭示并发动陷阱</DialogTitle><DialogDescription>确认后向所有玩家公开卡名与效果；所选玩家将收到通知。</DialogDescription></DialogHeader>
          {revealDraft && <div className="effect-manage-body effect-reveal-fields" inert={Boolean(pendingAction)}><EffectSummary hidden title="暗置陷阱" from="我" to="等待触发" duration="" /><h3>选择受影响玩家</h3><TargetPicker snapshot={snapshot} selected={revealDraft.targetPlayerIds} onToggle={playerId => { setCommandError(''); setRevealDraft(draft => draft ? ({ ...draft, targetPlayerIds: draft.targetPlayerIds.includes(playerId) ? draft.targetPlayerIds.filter(id => id !== playerId) : [...draft.targetPlayerIds, playerId] }) : draft); }} /><Label>公开效果说明<Textarea maxLength={500} value={revealDraft.effectText} onChange={event => setRevealDraft(draft => draft ? ({ ...draft, effectText: event.target.value }) : draft)} /></Label><p className="effect-action-note">公开给所有玩家 · 影响{revealDraft.targetPlayerIds.length ? revealDraft.targetPlayerIds.map(id => `${snapshot.targetOptions.find(target => target.playerId === id)?.wind ?? ''}家`).join('、') : '对象待选择'}</p></div>}
          <DialogFooter className="remote-dialog-footer"><output className="effect-action-feedback">{pendingAction ? '等待牌桌确认…' : commandError || revealIssue}</output><Button variant="outline" disabled={Boolean(pendingAction)} onClick={closeReveal}>继续暗置</Button><Button disabled={Boolean(revealIssue) || Boolean(pendingAction) || !online} onClick={() => void submitReveal()}><Eye /> 确认发动</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={winOpen} onOpenChange={open => { if (!open) leaveWinStep(); }} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-win-drawer win-flow-drawer remote-win-workspace" data-step={winStep} data-section={winSection}>
          <DrawerHeader><DrawerTitle>{winStep === 2 ? '录入和牌' : '手机和牌录入'}</DrawerTitle><DrawerDescription>{winStep === 2 ? `${snapshot.self.wind}家 · ${winDraft.winType === 'tsumo' ? '自摸' : '荣和'} · ${winDraft.closed ? '门清' : '副露'}` : '和牌者固定为你自己；平板会重新计算点数并直接同步结算。'}</DrawerDescription></DrawerHeader>
          <ol className="flow-steps" aria-label="和牌录入步骤">{['基本情况', '牌姿与役', '核对提交'].map((label, index) => <li key={label} aria-current={winStep === index + 1 ? 'step' : undefined} data-done={winStep > index + 1}><span>{index + 1}</span><strong>{label}</strong></li>)}</ol>
          {winStep === 2 && <nav className="remote-win-sections" aria-label="牌姿与役的操作区">{([['tiles','录牌'],['analysis','和牌张·副露'],['yaku','役与符']] as const).map(([section,label])=><button type="button" key={section} disabled={Boolean(pendingAction)} aria-pressed={winSection===section} onClick={()=>setWinSection(section)}>{label}</button>)}</nav>}
          <div ref={winBodyRef} className="remote-flow-body remote-win-body" inert={Boolean(pendingAction)}>
            {winStep === 1 && <section className="remote-win-step">
              <h3>和牌方式</h3>
              <div className="remote-choice-pair"><button className={winDraft.winType === 'ron' ? 'remote-is-selected' : ''} type="button" aria-pressed={winDraft.winType === 'ron'} onClick={() => setWinDraft((draft) => ({ ...draft, winType: 'ron', selectedYakuIds: draft.selectedYakuIds.filter((id) => !['menzen-tsumo', 'haitei', 'rinshan'].includes(id)) }))}>荣和<small>由一名玩家支付</small></button><button className={winDraft.winType === 'tsumo' ? 'remote-is-selected' : ''} type="button" aria-pressed={winDraft.winType === 'tsumo'} onClick={() => setWinDraft((draft) => ({ ...draft, winType: 'tsumo', loserPlayerId: undefined, selectedYakuIds: draft.selectedYakuIds.filter((id) => !['houtei', 'chankan'].includes(id)) }))}>自摸<small>对手支付，阵营队友免付</small></button></div>
              {winDraft.winType === 'ron' && <div className="remote-config-block"><h3>放铳风位</h3><TargetPicker snapshot={snapshot} selected={winDraft.loserPlayerId ? [winDraft.loserPlayerId] : []} onToggle={(playerId) => setWinDraft((draft) => ({ ...draft, loserPlayerId: playerId }))} /></div>}
              <div className="remote-choice-pair"><button className={winDraft.closed ? 'remote-is-selected' : ''} type="button" aria-pressed={winDraft.closed} onClick={() => setWinDraft((draft) => ({ ...draft, closed: true }))}>门清</button><button className={!winDraft.closed ? 'remote-is-selected' : ''} type="button" aria-pressed={!winDraft.closed} onClick={() => setWinDraft((draft) => ({ ...draft, closed: false, selectedYakuIds: draft.selectedYakuIds.filter((id) => { const yaku = YAKU.find((candidate) => candidate.id === id); return Boolean(yaku?.yakuman || (yaku?.openHan ?? 0) > 0); }) }))}>副露</button></div>
              <Label>符数<Select value={String(winDraft.fu)} onValueChange={(value) => setWinDraft((draft) => ({ ...draft, fu: Number(value) }))}><SelectTrigger className="remote-select-trigger"><SelectValue /></SelectTrigger><SelectContent>{[...new Set([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, winDraft.fu])].sort((a,b)=>a-b).map((fu) => <SelectItem key={fu} value={String(fu)}>{fu} 符</SelectItem>)}</SelectContent></Select></Label>
            </section>}

            {winStep === 2 && winSection === 'tiles' && <RemoteWinTileEntry tiles={winDraft.tiles} players={snapshot.targetOptions.length+1} change={update=>setWinDraft(draft=>({...draft,tiles:update(draft.tiles)}))}/>}
            {winStep === 2 && winSection === 'yaku' && <div className="remote-win-resultbar"><div><strong>{yakuman ? `${yakuman} 倍役满` : `${totalHan} 番 ${winDraft.fu} 符`}</strong><small>{winDraft.analysis?.automatic ? '已采用牌姿识别结果' : '当前手动选择 · 请核对役种'}</small></div><button type="button" aria-expanded={showManualFu} onClick={()=>setShowManualFu(value=>!value)}>{showManualFu?'收起算符':'现场算符'}</button></div>}
            <div className="remote-win-assistance" hidden={winStep!==2||winSection==='tiles'||(winSection==='yaku'&&!showManualFu)}><HandCalculator presentation={winSection==='analysis'?'analysis':'manual'} key={winCalculatorRevision} initialDraft={winCalculatorDraft} currentFu={winDraft.fu} onDraftChange={value=>setWinCalculatorDraft(previous=>JSON.stringify(previous)===JSON.stringify(value)?previous:value)} tiles={winDraft.tiles} closed={winDraft.closed} winType={winDraft.winType} seatWind={snapshot.self.wind} roundWind={snapshot.table.roundWind} selected={winDraft.selectedYakuIds} bonusHan={totalHan-yakuHan} overrides={snapshot.environment?.kind === 'yaku' && snapshot.environment.yakuId ? { ...winDraft.yakuOverrides, [snapshot.environment.yakuId]: 5 } : winDraft.yakuOverrides} openTanyao={snapshot.table.openTanyao} kiriage={snapshot.table.kiriageMangan} kazoe={snapshot.table.kazoeYakuman} onApply={(ids,fu,closed,analysis)=>setWinDraft(form=>JSON.stringify(form.analysis)===JSON.stringify(analysis)&&JSON.stringify(form.selectedYakuIds)===JSON.stringify(ids)&&(fu===undefined||fu===form.fu)&&(closed===undefined||closed===form.closed)?form:{...form,analysis,selectedYakuIds:ids,fu:fu??form.fu,closed:closed??form.closed})}/></div>
            {winStep === 2 && winSection === 'yaku' && <section className="remote-win-step">
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
              <h3>核对提交</h3><HandDisplay tiles={winDraft.tiles}/>
              <div className="remote-win-summary">
                <span>{snapshot.self.wind}家 · {snapshot.self.name}</span>
                <strong>{yakuman ? `${yakuman} 倍役满` : `${totalHan} 番 ${winDraft.fu} 符`}</strong>
                <p>{winDraft.winType === 'tsumo' ? '自摸' : `荣和 · ${snapshot.targetOptions.find((target) => target.playerId === winDraft.loserPlayerId)?.wind ?? '未选'}家放铳`} · {winDraft.closed ? '门清' : '副露'} · {selectedYaku.map((yaku) => yaku.name).join('、') || '尚未选择役种'}</p>
                <dl className="win-source-list"><div><dt>牌桌</dt><dd>{snapshot.targetOptions.length + 1} 人桌</dd></div><div><dt>役种番数（含修改）</dt><dd>{yakuHan}</dd></div><div><dt>宝牌 / 里 / 赤 / 花北</dt><dd>{winDraft.dora} / {winDraft.uraDora} / {winDraft.akaDora} / {winDraft.flowerDora}</dd></div><div><dt>技能加番</dt><dd>{winDraft.bonusHan}</dd></div><div><dt>环境加番</dt><dd>{snapshot.environment?.kind === 'number' ? Math.floor((winDraft.environmentNumberCount ?? 0) / 2) : 0}{snapshot.environment?.kind === 'yaku' ? '（指定役修正已计入役种）' : ''}</dd></div><div><dt>额外得点</dt><dd>{winDraft.extraPoints.toLocaleString()} 点</dd></div></dl>
                {yakuman > 0 && <small>按役满结算，普通番数与宝牌不叠加到役满倍数。</small>}
                <small>付款方：{winDraft.winType === 'tsumo' ? (snapshot.targetOptions.filter(target => target.active && target.enemy).map(target => `${target.wind}家`).join('、') || '无') : `${snapshot.targetOptions.find(target => target.playerId === winDraft.loserPlayerId)?.wind ?? '未选'}家`}。最终支付由平板复核。</small>
                <small>{winDraft.analysis?.automatic ? '本次采用自动识别的役与符；平板会复核完整牌姿后结算。' : '本次按当前勾选的役与符数结算。请确认上方番数、符数及役种。'}</small>
              </div>
              <details className="win-bonus-editor"><summary>调整宝牌与技能修正<span>宝牌 {winDraft.dora + winDraft.uraDora + winDraft.akaDora + winDraft.flowerDora} · 技能 {winDraft.bonusHan} 番</span></summary><div>
              <div className="remote-number-grid">
                <NumberStepper label="宝牌" value={winDraft.dora} onChange={(value) => setWinDraft((draft) => ({ ...draft, dora: value }))} />
                <NumberStepper label="里宝牌" value={winDraft.uraDora} onChange={(value) => setWinDraft((draft) => ({ ...draft, uraDora: value }))} />
                <NumberStepper label="赤宝牌" value={winDraft.akaDora} onChange={(value) => setWinDraft((draft) => ({ ...draft, akaDora: value }))} />
                <NumberStepper label="花 / 北" value={winDraft.flowerDora} onChange={(value) => setWinDraft((draft) => ({ ...draft, flowerDora: value }))} />
                <EnvironmentBonusField environment={snapshot.environment} count={winDraft.environmentNumberCount ?? 0} change={environmentNumberCount => setWinDraft(draft => ({ ...draft, environmentNumberCount }))} /><NumberStepper label="技能加番" value={winDraft.bonusHan} onChange={(value) => setWinDraft((draft) => ({ ...draft, bonusHan: value }))} />
              </div>
              <div className="remote-extra-points">
                <NumberStepper label="技能额外得点" value={winDraft.extraPoints} step={100} maximum={1_000_000} onChange={(value) => setWinDraft((draft) => ({ ...draft, extraPoints: value }))} />
                <small>填写“恭喜发财”等固定增加的和牌点数。荣和由放铳者支付，自摸由仍在局内的对手合计支付，阵营队友免付。</small>
              </div>
              </div></details>
            </section>}
          </div>
          <DrawerFooter className="remote-flow-footer remote-win-footer">
            <output className="flow-feedback" data-quiet={winStep===2&&!pendingAction&&!commandError}>{pendingAction ? '等待牌桌确认，请勿重复提交…' : commandError || (winStep === 3 ? winIssue || '核对无误后提交，平板会重新计算并结算。' : '返回上一步会保留已填写内容。')}</output>
            <Button variant="outline" disabled={Boolean(pendingAction)} onClick={leaveWinStep}><ChevronLeft /> {winStep === 1 ? '取消' : winStep === 2 && winSection === 'tiles' ? '基本情况' : '上一步'}</Button>
            {winStep < 3 ? <Button disabled={Boolean(pendingAction)} onClick={advanceWinStep}>{winStep!==2?'下一步':winSection==='tiles'&&winDraft.tiles.length?'选择和牌张':winSection==='yaku'?'核对提交':'选择役与符'} <ChevronRight /></Button> : <Button disabled={Boolean(pendingAction) || Boolean(winIssue)} onClick={() => void submitWin()}><Trophy /> 确认和牌并结算</Button>}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={tenpaiOpen} onOpenChange={setTenpaiOpen} showSwipeHandle>
        <DrawerContent className="remote-drawer remote-tenpai-drawer">
          <DrawerHeader><DrawerTitle>输入牌型查看听牌</DrawerTitle><DrawerDescription>听牌张只在这部手机上计算，不发送牌姿给平板。</DrawerDescription></DrawerHeader>
          <div className="remote-flow-body"><RemoteTenpaiChecker players={(snapshot.targetOptions.length + 1) as 3 | 4} /></div>
          <DrawerFooter className="remote-flow-footer tenpai-footer"><Button variant="outline" onClick={() => setTenpaiOpen(false)}>返回指令区</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={Boolean(requiredNotification) && snapshot.environment?.kind !== 'night' && !presentation.event}>
        <DialogContent className="remote-dialog remote-impact-dialog" showCloseButton={false}>
          {requiredNotification && <>
            <div className="remote-impact-icon">{noticeEffect ? <SkillCardArt remote card={effectCard(noticeEffect)} /> : <AlertTriangle />}</div>
            <DialogHeader><DialogTitle>{requiredNotification.title}</DialogTitle><DialogDescription>{requiredNotification.sourceLabel ? `${requiredNotification.sourceLabel}向你发送了需要确认的牌桌效果` : '你收到了需要确认的牌桌效果'}</DialogDescription></DialogHeader>
            <div className="remote-impact-copy"><p>{requiredNotification.body}</p>{requiredNotification.durationLabel && <span>{requiredNotification.durationLabel}</span>}</div>
            <DialogFooter className="remote-dialog-footer"><Button disabled={acknowledgingNoticeId === requiredNotification.notificationId} onClick={() => void acknowledgeNotice(requiredNotification.notificationId)}><Check />{acknowledgingNoticeId === requiredNotification.notificationId ? '正在确认…' : '我已了解'}</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </main>
  );
}
