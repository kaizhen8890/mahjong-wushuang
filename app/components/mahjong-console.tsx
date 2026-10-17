'use client';
import type { CSSProperties } from 'react';
import { EffectSummary } from './effect-summary';
import { SettingsReview } from './settings-review';
import './rules-settings.css';
import { MatchHistory } from './match-history';
import './room-record-panels.css';
import { DrawSettlementDialog } from './draw-settlement-dialog';
import { DataManagementDialog } from './data-management-dialog';
import './operation-dialogs.css';
import { SkillDetailPanel, SkillEditorPanel, skillEditorIssue } from './skill-library-panels';
import { GodSkillWorkbench } from './god-skill-workbench';
import { NfcIntentTarget } from './nfc-card-scanner';
import { NfcCodeLibrary } from './nfc-code-library';
import { godCardCost } from '@/lib/god-card-cost';

import { exportJson } from '@/lib/file-export';

/* oxlint-disable next/no-img-element -- Local tile/card assets and user data URLs are intentionally rendered without an optimizer. */

import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Archive,
  ChevronDown,
  CircleDollarSign,
  Download,
  Edit3,
  Eye,
  Flag,
  History,
  ListRestart,
  Minus,
  Music2,
  Plus,
  RotateCcw,
  Radio,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  UserMinus,
  UserRoundCheck,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';

import bundledSkillData from '@/data/skill-cards.json';
import { migrateSkillLibrary, retireSkillReferences, SKILL_CATALOG_REVISION } from '@/lib/skill-catalog';
import { analyzeHand, parseMelds } from '@/lib/hand-analysis';
import { HandCalculator, type HandCalculatorDraft } from './hand-calculator';
import { SkillCatalogPicker, SkillCardArt } from './skill-catalog-picker';
import { HandDisplay } from './mahjong-tile';
import { FloatingEmote, TurnTimerDisplay, useTurnCountdown } from './game-overlays';
import { useLanHost } from '@/app/hooks/use-lan-host';
import { useSkillMusic } from '@/app/hooks/use-skill-music';
import { RIICHI_MUSIC, useCountdownSound, useRealtimeSound, useRiichiMusic } from '@/app/hooks/use-game-audio';
import { recordRiichiTransitions, recordSkillTransitions, recordWin } from '@/lib/presentation';
import { PresentationOverlay, usePresentationSequence, RollingScore, WinParticles, type PresentationSequence } from './table-presentation';
import { FitLabel } from './fit-label';
import { CharacterAvatar, CharacterPicker } from './character-picker';
import { characterChoice, defaultSeatCharacter, type CharacterChoice } from '@/lib/characters';
import { EnvironmentFields, EnvironmentBonusField, EnvironmentControls, ExperiencePresentation, NightMode } from './skill-experience';
import { WushuangPreview } from './wushuang-cinematic';
import { WushuangWorkbench } from './wushuang-workbench';
import { isWushuangCard } from '@/lib/wushuang-session';
import { pendingWushuang, correctWushuang } from '@/lib/wushuang';
import { SpecialCinematicPreview } from './special-cinematic';
import { useSilenceMode } from '@/app/hooks/use-night-brightness';
import { CoinDecisionDialog } from './coin-decision-dialog';
import type { CoinDecision } from '@/lib/skill-random';
import { usesDecisionCoin, activeEnvironment, awardLastSurvivor, applyEnvironmentAction, environmentBonus, type EnvironmentOptions } from '@/lib/skill-experience';
import { applyRemoteControllerCommand } from '@/lib/remote-command';
import { hasNativeLanRoom } from '@/lib/lan-native';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DEFAULT_SETTINGS,
  TILE_IDS,
  TILE_LABELS,
  WINDS,
  YAKU,
  addEvent,
  automaticInitialWallCount,
  calculateExhaustiveDraw,
  calculateNagashiDraw,
  calculateSettlement,
  createGameState,
  drawSkills,
  nextActiveIndex,
  resolveInitialWallCount,
  sortTiles,
  stopTurnClock,
  setTimerPaused,
  type ActiveSkillEffect,
  type GameSettings,
  type GameState,
  type PlayerState,
  type SettlementInput,
  type SettlementResult,
  type SkillCard,
} from '@/lib/mahjong';

type View = 'table' | 'score' | 'skills';

const HAN_NUMBER_OPTIONS = Array.from({ length: 31 }, (_, index) => index);

interface WebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown;
}

interface WebMcpContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Document {
    readonly modelContext?: WebMcpContext;
  }
}

const STORAGE_KEY = 'mahjong-wushuang:local-state:v1';
const bundledCards = bundledSkillData.cards as unknown as SkillCard[];
const allBundledIds = bundledCards.map((card) => card.id);
const TYPE_STYLES: Record<string, { label: string; color: string }> = {
  单: { label: '个人增益', color: 'green' },
  团: { label: '团队增益', color: 'blue' },
  攻: { label: '负面攻击', color: 'red' },
  陷: { label: '防守陷阱', color: 'purple' },
  环: { label: '战局环境', color: 'gray' },
  神: { label: '无双神卡', color: 'purple' },
};

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

type SkillDuration = 'once' | 'hand' | 'match' | 'manual';

interface SkillRecordForm {
  environment?: EnvironmentOptions;
  activationId?: string;
  actorId: string;
  cardId: number;
  targetIds: string[];
  duration: SkillDuration;
  hidden: boolean;
  note: string;
}

interface MatchResultSnapshot {
  endedAt: string;
  roundLabel: string;
  targetPoints: number;
  riichiSticks: number;
  teamsEnabled: boolean;
  players: Array<Pick<PlayerState, 'id' | 'name' | 'wind' | 'team' | 'score'>>;
  teams: Array<{ name: string; score: number }>;
}

const DURATION_LABELS: Record<SkillDuration, string> = {
  once: '单次结算',
  hand: '本局有效',
  match: '整场有效',
  manual: '手动解除',
};

function effectSourceId(effect: ActiveSkillEffect) {
  return effect.sourcePlayerId || effect.ownerId;
}

function effectTargets(effect: ActiveSkillEffect) {
  if (effect.affectedPlayerIds?.length) return effect.affectedPlayerIds;
  if (effect.targetPlayerIds?.length) return effect.targetPlayerIds;
  return effect.targetId ? [effect.targetId] : [];
}

function effectIsHidden(effect: ActiveSkillEffect) {
  return effect.visibility === 'face-down' || effect.faceDown;
}

function effectIsLive(effect: ActiveSkillEffect) {
  return effect.state !== 'resolved' && effect.status !== 'resolved';
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tileLabel(tile: string) {
  if (TILE_LABELS[tile]) return TILE_LABELS[tile];
  const rank = tile[0] === '0' ? '赤五' : tile[0];
  const suit = tile.endsWith('m') ? '万' : tile.endsWith('p') ? '筒' : '索';
  return `${rank}${suit}`;
}

function tileFamily(tile: string) {
  return tile[0] === '0' ? `5${tile.slice(1)}` : tile;
}

function normalizeGameState(state: GameState, cards: readonly SkillCard[] = bundledCards): GameState {
  return retireSkillReferences({
    ...state,
    presentations: [], experienceEvents: [],
    settings: { ...DEFAULT_SETTINGS, ...state.settings },
    players: state.players.map((player, index) => ({
      ...player,
      character: characterChoice(player.character ?? defaultSeatCharacter(index)),
      active: player.active ?? true,
      participation: player.participation ?? (player.active === false ? 'won' : 'playing'),
      flyingTiles: player.flyingTiles ?? 0,
      turnFixedSeconds: player.turnFixedSeconds ?? state.settings.turnFixedSeconds ?? DEFAULT_SETTINGS.turnFixedSeconds,
      turnExtraSeconds: player.turnExtraSeconds ?? state.settings.turnExtraSeconds ?? DEFAULT_SETTINGS.turnExtraSeconds,
    })),
    turnStartedAt: state.turnStartedAt ?? Date.now(),
    turnState: state.turnState ?? 'waiting',
    turnElapsedMs: state.turnElapsedMs ?? 0,
    timerPaused: Boolean(state.timerPaused),
    handEnded: Boolean(state.handEnded),
    dealerRepeat: Boolean(state.dealerRepeat),
    skillDeck: state.skillDeck ?? [],
    skillDiscard: state.skillDiscard ?? [],
    effects: state.effects ?? [],
    history: state.history ?? [],
    virtual: state.virtual ?? { started: false, wall: [], hands: {}, rivers: {} },
  }, cards);
}

function applySettlementToState(
  state: GameState,
  input: SettlementInput,
  result: SettlementResult,
) {
  state = stopTurnClock(state);
  const deltas: Record<string, number> = {};
  for (const player of state.players) deltas[player.id] = 0;
  for (const [payerId, payment] of Object.entries(result.payments)) {
    deltas[payerId] = (deltas[payerId] ?? 0) - payment;
  }
  deltas[input.winnerId] = (deltas[input.winnerId] ?? 0) + result.winnerGain;

  let players = state.players.map((player) => ({
    ...player,
    score: player.score + (deltas[player.id] ?? 0),
    riichi: state.settings.bloodBattle && player.id !== input.winnerId ? player.riichi : false,
    participation: player.id === input.winnerId ? 'won' as const : player.participation,
  }));
  if (state.settings.bloodBattle) {
    players = players.map((player) =>
      player.id === input.winnerId ? { ...player, active: false, participation: 'won' as const } : player,
    );
  }

  const activeCount = players.filter((player) => player.active).length;
  const shouldContinue = state.settings.bloodBattle && activeCount > 1;
  const handEnded = !state.settings.bloodBattle || activeCount <= 1;
  const winnerWasDealer = state.players.find((player) => player.id === input.winnerId)?.wind === '东';
  const nextIndex = shouldContinue ? nextActiveIndex(players, state.turnIndex) : state.turnIndex;
  let next: GameState = {
    ...state,
    players,
    turnIndex: nextIndex,
    turnStartedAt: Date.now(),
    phase: 'skill' as const,
    handEnded,
    dealerRepeat: !state.settings.bloodBattle && Boolean(winnerWasDealer),
    honba: state.settings.bloodBattle ? state.honba : winnerWasDealer ? state.honba + 1 : 0,
    riichiSticks: 0,
  };
  next = addEvent(next, '和牌结算', result.summary, deltas);
  if (state.settings.bloodBattle && activeCount <= 1) {
    next = addEvent(next, '本局结束', '血战到底只剩一名未和牌玩家，可开始下一局');
  }
  return next;
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {children}
    </div>
  );
}

function Tile({ tile, small = false, hidden = false }: { tile: string; small?: boolean; hidden?: boolean }) {
  if (hidden) return <span className={`tile-back ${small ? 'small' : ''}`} aria-label="暗牌" />;
  return (
    <img
      className={`tile-image ${small ? 'small' : ''}`}
      src={`/tiles/${tile}.png`}
      alt={tileLabel(tile)}
      draggable={false}
    />
  );
}

const PLATE_WIND_ART: Record<PlayerState['wind'], string> = {
  东: '/art/winds/east.svg',
  南: '/art/winds/south.svg',
  西: '/art/winds/west.svg',
  北: '/art/winds/north.svg',
};

function PlayerPlate({
  player,
  current,
  position,
  onSelect,
  onDraw,
  thinking,
  drawDisabled,
  presentation,
}: {
  presentation: PresentationSequence;
  player: PlayerState;
  current: boolean;
  position: string;
  onSelect: () => void;
  onDraw: () => void;
  thinking: boolean;
  drawDisabled: boolean;
}) {
  const participation = player.participation ?? (player.active ? 'playing' : 'won');
  const winEvent = presentation.event?.kind === 'win' ? presentation.event : undefined;
  const winner = winEvent?.playerId === player.id;
  const celebrating = winner && presentation.phase === 'impact';
  const wonColor = participation === 'won' && !(winner && presentation.phase === 'intro');
  return (
    <article
      data-player-id={player.id}
      className={`tablet-player-card ${position} ${player.riichi ? 'is-riichi' : ''} ${current ? 'is-current' : ''} ${wonColor ? 'is-won' : ''} ${celebrating ? 'is-win-celebrating' : ''} ${winEvent?.loserId === player.id && presentation.phase === 'impact' ? 'is-struck' : ''} ${participation === 'eliminated' ? 'is-eliminated' : ''}`}
    >
      <button className="plate-character-button" type="button" onClick={onSelect} aria-label={`查看${player.name}的操作`}>
        <CharacterAvatar choice={player.character} className="plate-character-avatar" />
      </button>
      <button
        className="player-card-main"
        style={{ '--score-chars': player.score.toLocaleString('zh-CN').length } as CSSProperties}
        aria-label={`${player.wind}家 ${player.name} ${player.score}点${player.riichi ? '，已立直' : ''}${participation === 'won' ? '，已和牌' : participation === 'eliminated' ? '，已退出' : ''}，打开玩家操作`}
        type="button"
        onClick={onSelect}
      >
        <span className="player-card-head">
          <span className={`plate-wind-mark ${player.wind === '东' ? 'is-east' : ''}`} title={player.wind === '东' ? '东家 · 庄家' : `${player.wind}家`} aria-hidden="true">
            <img src={PLATE_WIND_ART[player.wind]} alt="" draggable={false} />
            {player.wind === '东' && <span className="plate-dealer-mark">庄</span>}
          </span>
          <strong title={player.name}>{player.name}</strong>
        </span>
        <RollingScore className="player-score" fitToWidth value={player.score} playerId={player.id} sequence={presentation} />
        <WinParticles active={celebrating} />
      </button>
      <button className={`player-draw-button ${thinking ? 'is-thinking' : ''}`} type="button" aria-label={thinking ? `${player.name}我已出牌` : `${player.name}摸牌，牌山减一`} onClick={onDraw} disabled={drawDisabled}>
        <span className="player-draw-team" title={player.team}>{player.team}</span>
        <span className="player-draw-action">{thinking ? '已出牌' : <><Minus /> 摸 −1</>}</span>
      </button>
    </article>
  );
}

export function MahjongConsole({ onOpenModeChooser }: { onOpenModeChooser?: () => void } = {}) {
  const [cards, setCards] = useState<SkillCard[]>(bundledCards);
  const [game, setGame] = useState<GameState>(() => createGameState(DEFAULT_SETTINGS, allBundledIds));
  const [view, setView] = useState<View>('table');
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<SkillCard | null>(null);
  const [nfcCodesOpen, setNfcCodesOpen] = useState(false);
  const [editorCard, setEditorCard] = useState<SkillCard | null>(null);
  const [editorError, setEditorError] = useState('');
  const cardImageRequest = useRef(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardDraft, setDiscardDraft] = useState<'settings' | 'card' | null>(null);
  const settingsBaseline = useRef(''), editorBaseline = useRef('');
  const [settingsReviewBaseline, setSettingsReviewBaseline] = useState('');
  const settingsApplying = useRef(false);
  const beginEditingCard = useCallback((card: SkillCard) => {
    cardImageRequest.current++; setEditorError('');
    editorBaseline.current = JSON.stringify(card);
    setEditorCard(card);
  }, []);
  const closeEditor = () => {
    if (editorCard && JSON.stringify(editorCard) !== editorBaseline.current) setDiscardDraft('card');
    else setEditorCard(null);
  };
  const [playerActionOpen, setPlayerActionOpen] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const lastTurnTap = useRef(0);
  const [nagashiIds,setNagashiIds]=useState<string[]>([]);
  const [settingsSection,setSettingsSection]=useState('对局');
  const [drawOpen, setDrawOpen] = useState(false);
  const [tenpaiIds, setTenpaiIds] = useState<string[]>([]);
  const [drawPool, setDrawPool] = useState(3000);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [endMatchOpen, setEndMatchOpen] = useState(false);
  const [matchResultOpen, setMatchResultOpen] = useState(false);
  const [finalCharacters, setFinalCharacters] = useState<Record<string, PlayerState['character']>>({});
  const [finalSnapshot, setFinalSnapshot] = useState<MatchResultSnapshot | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [coinPrompt, setCoinPrompt] = useState<'activation' | 'reveal' | null>(null);
  const [coinError, setCoinError] = useState('');
  const [skillRecordOpen, setSkillRecordOpen] = useState(false);
  const [wushuangOpen, setWushuangOpen] = useState(false);
  const [godOpen, setGodOpen] = useState(false);
  const [wushuangActorId, setWushuangActorId] = useState('player-1');
  const [roomOpen, setRoomOpen] = useState(false);
  const [characterSeat, setCharacterSeat] = useState<number | null>(null);
  const [skillRecordSearch, setSkillRecordSearch] = useState('');
  const [manageEffectId, setManageEffectId] = useState<string | null>(null);
  const [revealTargets, setRevealTargets] = useState<string[]>([]);
  const [revealNote, setRevealNote] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [playerDrafts, setPlayerDrafts] = useState(
    createGameState(DEFAULT_SETTINGS, []).players.map(({ name, team, character }) => ({ name, team, character: characterChoice(character) })),
  );
  const [skillSearch, setSkillSearch] = useState('');
  const [skillType, setSkillType] = useState('全部');
  const [scoreTiles, setScoreTiles] = useState<string[]>([]);
  const [scoreCalculatorDraft, setScoreCalculatorDraft] = useState<{winnerId:string;value:HandCalculatorDraft}>();
  const [scoreCalculatorRevision, setScoreCalculatorRevision] = useState(0);
  const [scoreReviewOpen, setScoreReviewOpen] = useState(false);
  const settlementSubmitting = useRef(false);
  const [scoreAnalysis, setScoreAnalysis] = useState<{winningTile:string;meldText:string;automatic:boolean}>({winningTile:'',meldText:'',automatic:true});
  const [scoreForm, setScoreForm] = useState({
    winnerId: 'player-1',
    loserId: 'player-2',
    winType: 'ron' as 'ron' | 'tsumo',
    closed: true,
    fu: 30,
    dora: 0,
    uraDora: 0,
    akaDora: 0,
    flowerDora: 0,
    bonusHan: 0, environmentNumberCount: 0,
    extraPoints: 0,
    selectedYaku: [] as string[],
    yakuOverrides: {} as Record<string, number>,
  });
  const [godCostConfirmed, setGodCostConfirmed] = useState(false);
  const [skillForm, setSkillForm] = useState<SkillRecordForm>({
    actorId: 'player-1',
    cardId: bundledCards[0]?.id ?? 1,
    targetIds: [],
    duration: 'hand',
    hidden: false,
    note: '',
  });
  const [quickPointForm, setQuickPointForm] = useState({
    counterpartyId: 'outside',
    amount: 1000,
    reason: '技能／罚点调整',
  });
  const [manualForm, setManualForm] = useState({ fromId: 'player-2', toId: 'player-1', amount: 1000, reason: '手动调整' });
  const undoStack = useRef<GameState[]>([]);
  const gameRef = useRef(game);

  // oxlint-disable react/react-compiler -- Browser storage can only be hydrated after the client mounts.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { game?: GameState; cards?: SkillCard[]; skillCatalogRevision?: string };
        if (parsed.skillCatalogRevision !== SKILL_CATALOG_REVISION) {
          try {
            const backupKey = `${STORAGE_KEY}:before-skill-catalog:${SKILL_CATALOG_REVISION}`;
            if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, saved);
          } catch { /* A full backup must not prevent existing match data from loading. */ }
        }
        const restoredCards = migrateSkillLibrary(parsed.cards, parsed.skillCatalogRevision);
        setCards(restoredCards);
        if (parsed.game?.players?.length) {
          const restored = normalizeGameState(parsed.game, restoredCards);
          setGame(restored);
          gameRef.current = restored;
        }
      }
    } catch {
      // A corrupt local snapshot should never prevent the bundled table from opening.
    } finally {
      setReady(true);
    }
  }, []);
  // oxlint-enable react/react-compiler

  useEffect(() => {
    gameRef.current = game;
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, cards, skillCatalogRevision: SKILL_CATALOG_REVISION }));
    } catch {
      // Storage may be unavailable in private browsing; gameplay remains usable in memory.
    }
  }, [cards, game, ready]);

  useEffect(() => {
    if (!hasNativeLanRoom() && 'serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const rememberInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', rememberInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', rememberInstallPrompt);
  }, []);

  const commit = useCallback((updater: (current: GameState) => GameState) => {
    const current = gameRef.current;
    const next = recordSkillTransitions(current, recordRiichiTransitions(current, awardLastSurvivor(current, updater(current))), cards);
    if (next === current) return;
    undoStack.current = [...undoStack.current.slice(-29), current];
    gameRef.current = next; setGame(next);
  }, [cards]);

  const commitRemote = useCallback((updater: (current: GameState) => GameState) => {
    const current = gameRef.current;
    const next = recordSkillTransitions(current, recordRiichiTransitions(current, awardLastSurvivor(current, updater(current))), cards);
    // Persist new skill outcomes before exposing them to animations or LAN snapshots.
    if (ready && (next.experienceEvents !== current.experienceEvents || next.effects.some(e => (e.randomResult && !current.effects.some(old => old.id === e.id && old.randomResult)) || (e.wushuang && e.wushuang !== current.effects.find(old => old.id === e.id)?.wushuang)))) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ game: next, cards })); }
      catch { throw new Error('本机空间不足，技能结果未保存；请先导出备份并释放空间'); }
    }
    undoStack.current = [...undoStack.current.slice(-29), current];
    if (next.experienceEvents !== current.experienceEvents || next.presentations?.some(event => event.kind === 'skill' && !current.presentations?.some(previous => previous.id === event.id))) {
      setView('table');
      setEffectsOpen(false);
    }
    gameRef.current = next;
    setGame(next);
    return next;
  }, [cards, ready]);

  const lanHost = useLanHost({ game, cards, gameRef, commitRemote });
  const presentation = usePresentationSequence(game.presentations);

  const environment = activeEnvironment(game);
  useSilenceMode(environment?.kind === 'silence');
  const currentPlayer = game.players[game.turnIndex] ?? game.players[0];
  const actionPlayer = game.players.find(player => player.id === actionPlayerId) ?? currentPlayer;
  const actionParticipation = actionPlayer?.participation ?? (actionPlayer?.active ? 'playing' : 'won');
  const turnClock = useTurnCountdown(game);
  const timerStatus = game.timerPaused ? '已暂停' : game.turnState !== 'thinking' || game.handEnded ? '等待摸牌' : undefined;
  useRealtimeSound(lanHost.realtimeEvent);
  useCountdownSound(turnClock.enabled, turnClock.totalRemaining);
  useRiichiMusic(Boolean(environment?.kind !== 'silence' && environment?.kind !== 'night' && game.settings.riichiMusicEnabled && !game.handEnded && game.players.some((player) => player.riichi)), game.settings.riichiMusicTrack);
  const playSkillMusic = useSkillMusic(Boolean(environment?.kind !== 'silence' && environment?.kind !== 'night' && game.settings.riichiMusicEnabled), game.players.map(player => player.id).join('|'));
  const liveEffects = useMemo(() => game.effects.filter(effectIsLive), [game.effects]);
  const tableEffects = useMemo(
    () => liveEffects.filter((effect) => effect.scope === 'table' && !effectIsHidden(effect)),
    [liveEffects],
  );
  const selectedSkillCard = useMemo(
    () => cards.find((card) => card.id === skillForm.cardId) ?? cards[0],
    [cards, skillForm.cardId],
  );
  const selectedManagedEffect = useMemo(
    () => game.effects.find((effect) => effect.id === manageEffectId) ?? null,
    [game.effects, manageEffectId],
  );
  const drawPreview = useMemo(
    () => {
      const validNagashiIds = nagashiIds.filter(id => game.players.some(player => player.id === id && player.active && player.participation === 'playing'));
      return validNagashiIds.length ? calculateNagashiDraw(game, validNagashiIds) : calculateExhaustiveDraw(game.players, tenpaiIds, drawPool);
    },
    [drawPool, game, tenpaiIds, nagashiIds],
  );

  const addScoreTile = useCallback((tile: string) => {
    const nextTiles = [...scoreTiles, tile];
    setScoreTiles(nextTiles);
  }, [scoreTiles]);

  const selectedYaku = useMemo(
    () => YAKU.filter((yaku) => {
      if (!scoreForm.selectedYaku.includes(yaku.id)) return false;
      if (!scoreForm.closed && !yaku.yakuman && yaku.openHan === 0) return false;
      if (!scoreForm.closed && yaku.id === 'tanyao' && !game.settings.openTanyao) return false;
      if (['menzen-tsumo', 'haitei', 'rinshan'].includes(yaku.id) && scoreForm.winType !== 'tsumo') return false;
      if (['houtei', 'chankan'].includes(yaku.id) && scoreForm.winType !== 'ron') return false;
      return true;
    }),
    [game.settings.openTanyao, scoreForm.closed, scoreForm.selectedYaku, scoreForm.winType],
  );
  const scoringOverrides = environment?.kind === 'yaku' && environment.yakuId ? { ...scoreForm.yakuOverrides, [environment.yakuId]: 5 } : scoreForm.yakuOverrides;
  const envBonus = environmentBonus(game, scoreForm.selectedYaku, scoreForm.closed, scoreForm.environmentNumberCount);
  const yakuHan = selectedYaku.reduce(
    (sum, yaku) => sum + (envBonus.overrideId === yaku.id ? 5 : scoreForm.yakuOverrides[yaku.id] ?? (scoreForm.closed ? yaku.closedHan : yaku.openHan)),
    0,
  );
  const yakuman = selectedYaku.reduce((sum, yaku) => sum + (yaku.yakuman ?? 0), 0);
  const totalHan = envBonus.dora + yakuHan + scoreForm.dora + scoreForm.uraDora + scoreForm.akaDora + scoreForm.flowerDora + scoreForm.bonusHan;
  const scoreInput = useMemo<SettlementInput>(() => ({
    winnerId: scoreForm.winnerId,
    loserId: scoreForm.loserId,
    winType: scoreForm.winType,
    han: totalHan,
    fu: scoreForm.fu,
    yakuman,
    honba: game.honba,
    riichiSticks: game.riichiSticks,
    dealer: game.players.find((player) => player.id === scoreForm.winnerId)?.wind === '东',
    playerCount: game.settings.playerCount,
    kiriageMangan: game.settings.kiriageMangan,
    kazoeYakuman: game.settings.kazoeYakuman,
    sanmaTsumoLoss: game.settings.sanmaTsumoLoss,
    teamsEnabled: game.settings.teamsEnabled,
    extraPoints: scoreForm.extraPoints,
  }), [game.honba, game.players, game.riichiSticks, game.settings, scoreForm, totalHan, yakuman]);
  let scorePreview: SettlementResult | null = null;
  let scoreError = '';
  try {
    if (scoreTiles.length && scoreAnalysis.automatic) {
      const analysis = analyzeHand({tiles:scoreTiles,winningTile:scoreAnalysis.winningTile,melds:parseMelds(scoreAnalysis.meldText),closed:scoreForm.closed,winType:scoreForm.winType,seatWind:game.players.find(p=>p.id===scoreForm.winnerId)?.wind ?? '东',roundWind:game.roundWind,selected:scoreForm.selectedYaku,bonusHan:totalHan-yakuHan});
      if (analysis.error || !analysis.complete) throw Error(analysis.error || '请选择最后和到的牌，或关闭自动勾选改用手动结算');
    }
    if (yakuman <= 0 && yakuHan + scoreForm.bonusHan <= 0) {
      throw new Error('仅有宝牌不能和牌，请选择至少一个役或填写技能加番');
    }
    scorePreview = calculateSettlement(scoreInput, game.players);
  } catch (error) {
    scoreError = error instanceof Error ? error.message : '无法计算点数';
  }

  const filteredCards = useMemo(() => {
    const query = skillSearch.trim().toLocaleLowerCase('zh-CN');
    return cards.filter((card) => {
      const matchesType = skillType === '全部' || (skillType === '随机' ? Boolean(card.randomRule) : card.type.code === skillType);
      const haystack = `${card.name} ${card.summary} ${card.effectDescription}`.toLocaleLowerCase('zh-CN');
      return matchesType && (!query || haystack.includes(query));
    });
  }, [cards, skillSearch, skillType]);

  const playerEffectSummaries = useMemo(() => {
    const result: Record<string, Array<{ id: string; label: string; hidden?: boolean }>> = {};
    for (const player of game.players) result[player.id] = [];
    for (const effect of liveEffects) {
      const sourceId = effectSourceId(effect);
      const hidden = effectIsHidden(effect);
      const cardName = effect.cardName ?? cards.find((card) => card.id === effect.cardId)?.name ?? '技能效果';
      if (hidden) {
        if (result[sourceId]) result[sourceId].push({ id: effect.id, label: '暗置陷阱', hidden: true });
        continue;
      }
      const targets = effectTargets(effect);
      const shownFor = new Set(targets);
      if (effect.scope === 'self') shownFor.add(sourceId);
      if (effect.scope !== 'table') shownFor.add(sourceId);
      for (const playerId of shownFor) {
        if (!result[playerId]) continue;
        result[playerId].push({
          id: effect.id,
          label: playerId === sourceId && !targets.includes(playerId) ? `已发动·${cardName}` : cardName,
        });
      }
    }
    return result;
  }, [cards, game.players, liveEffects]);

  const effectGroups = useMemo(() => {
    if (!actionPlayer) return [] as Array<{ label: string; effects: ActiveSkillEffect[] }>;
    const playerId = actionPlayer.id;
    const table = liveEffects.filter((effect) => effect.scope === 'table');
    const hidden = liveEffects.filter(effectIsHidden);
    const publicPlayerEffects = liveEffects.filter((effect) => effect.scope !== 'table' && !effectIsHidden(effect));
    const team = publicPlayerEffects.filter((effect) => effect.scope === 'team' && effectTargets(effect).includes(playerId));
    const incoming = publicPlayerEffects.filter((effect) => effectSourceId(effect) !== playerId && effect.scope !== 'team' && effectTargets(effect).includes(playerId));
    const self = publicPlayerEffects.filter((effect) => effectSourceId(effect) === playerId && effectTargets(effect).includes(playerId));
    const outgoing = publicPlayerEffects.filter((effect) => effectSourceId(effect) === playerId && effectTargets(effect).some((id) => id !== playerId));
    const unassigned = publicPlayerEffects.filter((effect) => effectSourceId(effect) === playerId && effectTargets(effect).length === 0);
    const other = publicPlayerEffects.filter((effect) => {
      const targets = effectTargets(effect);
      return effectSourceId(effect) !== playerId && !targets.includes(playerId) && effect.scope !== 'team';
    });
    return [
      { label: '对我生效', effects: incoming },
      { label: '我对自己使用', effects: self },
      { label: '我发动的待处理效果', effects: unassigned },
      { label: '队伍共享', effects: team },
      { label: '我对其他人使用', effects: outgoing },
      { label: '其他公开效果', effects: other },
      { label: '牌桌环境', effects: table },
      { label: '暗置陷阱', effects: hidden },
    ].filter((group) => group.effects.length > 0);
  }, [actionPlayer, liveEffects]);

  const teamTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const player of game.players) totals.set(player.team, (totals.get(player.team) ?? 0) + player.score);
    return [...totals.entries()];
  }, [game.players]);

  const openScoreFor = useCallback((preferredWinnerId?: string) => {
    const winner =
      game.players.find((player) => player.id === preferredWinnerId && player.active) ??
      game.players.find((player) => player.active) ??
      game.players[0];
    const loser = game.players.find((player) => player.active && player.id !== winner?.id);
    setScoreForm((form) => ({
      ...form,
      winnerId: winner?.id ?? '',
      loserId: loser?.id ?? '',
    }));
    setView('score');
  }, [game.players]);

  const setStatus = useCallback((message: string) => {
    setGame((current) => {
      const next = { ...current, status: message };
      gameRef.current = next;
      return next;
    });
  }, []);

  const focusPlayer = useCallback((playerId: string, openActions = false) => {
    setActionPlayerId(playerId);
    if (openActions) setPlayerActionOpen(true);
  }, []);

  // 牌山 +/- 仅纠正数量，不再隐式启动或切换计时。
  const adjustWall = useCallback((delta: number) => {
    commit((current) => ({ ...current, wallCount: Math.max(0, Math.min(999, current.wallCount + delta)) }));
  }, [commit]);

  const downloadJson = (fileName: string, data: unknown) => {
    void exportJson(fileName, data).catch(cause => setStatus(cause instanceof Error ? cause.message : '导出失败'));
  };

  const actOnPlayerTurn = useCallback((playerId: string, kind: 'draw.confirm' | 'discard.confirm', turnStartedAt: number) => {
    if (Date.now() - lastTurnTap.current < 500) return;
    lastTurnTap.current = Date.now();
    try {
      const outcome = applyRemoteControllerCommand(gameRef.current, cards, playerId, { kind, turnStartedAt });
      commitRemote(() => outcome.nextGame);
      if (outcome.realtimeEvent) void lanHost.broadcastRealtimeEvent({ kind: 'draw', actorPlayerId: playerId });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '操作未完成，请核对当前状态');
    }
  }, [cards, commitRemote, lanHost, setStatus]);

  const toggleTimerPause = useCallback(() => {
    commitRemote(current => {
      const paused = !current.timerPaused;
      return addEvent(setTimerPaused(current, paused), paused ? '暂停计时' : '恢复计时',
        paused ? '所有设备计时暂停，保留本巡已用时间' : '计时已恢复；尚未摸牌时继续等待');
    });
  }, [commitRemote]);

  const updatePlayerTimer = useCallback((playerId: string, field: 'turnFixedSeconds' | 'turnExtraSeconds', value: number) => {
    commit((current) => ({
      ...current,
      turnStartedAt: current.players[current.turnIndex]?.id === playerId ? Math.max(Date.now(), current.turnStartedAt + 1) : current.turnStartedAt,
      turnElapsedMs: current.players[current.turnIndex]?.id === playerId ? 0 : current.turnElapsedMs,
      players: current.players.map((player) => player.id === playerId
        ? { ...player, [field]: Math.max(0, Math.min(field === 'turnFixedSeconds' ? 3600 : 86_400, Math.trunc(value || 0))) }
        : player),
      status: `${current.players.find((player) => player.id === playerId)?.name ?? '玩家'}的${field === 'turnFixedSeconds' ? '固定时间' : '额外时间'}已调整`,
    }));
  }, [commit]);

  const setWallCount = useCallback((value: number) => {
    setGame((current) => {
      const nextCount = Number.isFinite(value) ? Math.max(0, Math.min(999, Math.trunc(value))) : 0;
      const next = {
        ...current,
        wallCount: nextCount,
        status: nextCount === 0 ? '牌山已空；需要时请手动按“流局”结算' : current.status,
      };
      gameRef.current = next;
      return next;
    });
  }, []);

  const declareRiichiFor = useCallback((playerId: string) => {
    commit((current) => {
      if (current.handEnded) return { ...current, status: '本局已经结束，请开始下一局' };
      const player = current.players.find((candidate) => candidate.id === playerId);
      if (!player || player.riichi) return { ...current, status: `${player?.name ?? '该玩家'}已经立直` };
      if (!player.active || player.participation !== 'playing') return { ...current, status: '该玩家当前不在本局中' };
      if (player.score < 1000) return { ...current, status: '点数不足，不能支付立直棒' };
      return addEvent(
        {
          ...current,
          riichiSticks: current.riichiSticks + 1,
          players: current.players.map((candidate) =>
            candidate.id === player.id ? { ...candidate, score: candidate.score - 1000, riichi: true } : candidate,
          ),
        },
        '立直',
        `${player.name}支付 1,000 点立直`,
        { [player.id]: -1000 },
      );
    });
    setPlayerActionOpen(false);
  }, [commit]);

  const quickAdjustPlayer = useCallback((signedAmount: number) => {
    const selected = gameRef.current.players.find(player => player.id === actionPlayerId) ?? gameRef.current.players[gameRef.current.turnIndex];
    const amount = Math.max(0, Math.round(Math.abs(signedAmount)));
    if (!selected || !amount) {
      setStatus('请填写有效点数');
      return;
    }
    commit((current) => {
      const player = current.players.find((candidate) => candidate.id === selected.id);
      if (!player) return current;
      const deltas: Record<string, number> = { [player.id]: signedAmount > 0 ? amount : -amount };
      const counterparty = current.players.find((candidate) => candidate.id === quickPointForm.counterpartyId);
      if (counterparty && counterparty.id !== player.id) deltas[counterparty.id] = -deltas[player.id];
      const direction = deltas[player.id] > 0 ? '获得' : '扣除';
      return addEvent(
        {
          ...current,
          players: current.players.map((candidate) => ({ ...candidate, score: candidate.score + (deltas[candidate.id] ?? 0) })),
        },
        '快速点数调整',
        `${player.name}${direction} ${amount.toLocaleString('zh-CN')} 点：${quickPointForm.reason || '手动调整'}${counterparty ? `（与${counterparty.name}结算）` : '（场外增减）'}`,
        deltas,
      );
    });
  }, [actionPlayerId, commit, quickPointForm, setStatus]);

  const setPlayerParticipation = useCallback((playerId: string, participation: 'playing' | 'eliminated', scope: 'hand' | 'match' = 'hand') => {
    commit((current) => {
      const player = current.players.find((candidate) => candidate.id === playerId);
      if (!player) return current;
      const restored = participation === 'playing';
      return addEvent(
        {
          ...current,
          players: current.players.map((candidate) => candidate.id === playerId ? {
            ...candidate,
            active: restored,
            participation,
            eliminationScope: restored ? undefined : scope,
            eliminationReason: restored ? undefined : quickPointForm.reason || '技能效果',
          } : candidate),
        },
        restored ? '玩家恢复' : scope === 'hand' ? '退出本局' : '移出整场',
        restored ? `${player.name}已恢复参与` : `${player.name}因${quickPointForm.reason || '技能效果'}${scope === 'hand' ? '退出本局' : '移出整场比赛'}`,
      );
    });
    setPlayerActionOpen(false);
  }, [commit, quickPointForm.reason]);

  const defaultSkillTargets = useCallback((card: SkillCard | undefined, actorId: string) => {
    if (!card) return [];
    if (card.type.code === '单') return [actorId];
    if (card.type.code === '团') {
      const actor = gameRef.current.players.find((player) => player.id === actorId);
      return gameRef.current.players.filter((player) => actor && player.team === actor.team).map((player) => player.id);
    }
    return [];
  }, []);

  const openSkillRecorder = useCallback((actorId?: string, preferredCardId?: number) => {
    const actor = gameRef.current.players.find((player) => player.id === actorId) ?? gameRef.current.players[gameRef.current.turnIndex];
    const card = cards.find((candidate) => candidate.id === preferredCardId) ?? cards[0];
    if (!actor || !card) return;
    setGodOpen(false); setWushuangOpen(false); setSkillRecordOpen(false);
    setGodCostConfirmed(false);
    setSkillForm({
      actorId: actor.id,
      cardId: card.id,
      targetIds: defaultSkillTargets(card, actor.id),
      duration: 'hand',
      hidden: card.type.code === '陷',
      note: card.effectDescription,
    });
    setSkillRecordSearch(''); setCoinError('');
    setPlayerActionOpen(false);
    setDetailCard(null);
    setSkillForm(form => ({ ...form, environment: {}, activationId: crypto.randomUUID() }));
    if(isWushuangCard(card)){setWushuangActorId(actor.id);setWushuangOpen(true);}else if(godCardCost(card)) setGodOpen(true); else setSkillRecordOpen(true);
  }, [cards, defaultSkillTargets]);

  const chooseSkillCard = useCallback((cardId: number) => {
    if (cardId === skillForm.cardId) return;
    setGodCostConfirmed(false); setCoinError('');
    const card = cards.find((candidate) => candidate.id === cardId);
    setSkillForm((form) => ({
      ...form,
      cardId,
      targetIds: defaultSkillTargets(card, form.actorId),
      hidden: card?.type.code === '陷',
      note: card?.effectDescription ?? '',
    }));
  }, [cards, defaultSkillTargets, skillForm.cardId]);

  const recordSkillEffect = useCallback((coinDecision?: CoinDecision) => {
    const card = cards.find(c => c.id === skillForm.cardId);
    if(card&&isWushuangCard(card)){setWushuangActorId(skillForm.actorId);setWushuangOpen(true);setSkillRecordOpen(false);return;}
    if (godCardCost(card) && coinDecision === undefined) {setSkillRecordOpen(false);setGodOpen(true);return;}
    if (godCardCost(card) && !godCostConfirmed) { setStatus('请先一次确认实体代价已交出'); return; }
    if (card && !(card.type.code === '陷' && skillForm.hidden) && usesDecisionCoin(card) && coinDecision === undefined) {
      setCoinError(''); setCoinPrompt('activation'); setSkillRecordOpen(false); return;
    }
    try {
      const outcome = applyRemoteControllerCommand(gameRef.current, cards, skillForm.actorId, { kind: 'skill.activate', input: {
        wushuangCostConfirmed: godCostConfirmed, cardId: skillForm.cardId, targetPlayerIds: skillForm.targetIds, duration: skillForm.duration,
        faceDown: skillForm.hidden, coinDecision, effectText: skillForm.note, environment: skillForm.environment, activationId: skillForm.activationId,
      } });
      setCoinPrompt(null); setCoinError(''); commitRemote(() => outcome.nextGame); setSkillRecordOpen(false); setView('table');
    } catch (e) { const message = e instanceof Error ? e.message : '技能发动失败'; setCoinError(message); setStatus(message); }
  }, [cards, skillForm, godCostConfirmed, commitRemote, setStatus]);

  const openEffectManager = useCallback((effect: ActiveSkillEffect) => {
    setManageEffectId(effect.id); setCoinError('');
    setRevealTargets(effectTargets(effect));
    setRevealNote(effect.note ?? effect.effectText ?? '');
  }, []);

  const revealEffect = useCallback((coinDecision?: CoinDecision) => {
    if (!selectedManagedEffect) return;
    const currentEffect = gameRef.current.effects.find(effect => effect.id === selectedManagedEffect.id);
    if (!currentEffect || !effectIsLive(currentEffect) || !effectIsHidden(currentEffect)) return;
    if (!revealTargets.length || revealTargets.some(id => !gameRef.current.players.some(player => player.id === id && player.active))) { setCoinError('请选择仍在本局的受影响玩家'); return; }
    const card = cards.find(c => c.id === selectedManagedEffect.cardId);
    if (usesDecisionCoin({ name: selectedManagedEffect.cardName ?? card?.name ?? '', randomRule: card?.randomRule }, selectedManagedEffect.randomRule) && coinDecision === undefined) {
      setCoinError(''); setCoinPrompt('reveal'); return;
    }
    try {
      const outcome = applyRemoteControllerCommand(gameRef.current, cards, effectSourceId(selectedManagedEffect), {
        kind: 'skill.reveal', input: { effectId: selectedManagedEffect.id, targetPlayerIds: revealTargets, effectText: revealNote, coinDecision },
      });
      setCoinPrompt(null); setCoinError(''); commitRemote(() => outcome.nextGame); setManageEffectId(null); setEffectsOpen(false); setView('table');
    } catch (e) { const message = e instanceof Error ? e.message : '陷阱发动失败'; setCoinError(message); setStatus(message); }
  }, [cards, commitRemote, revealNote, revealTargets, selectedManagedEffect, setStatus]);

  const resolveEffect = useCallback((effectId: string) => {
    if (gameRef.current.effects.find(effect => effect.id === effectId)?.wushuang?.status === 'pending') { setStatus('请在无双专属面板完成结算，不能直接结束效果'); return; }
    commit((current) => {
      const effect = current.effects.find((candidate) => candidate.id === effectId);
      if (!effect || !effectIsLive(effect)) return current;
      if(effect.wushuang?.status==='pending')return {...current,status:'请在无双专属面板完成结算，不能直接结束效果'};
      const cardName = effect.cardName ?? cards.find((card) => card.id === effect.cardId)?.name ?? '技能效果';
      return addEvent(
        {
          ...current,
          environmentSkillId: current.environmentSkillId === effect.cardId ? null : current.environmentSkillId,
          effects: current.effects.map((candidate) => candidate.id === effectId ? { ...candidate, status: 'resolved' as const, state: 'resolved' as const } : candidate),
        },
        '效果结束',
        `「${cardName}」已结算或解除`,
      );
    });
    setManageEffectId(null);
  }, [cards, commit, setStatus]);

  const applySettlement = useCallback(() => {
    if (settlementSubmitting.current) return;
    if(pendingWushuang(gameRef.current).length){setStatus('请先完成麻将无双结算');return;}
    if (game.handEnded) {
      setStatus('本局已经结算，请先开始下一局');
      return;
    }
    if (!scorePreview) {
      setStatus(scoreError || '请完善和牌信息');
      return;
    }
    settlementSubmitting.current = true;
    setScoreReviewOpen(false);
    commit((current) => recordWin(current, applySettlementToState(current, scoreInput, scorePreview as SettlementResult), scoreInput, scorePreview as SettlementResult, selectedYaku.map(yaku => yaku.name), scoreTiles));
    setView('table');
  }, [commit, game.handEnded, scoreError, scoreInput, scorePreview, setStatus, selectedYaku, scoreTiles]);

  const drawIssue = game.handEnded ? '本局已经结算，请先开始下一局。' : pendingWushuang(game).length ? '请先完成麻将无双结算，再进行流局操作。' : !Number.isFinite(drawPool) ? '请填写有效的未听罚符总额。' : '';
  const applyExhaustiveDraw = useCallback(() => {
    if (gameRef.current.handEnded || pendingWushuang(gameRef.current).length || !Number.isFinite(drawPool)) return;
    commit((current) => {
      if(pendingWushuang(current).length)return {...current,status:'请先完成麻将无双结算，再进行流局操作'};
      const validNagashiIds = nagashiIds.filter(id => current.players.some(player => player.id === id && player.active && player.participation === 'playing'));
      const deltas = validNagashiIds.length ? calculateNagashiDraw(current, validNagashiIds) : calculateExhaustiveDraw(current.players, tenpaiIds, drawPool);
      const playing = current.players.filter((player) => player.active && player.participation === 'playing');
      const tenpaiNames = playing.filter((player) => tenpaiIds.includes(player.id)).map((player) => player.name);
      const dealer = current.players.find((player) => player.wind === '东');
      return addEvent(
        {
          ...current,
          players: current.players.map((player) => ({ ...player, score: player.score + (deltas[player.id] ?? 0), riichi: false })),
          handEnded: true,
          dealerRepeat: Boolean(dealer && tenpaiIds.includes(dealer.id) && dealer.active),
          honba: current.honba + 1,
        },
        '流局结算',
        validNagashiIds.length ? `流局满贯：${playing.filter(p=>nagashiIds.includes(p.id)).map(p=>p.name).join('、')}；替代未听罚符，供托保留` : tenpaiNames.length === 0 ? '流局：无人听牌' : tenpaiNames.length === playing.length ? '流局：全员听牌，无罚符转移' : `流局：${tenpaiNames.join('、')}听牌（振听亦按听牌）`,
        deltas,
      );
    });
    setDrawOpen(false);
    setTenpaiIds([]);
    setNagashiIds([]);
  }, [commit, drawPool, tenpaiIds, nagashiIds]);

  const beginNextHand = useCallback(() => {
    commit((current) => {
      if(pendingWushuang(current).length)return addEvent(current,'无双待结算','请先完成麻将无双结算，再开始下一局');
      const seatCount = current.settings.playerCount;
      const repeatDealer = Boolean(current.dealerRepeat);
      let handNumber = current.handNumber;
      let roundWind = current.roundWind;
      let players = current.players.map((player) => ({ ...player }));

      if (!repeatDealer) {
        handNumber += 1;
        if (handNumber > seatCount) {
          handNumber = 1;
          const roundIndex = Math.max(0, WINDS.indexOf(roundWind));
          roundWind = WINDS[(roundIndex + 1) % WINDS.length];
        }
        players = players.map((player) => {
          const windIndex = Math.max(0, WINDS.indexOf(player.wind));
          return { ...player, wind: WINDS[(windIndex - 1 + seatCount) % seatCount] };
        });
      }

      const returnedCards = players.flatMap((player) => player.skillHand);
      players = players.map((player) => ({
        ...player,
        active: player.participation === 'eliminated' && player.eliminationScope === 'match' ? false : true,
        participation: player.participation === 'eliminated' && player.eliminationScope === 'match' ? 'eliminated' as const : 'playing' as const,
        eliminationScope: player.participation === 'eliminated' && player.eliminationScope === 'match' ? 'match' as const : undefined,
        eliminationReason: player.participation === 'eliminated' && player.eliminationScope === 'match' ? player.eliminationReason : undefined,
        riichi: false,
        flowers: 0,
        nuki: 0,
        kans: 0,
        flyingTiles: 0,
        skillHand: [],
        usedSkillsThisTurn: 0,
        turnFixedSeconds: current.settings.turnFixedSeconds,
        turnExtraSeconds: current.settings.turnExtraSeconds,
      }));
      const eastIndex = Math.max(0, players.findIndex((player) => player.wind === '东'));
      let next: GameState = {
        ...current,
        players,
        roundWind,
        handNumber,
        honba: current.honba,
        turnIndex: eastIndex,
        turnNumber: 1,
        presentations: [],
        turnStartedAt: Date.now(),
        turnState: 'waiting',
        turnElapsedMs: 0,
        timerPaused: false,
        phase: 'skill',
        handEnded: false, experienceEvents: [], judgementAwarded: false,
        dealerRepeat: false,
        wallCount: resolveInitialWallCount(current.settings),
        environmentSkillId: current.effects.find((effect) => effectIsLive(effect) && effect.duration === 'match' && effect.scope === 'table')?.cardId ?? null,
        skillDiscard: [...current.skillDiscard, ...returnedCards],
        effects: current.effects.map((effect) => effect.duration === 'match' && effectIsLive(effect) ? effect : { ...effect, wushuang: undefined, status: 'resolved' as const, state: 'resolved' as const }),
        virtual: { started: false, wall: [], hands: {}, rivers: {} },
      };
      if (next.settings.wushuang && next.settings.startingSkillCards > 0) {
        for (const player of next.players) {
          next = drawSkills(next, player.id, next.settings.startingSkillCards, cards.map((card) => card.id));
        }
      }
      return addEvent(
        next,
        repeatDealer ? '庄家连庄' : '开始下一局',
        `${roundWind}${handNumber}局已准备，每位玩家重新进入牌局${next.settings.wushuang ? `并获得 ${next.settings.startingSkillCards} 张技能卡` : ''}`,
      );
    });
    setScoreTiles([]);
    setScoreCalculatorDraft(undefined);
    setScoreCalculatorRevision(value => value + 1);
    setScoreForm((form) => ({
      ...form,
      closed: true,
      fu: 30,
      dora: 0,
      uraDora: 0,
      akaDora: 0,
      flowerDora: 0,
      bonusHan: 0, environmentNumberCount: 0,
      extraPoints: 0,
      selectedYaku: [],
      yakuOverrides: {},
    }));
  }, [cards, commit]);

  const applyManualTransfer = useCallback(() => {
    const amount = Math.max(0, Math.round(safeNumber(manualForm.amount)));
    if (!amount || manualForm.fromId === manualForm.toId) {
      setStatus('请选择不同的付款者与收款者，并填写正数点数');
      return;
    }
    commit((current) => {
      const from = current.players.find((player) => player.id === manualForm.fromId);
      const to = current.players.find((player) => player.id === manualForm.toId);
      if (!from || !to) return { ...current, status: '找不到玩家' };
      const deltas = { [from.id]: -amount, [to.id]: amount };
      return addEvent(
        {
          ...current,
          players: current.players.map((player) => ({ ...player, score: player.score + (deltas[player.id] ?? 0) })),
        },
        '点数调整',
        `${from.name}向${to.name}支付 ${amount.toLocaleString('zh-CN')} 点：${manualForm.reason || '手动调整'}`,
        deltas,
      );
    });
  }, [commit, manualForm, setStatus]);

  const startFreshMatch = useCallback(() => {
    if (settingsApplying.current) return;
    settingsApplying.current = true;
    const next = createGameState(settingsDraft, cards.map((card) => card.id));
    next.players = next.players.map((player, index) => ({
      ...player,
      name: playerDrafts[index]?.name.trim() || player.name,
      team: settingsDraft.teamsEnabled ? playerDrafts[index]?.team.trim() || player.team : '个人',
      character: playerDrafts[index]?.character ?? characterChoice(player.character),
    }));
    undoStack.current = [...undoStack.current.slice(-29), gameRef.current];
    gameRef.current = next;
    setGame(next);
    setScoreForm((form) => ({
      ...form,
      winnerId: next.players[0]?.id ?? '',
      loserId: next.players[1]?.id ?? '',
      closed: true,
      fu: 30,
      dora: 0,
      uraDora: 0,
      akaDora: 0,
      flowerDora: 0,
      bonusHan: 0, environmentNumberCount: 0,
      extraPoints: 0,
      selectedYaku: [],
      yakuOverrides: {},
    }));
    setScoreTiles([]);
    setScoreCalculatorDraft(undefined);
    setScoreCalculatorRevision(value => value + 1);
    setSettingsOpen(false);
    setView('table');
  }, [cards, playerDrafts, settingsDraft]);

  const finishMatch = useCallback(() => {
    const current = gameRef.current;
    const rankedPlayers = [...current.players].sort((a, b) => b.score - a.score || WINDS.indexOf(a.wind) - WINDS.indexOf(b.wind));
    const totals = new Map<string, number>();
    for (const player of current.players) totals.set(player.team, (totals.get(player.team) ?? 0) + player.score);
    const snapshot: MatchResultSnapshot = {
      endedAt: new Date().toISOString(),
      roundLabel: `${current.roundWind}${current.handNumber}局 · ${current.honba}本场`,
      targetPoints: current.settings.targetPoints,
      riichiSticks: current.riichiSticks,
      teamsEnabled: current.settings.teamsEnabled,
      players: rankedPlayers.map(({ id, name, wind, team, score }) => ({ id, name, wind, team, score })),
      teams: [...totals.entries()].map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN')),
    };
    const next = createGameState(current.settings, cards.map((card) => card.id));
    next.players = next.players.map((player, index) => ({
      ...player,
      name: current.players[index]?.name ?? player.name,
      team: current.players[index]?.team ?? player.team,
      character: current.players[index]?.character ?? characterChoice(player.character),
    }));
    next.status = '上一场对局已结束；新对局已经自动重置';
    undoStack.current = [...undoStack.current.slice(-29), current];
    gameRef.current = next;
    setFinalCharacters(Object.fromEntries(current.players.map(player => [player.id, player.character])));
    setFinalSnapshot(snapshot);
    setGame(next);
    setEndMatchOpen(false);
    setMatchResultOpen(true);
    setScoreTiles([]);
    setScoreCalculatorDraft(undefined);
    setScoreCalculatorRevision(value => value + 1);
    setScoreForm((form) => ({ ...form, winnerId: next.players[0]?.id ?? '', loserId: next.players[1]?.id ?? '', selectedYaku: [], yakuOverrides: {}, dora: 0, uraDora: 0, akaDora: 0, flowerDora: 0, bonusHan: 0, environmentNumberCount: 0, extraPoints: 0 }));
  }, [cards]);

  const openSettings = useCallback(() => {
    settingsApplying.current = false;
    const players = Array.from({ length: 4 }, (_, index) => ({
      name: game.players[index]?.name ?? ('玩家' + ['一', '二', '三', '四'][index]),
      team: game.players[index]?.team ?? (index % 2 === 0 ? '朱雀' : '玄武'),
      character: characterChoice(game.players[index]?.character),
    }));
    settingsBaseline.current = JSON.stringify([game.settings, players]);
    setSettingsReviewBaseline(settingsBaseline.current);
    setSettingsDraft({ ...game.settings }); setPlayerDrafts(players); setSettingsSection('对局'); setSettingsOpen(true);
  }, [game.players, game.settings]);
  const closeSettings = () => {
    if (JSON.stringify([settingsDraft, playerDrafts]) !== settingsBaseline.current) setDiscardDraft('settings');
    else setSettingsOpen(false);
  };

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) {
      setStatus('没有可撤销的记录');
      return;
    }
    gameRef.current = previous;
    setGame({ ...previous, status: '已撤销上一项操作' });
  }, [setStatus]);

  const installTabletApp = useCallback(async () => {
    if (!installPrompt) {
      setStatus('请使用浏览器菜单中的“添加到主屏幕”安装平板版');
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
      setStatus('麻将无双已添加到平板桌面');
    }
  }, [installPrompt, setStatus]);

  const saveCard = useCallback(() => {
    const issue = skillEditorIssue(editorCard);
    if (!editorCard || issue) { setEditorError(issue); return; }
    const exists = cards.some((card) => card.id === editorCard.id);
    setCards((current) => {
      return exists
        ? current.map((card) => (card.id === editorCard.id ? editorCard : card))
        : [...current, editorCard];
    });
    if (!exists) {
      commit((current) => addEvent(
        { ...current, skillDeck: [...current.skillDeck, editorCard.id] },
        '技能库更新',
        `新技能卡「${editorCard.name}」已加入牌库`,
      ));
    }
    setEditorCard(null);
    if (exists) setStatus(`已保存技能卡「${editorCard.name}」`);
  }, [cards, commit, editorCard, setStatus]);

  const newCard = useCallback(() => {
    const id = Math.max(0, ...cards.map((card) => card.id)) + 1;
    beginEditingCard({
      id,
      name: '新技能卡',
      rarity: '普通',
      type: { code: '单', name: '个人增益', guide: '【单｜个人增益】仅可对自己使用' },
      effectDescription: '',
      flavorText: '',
      summary: '',
      timing: { playWindow: '摸牌前', duration: '立即', expiry: '结算后' },
      targeting: { scope: '自己', factionRelations: ['自己'] },
      constraints: [],
      stackability: '不可叠加',
      ambiguities: [],
      artwork: null,
      custom: true,
    });
  }, [cards, beginEditingCard]);

  const handleCardImage = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const request = ++cardImageRequest.current, id = editorCard?.id;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 1_500_000) {
      setEditorError('请选择不超过 1.5 MB 的 PNG、JPEG 或 WebP 图片'); return;
    }
    setEditorError('');
    void createImageBitmap(file).then(bitmap => {
      bitmap.close(); if (request !== cardImageRequest.current) return;
      const reader = new FileReader();
      reader.onload = () => { if (request === cardImageRequest.current && typeof reader.result === 'string') setEditorCard(card => card && card.id === id ? { ...card, artwork: reader.result as string } : card); };
      reader.onerror = () => { if (request === cardImageRequest.current) setEditorError('图片读取失败，请重新选择'); };
      reader.readAsDataURL(file);
    }).catch(() => { if (request === cardImageRequest.current) setEditorError('图片无法读取，请选择有效图片'); });
  }, [editorCard?.id]);

  const applyImportedCards = useCallback((imported: SkillCard[]) => {
  setCards(imported);
  const importedIds = new Set(imported.map((card) => card.id));
  commit((current) => {
    const players = current.players.map((player) => ({
      ...player,
      skillHand: player.skillHand.filter((cardId) => importedIds.has(cardId)),
    }));
    const discard = current.skillDiscard.filter((cardId) => importedIds.has(cardId));
    const keptDeck = current.skillDeck.filter((cardId) => importedIds.has(cardId));
    const accounted = new Set([...players.flatMap((player) => player.skillHand), ...discard, ...keptDeck]);
    const added = imported.map((card) => card.id).filter((cardId) => !accounted.has(cardId));
    return addEvent(
      {
        ...current,
        players,
        skillDeck: [...keptDeck, ...added],
        skillDiscard: discard,
        effects: current.effects.filter((effect) => importedIds.has(effect.cardId)),
        environmentSkillId: current.environmentSkillId !== null && importedIds.has(current.environmentSkillId) ? current.environmentSkillId : null,
      },
      '技能库导入',
      `已同步 ${imported.length} 张技能卡并清理失效引用`,
    );
  });
  setStatus(`已导入 ${imported.length} 张技能卡`);
  }, [commit, setStatus]);

  const applyImportedMatch = useCallback((imported: GameState) => {
    const restored = normalizeGameState(imported, cards);
    undoStack.current = [...undoStack.current.slice(-29), gameRef.current];
    gameRef.current = restored;
    setGame({ ...restored, status: '已导入对局记录' });
  }, [cards]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebMcpTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // Unsupported preview implementations should not affect the visible site.
      }
    };

    register({
      name: 'read_mahjong_match_state',
      title: '读取麻将对局状态',
      description: '读取当前局、行动玩家、阶段及所有玩家点数，不修改对局。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const current = gameRef.current;
        return {
          round: `${current.roundWind}${current.handNumber}局`,
          honba: current.honba,
          phase: current.phase,
          currentPlayerId: current.players[current.turnIndex]?.id,
          players: current.players.map(({ id, name, wind, score, team, active }) => ({ id, name, wind, score, team, active })),
        };
      },
    });

    register({
      name: 'record_mahjong_score_transfer',
      title: '记录麻将点数转移',
      description: '在当前可见对局中把指定点数从一名玩家转给另一名玩家，并写入历史记录。',
      inputSchema: {
        type: 'object',
        properties: {
          fromPlayerId: { type: 'string' },
          toPlayerId: { type: 'string' },
          points: { type: 'integer', minimum: 100 },
          reason: { type: 'string' },
        },
        required: ['fromPlayerId', 'toPlayerId', 'points'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const payload = input as { fromPlayerId?: string; toPlayerId?: string; points?: number; reason?: string };
        const current = gameRef.current;
        const amount = Math.round(safeNumber(payload.points));
        const from = current.players.find((player) => player.id === payload.fromPlayerId);
        const to = current.players.find((player) => player.id === payload.toPlayerId);
        if (!from || !to || from.id === to.id || amount <= 0) throw new Error('玩家或点数无效');
        const deltas = { [from.id]: -amount, [to.id]: amount };
        const next = addEvent(
          {
            ...current,
            players: current.players.map((player) => ({ ...player, score: player.score + (deltas[player.id] ?? 0) })),
          },
          '点数调整',
          `${from.name}向${to.name}支付 ${amount.toLocaleString('zh-CN')} 点：${payload.reason || '工具记录'}`,
          deltas,
        );
        undoStack.current = [...undoStack.current.slice(-29), current];
        gameRef.current = next;
        setGame(next);
        return { status: 'recorded', fromPlayerId: from.id, toPlayerId: to.id, points: amount };
      },
    });

    return () => lifecycle.abort();
  }, []);

  const wushuangActor=game.players.find(p=>p.id===wushuangActorId);
  const wushuangSession=[...game.effects].reverse().find(e=>e.ownerId===wushuangActorId&&e.wushuang)?.wushuang;
  const positions = ['seat-bottom', 'seat-right', 'seat-top', 'seat-left'];
  const isTurnActive = game.turnState === 'thinking' && !game.handEnded;

  return (
    <TooltipProvider>
      <main className={`app-shell view-${view}`}>
        <NfcIntentTarget cards={cards} players={game.players.map(p=>({id:p.id,name:p.name,character:p.character,wind:p.wind,active:p.active&&p.participation==='playing'}))} disabled={environment?.kind==='night'} canPrepare={game.settings.wushuang&&!game.handEnded} onPrepare={(id,actorId)=>openSkillRecorder(actorId,id)}/>
        <FloatingEmote events={lanHost.emoteEvents} tablet />

        <ExperiencePresentation onPlayed={playSkillMusic} events={game.experienceEvents} dark={environment?.kind === 'night'} contextKey={environment?.effectId} players={game.players} onComplete={event=>{if(event.cardName==='麻将无双'&&event.actorId===wushuangActorId&&pendingWushuang(gameRef.current).some(e=>e.ownerId===event.actorId))setWushuangOpen(true);}} />
        {ready && <NightMode active={environment?.kind === 'night'} effectId={environment?.effectId} events={game.experienceEvents} leave={() => environment && resolveEffect(environment.effectId)} />}
        <PresentationOverlay sequence={presentation} tablet characters={Object.fromEntries(game.players.map(player => [player.id, characterChoice(player.character)]))} />
        <header className="topbar">
          <button className="brand-lockup" type="button" aria-label="返回麻将无双对局台" onClick={() => setView('table')}>
            <span className="brand-mark" aria-hidden="true"><img src="/brand/mahjong-wushuang-logo.png" alt="" /></span>
            <span>
              <small>日本麻将对局台</small>
              <strong>麻将无双</strong>
            </span>
          </button>

          <Tabs value={view} onValueChange={(value) => setView(value as View)} className="top-tabs">
            <TabsList variant="line" className="top-tabs-list">
              <TabsTrigger value="table">对局台</TabsTrigger>
              <TabsTrigger value="score">和牌结算</TabsTrigger>
              <TabsTrigger value="skills">技能库</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="header-actions">
            {onOpenModeChooser && (
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="切换牌桌或手机遥控模式" onClick={onOpenModeChooser} />}>
                  <Smartphone />
                </TooltipTrigger>
                <TooltipContent>切换设备模式</TooltipContent>
              </Tooltip>
            )}
            <span className="mode-chip"><Sparkles /> {game.settings.wushuang ? '无双模式' : '标准日麻'}</span>
            <Button variant="ghost" size="icon-lg" aria-label="对局音乐设置" onClick={() => setMusicOpen(true)}><Music2 /></Button>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label={game.settings.riichiMusicEnabled ? '关闭对局音乐' : '开启对局音乐'} onClick={() => commit((current) => ({ ...current, settings: { ...current.settings, riichiMusicEnabled: !current.settings.riichiMusicEnabled }, status: current.settings.riichiMusicEnabled ? '对局音乐已关闭' : '对局音乐已开启' }))} />}>
                {game.settings.riichiMusicEnabled ? <Volume2 /> : <VolumeX />}
              </TooltipTrigger>
              <TooltipContent>{game.settings.riichiMusicEnabled ? '关闭对局音乐' : '开启对局音乐'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="撤销上一项操作" onClick={undo} />}>
                <RotateCcw />
              </TooltipTrigger>
              <TooltipContent>撤销上一项操作</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="导入与导出" onClick={() => setDataOpen(true)} />}>
                <Archive />
              </TooltipTrigger>
              <TooltipContent>导入与导出</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon-lg" aria-label="打开规则设置" onClick={openSettings}>
              <Settings2 />
            </Button>
          </div>
        </header>

        <div className="match-ribbon">
          <div>
            <span className="eyebrow">{game.roundWind}{game.handNumber}局</span>
            <strong>{game.honba} 本场</strong>
            <span>供托 {game.riichiSticks}</span>
            <span>返还点 {game.settings.targetPoints.toLocaleString('zh-CN')}</span>
          </div>
          <div className="team-score">
            {teamTotals.slice(0, 2).map(([team, total], index) => (
              <span className="team-score-part" key={team}>
                {index > 0 && <i />}
                <span>{team}阵营</span>
                <RollingScore value={total} playerId={`team-${team}`} groupIds={game.players.filter(player => player.team === team).map(player => player.id)} sequence={presentation} />
              </span>
            ))}
          </div>
          <button className="history-link" type="button" onClick={() => setHistoryOpen(true)}>
            <History /> 对局记录
          </button>
        </div>

        {view === 'table' && currentPlayer && (
          <section className="physical-table-stage" role="tabpanel" aria-label="实体牌桌对局助手">
            <div className="physical-table-main">
              <div className={`physical-table-board ${isTurnActive ? 'is-turn-active' : ''}`}>
                {game.players.map((player, index) => (
                  <PlayerPlate
                    key={player.id}
                    player={player}
                    presentation={presentation}
                    current={index === game.turnIndex && isTurnActive}
                    position={positions[index]}
                    onSelect={() => focusPlayer(player.id, true)}
                    thinking={index === game.turnIndex && isTurnActive}
                    drawDisabled={game.handEnded || player.participation !== 'playing' || (!(index === game.turnIndex && game.turnState === 'thinking') && (Boolean(game.timerPaused) || game.wallCount <= 0))}
                    onDraw={() => actOnPlayerTurn(player.id, index === game.turnIndex && game.turnState === 'thinking' ? 'discard.confirm' : 'draw.confirm', game.turnStartedAt)}
                  />
                ))}

                <div className="table-wind-dial" aria-hidden="true">
                  {positions.map((position, index) => <span key={position} className={`wind-slot ${position} ${game.players[index]?.riichi ? 'is-riichi' : isTurnActive && index === game.turnIndex ? 'is-lit' : ''}`} />)}
                </div>

                <div className="table-control-island">
                  <div className="table-round-line">
                    <strong>{game.roundWind}{game.handNumber}局 · {game.honba}本场</strong>
                    <span>供托 {game.riichiSticks}</span>
                  </div>
                  <div className="wall-control">
                    <button className="wall-stepper" type="button" aria-label="牌山减一" onClick={() => adjustWall(-1)}><Minus /></button>
                    <label className={`wall-number ${game.wallCount === 0 ? 'is-empty' : ''}`} data-digits={String(game.wallCount).length}>

                      <input
                        aria-label="牌山剩余张数"
                        inputMode="numeric"
                        type="number"
                        min={0}
                        max={999}
                        value={game.wallCount}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => setWallCount(Number(event.target.value))}
                      />
                    </label>
                    <button className="wall-stepper" type="button" aria-label="牌山加一" onClick={() => adjustWall(1)}><Plus /></button>
                  </div>
                  {environment ? <EnvironmentControls environment={environment} actorId={currentPlayer.id} seats={game.players.map(p => ({ ...p, active: p.active && p.participation === 'playing' }))} host teams={game.settings.teamsEnabled} action={(actorId, input) => { commitRemote(current => applyEnvironmentAction(current, actorId, input, true)); }} /> : tableEffects.length > 0 ? (
                    <button className="environment-banner" type="button" onClick={() => tableEffects.length === 1 ? openEffectManager(tableEffects[0]) : setEffectsOpen(true)}>
                      <FitLabel maxSize={32}>{`${tableEffects.map((effect) => effect.cardName ?? cards.find((card) => card.id === effect.cardId)?.name ?? '牌桌效果').join('、')}`}</FitLabel>
                    </button>
                  ) : <span className="no-environment">当前无环境效果</span>}

                </div>
                {game.settings.turnTimerEnabled && <div className="table-turn-timer"><TurnTimerDisplay
                  statusLabel={timerStatus}
                  playerLabel={`${currentPlayer.wind}家 · ${currentPlayer.name}`}
                  fixedRemaining={turnClock.fixedRemaining}
                  extraRemaining={turnClock.extraRemaining}
                  usingExtra={turnClock.usingExtra}
                  expired={turnClock.expired}
                /><button className="timer-pause-toggle" type="button" onClick={toggleTimerPause} disabled={game.handEnded} aria-pressed={Boolean(game.timerPaused)}>{game.timerPaused ? '▶ 恢复计时' : 'Ⅱ 暂停计时'}</button></div>}
              </div>

              <nav className="table-side-actions" aria-label="牌桌快捷操作">
        {pendingWushuang(game).map(e=><button type='button' className='ws-resume' key={e.id} onClick={()=>{setWushuangActorId(e.ownerId);setWushuangOpen(true);}}><Sparkles/><span>无双待结算</span><small>{game.players.find(p=>p.id===e.ownerId)?.name}</small></button>)}
                {lanHost.supported && <button type="button" onClick={() => setRoomOpen(true)}><Radio /><span>房间</span>{lanHost.hostInfo && <b>{lanHost.peers.filter((peer) => peer.playerId).length}</b>}</button>}
                <button type="button" onClick={() => openSkillRecorder(currentPlayer.id)} disabled={!game.settings.wushuang}><Sparkles /><span>技能</span></button>
                
                <button type="button" onClick={() => { setTenpaiIds([]); setNagashiIds([]); setDrawOpen(true); }}><ListRestart /><span>流局</span></button>
                <button type="button" onClick={beginNextHand}><ChevronDown /><span>下一局</span></button>
                <button type="button" onClick={() => setEffectsOpen(true)}><ShieldCheck /><span>效果</span>{liveEffects.length > 0 && <b>{liveEffects.length}</b>}</button>
                <button type="button" onClick={() => setHistoryOpen(true)}><History /><span>记录</span></button>
                {installPrompt && <button type="button" onClick={() => void installTabletApp()}><Download /><span>安装</span></button>}
                <button className="end-match-button" type="button" onClick={() => setEndMatchOpen(true)}><Flag /><span>结束</span></button>
              </nav>
            </div>
          </section>
        )}

        {view === 'score' && (
          <section className="workspace-view score-workspace" role="tabpanel" aria-label="和牌结算">
            <div className="workspace-main">
              <div className="workspace-title">
                <div><span className="eyebrow">点数计算机</span><h2>和牌结算</h2></div>
                <p>先填基本情况，再核对役与加番。牌姿可选；提交前集中核对各家收支。</p>
              </div>

              <div className="score-form-grid">
                <div className="form-block">
                  <h3>1 · 基本情况</h3>
                  <div className="field-grid two">
                    <Label>和牌者<Select value={scoreForm.winnerId} onValueChange={(value) => setScoreForm((form) => ({ ...form, winnerId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.filter((player) => !game.settings.bloodBattle || player.active).map((player) => <SelectItem key={player.id} value={player.id}>{player.wind}家 · {player.name}</SelectItem>)}</SelectContent></Select></Label>
                    <Label>和牌方式<Select value={scoreForm.winType} onValueChange={(value) => setScoreForm((form) => ({ ...form, winType: String(value) as 'ron' | 'tsumo' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ron">荣和</SelectItem><SelectItem value="tsumo">自摸</SelectItem></SelectContent></Select></Label>
                    {scoreForm.winType === 'ron' && <Label>放铳者<Select value={scoreForm.loserId} onValueChange={(value) => setScoreForm((form) => ({ ...form, loserId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.filter((player) => player.active && player.id !== scoreForm.winnerId).map((player) => <SelectItem key={player.id} value={player.id}>{player.wind}家 · {player.name}</SelectItem>)}</SelectContent></Select></Label>}
                    <Label>副露状态<Select value={scoreForm.closed ? 'closed' : 'open'} onValueChange={(value) => setScoreForm((form) => ({ ...form, closed: value === 'closed', selectedYaku: form.selectedYaku.filter((id) => value === 'closed' || (YAKU.find((yaku) => yaku.id === id)?.openHan ?? 0) > 0) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closed">门清</SelectItem><SelectItem value="open">副露</SelectItem></SelectContent></Select></Label>
                    <Label>符数<Select value={String(scoreForm.fu)} onValueChange={(value) => setScoreForm((form) => ({ ...form, fu: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[...new Set([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, scoreForm.fu])].sort((a,b)=>a-b).map((fu) => <SelectItem key={fu} value={String(fu)}>{fu} 符</SelectItem>)}</SelectContent></Select></Label>
                  </div>
                </div>

                <details className="form-block score-optional-tiles">
                  <summary><strong>牌姿识别与现场算符（可选）</strong><span>{scoreTiles.length} 张 · 可录牌识别，也可直接按现场算符</span></summary><div>
                  <HandCalculator key={`${scoreForm.winnerId}:${scoreCalculatorRevision}`} initialDraft={scoreCalculatorDraft?.winnerId===scoreForm.winnerId?scoreCalculatorDraft.value:undefined} currentFu={scoreForm.fu} onDraftChange={value=>setScoreCalculatorDraft(previous=>previous?.winnerId===scoreForm.winnerId&&JSON.stringify(previous.value)===JSON.stringify(value)?previous:{winnerId:scoreForm.winnerId,value})} tiles={scoreTiles} closed={scoreForm.closed} winType={scoreForm.winType} seatWind={game.players.find(p=>p.id===scoreForm.winnerId)?.wind ?? '东'} roundWind={game.roundWind} selected={scoreForm.selectedYaku} bonusHan={scoreForm.dora+scoreForm.uraDora+scoreForm.akaDora+scoreForm.flowerDora+scoreForm.bonusHan} overrides={scoringOverrides} openTanyao={game.settings.openTanyao} kiriage={game.settings.kiriageMangan} kazoe={game.settings.kazoeYakuman} onApply={(ids,fu,closed,analysis)=>{if(analysis)setScoreAnalysis(previous=>JSON.stringify(previous)===JSON.stringify(analysis)?previous:analysis);setScoreForm(form=>JSON.stringify(form.selectedYaku)===JSON.stringify(ids)&&(fu===undefined||fu===form.fu)&&(closed===undefined||closed===form.closed)?form:{...form,selectedYaku:ids,fu:fu??form.fu,closed:closed??form.closed});}}>
                  <div className="score-hand">
                    {scoreTiles.map((tile, index) => <button type="button" key={`${tile}-${index}`} onClick={() => setScoreTiles((tiles) => tiles.filter((_, tileIndex) => tileIndex !== index))}><Tile tile={tile} /></button>)}
                    {scoreTiles.length === 0 && <span className="empty-note">可选：点击下方牌面记录和牌牌姿</span>}
                  </div>
                  <div className="tile-picker">
                    {sortTiles([...TILE_IDS, ...(game.settings.akaDora ? ['0m', '0p', '0s'] : [])])
                      .filter((tile) => game.settings.playerCount !== 3 || (tile !== '0m' && !/^[2-8]m$/.test(tile)))
                      .map((tile) => {
                        const familyCount = scoreTiles.filter((selected) => tileFamily(selected) === tileFamily(tile)).length;
                        const redAlreadySelected = tile[0] === '0' && scoreTiles.includes(tile);
                        return <button type="button" key={tile} disabled={familyCount >= 4 || redAlreadySelected} onClick={() => addScoreTile(tile)}><Tile tile={tile} small /></button>;
                      })}
                  </div>
                  </HandCalculator>
                  </div>
                </details>

                <div className="form-block yaku-block">
                  <div className="block-heading"><h3>2 · 役与番数</h3><strong>{yakuman ? `${yakuman} 倍役满` : `${totalHan} 番`}</strong></div>
                  <div className="yaku-grid">
                    {YAKU.map((yaku) => {
                      const disabled =
                        (!scoreForm.closed && !yaku.yakuman && (yaku.openHan === 0 || (yaku.id === 'tanyao' && !game.settings.openTanyao))) ||
                        (['menzen-tsumo', 'haitei', 'rinshan'].includes(yaku.id) && scoreForm.winType !== 'tsumo') ||
                        (['houtei', 'chankan'].includes(yaku.id) && scoreForm.winType !== 'ron');
                      const checked = !disabled && scoreForm.selectedYaku.includes(yaku.id);
                      const han = scoreForm.closed ? yaku.closedHan : yaku.openHan;
                      const effectiveHan = scoreForm.yakuOverrides[yaku.id] ?? han;
                      return (
                        <div className="yaku-option-wrap" key={yaku.id}>
                          <Label className={`yaku-option ${disabled ? 'disabled' : ''}`}>
                            <Checkbox checked={checked} disabled={disabled} onCheckedChange={(isChecked) => setScoreForm((form) => {
                              const exclusiveGroup = YAKU_EXCLUSIVE_GROUPS.find((group) => group.includes(yaku.id)) ?? [];
                              const retained = form.selectedYaku.filter((id) => id !== yaku.id && (!isChecked || !exclusiveGroup.includes(id)));
                              return { ...form, selectedYaku: isChecked ? [...retained, yaku.id] : retained };
                            })} />
                            <span>{yaku.name}<small>{yaku.yakuman ? `${yaku.yakuman} 倍役满` : scoreForm.yakuOverrides[yaku.id] !== undefined ? `默认 ${han} · 本次 ${effectiveHan} 番` : `${han} 番`}</small></span>
                          </Label>
                          {checked && !yaku.yakuman && <Input className="yaku-han-editor" aria-label={`${yaku.name}本次番数`} title="可按规则怪谈等技能修改本次番数" type="number" min={0} max={30} value={effectiveHan} onChange={(event) => setScoreForm((form) => ({ ...form, yakuOverrides: { ...form.yakuOverrides, [yaku.id]: Math.max(0, Number(event.target.value)) } }))} />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="form-block">
                  <h3>3 · 宝牌与技能修正</h3>
                  <div className="field-grid five">
                    <EnvironmentBonusField environment={environment} count={scoreForm.environmentNumberCount} change={environmentNumberCount => setScoreForm(form => ({ ...form, environmentNumberCount }))} />
                    {[['dora', '宝牌'], ['uraDora', '里宝牌'], ['akaDora', '赤宝牌'], ['flowerDora', '花 / 北'], ['bonusHan', '技能加番']].map(([key, label]) => (
                      <Label key={key}>{label}<Select value={String(scoreForm[key as keyof typeof scoreForm] as number)} onValueChange={(value) => setScoreForm((form) => ({ ...form, [key]: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{HAN_NUMBER_OPTIONS.map((count) => <SelectItem key={count} value={String(count)}>{count}</SelectItem>)}</SelectContent></Select></Label>
                    ))}
                  </div>
                  <Label className="extra-points-field">技能额外得点<Input type="number" inputMode="numeric" step={100} min={0} max={1000000} placeholder="0" value={scoreForm.extraPoints || ''} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setScoreForm((form) => ({ ...form, extraPoints: Math.max(0, Math.min(1000000, Number(event.target.value) || 0)) }))} /><small>例如“恭喜发财”固定增加的 2000 点；荣和由放铳者支付，自摸由仍在局内的对手合计支付，阵营队友免付。</small></Label>
                </div>
              </div>
            </div>

            <aside className="result-panel">
              <span className="eyebrow">实时结果</span>
              {scorePreview ? (
                <>
                  <h2>{scorePreview.label}</h2>
                  <div className="result-total"><span>和牌者获得</span><strong className="score-value-animate" key={scorePreview.winnerGain}>+{scorePreview.winnerGain.toLocaleString('zh-CN')}</strong></div>
                  <div className="payment-list">
                    {game.players.map((player) => {
                      const payment = scorePreview?.payments[player.id] ?? 0;
                      const gain = player.id === scoreForm.winnerId ? scorePreview.winnerGain : payment ? -payment : 0;
                      return <div key={player.id}><span>{player.wind} · {player.name}</span><strong className={gain > 0 ? 'positive' : gain < 0 ? 'negative' : ''}>{gain > 0 ? '+' : ''}{gain.toLocaleString('zh-CN')}</strong></div>;
                    })}
                  </div>
                  <p>{scorePreview.summary}</p>
                  <Button className="gold-button result-apply" size="lg" onClick={() => { settlementSubmitting.current = false; setScoreReviewOpen(true); }} disabled={game.handEnded}><Save /> {game.handEnded ? '本局已结算' : '核对并结算'}</Button>
                </>
              ) : <div className="result-error">{scoreError}</div>}

              <div className="manual-transfer">
                <h3>手动点数转移</h3>
                <div className="field-grid two">
                  <Label>付款者<Select value={manualForm.fromId} onValueChange={(value) => setManualForm((form) => ({ ...form, fromId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.map((player) => <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>)}</SelectContent></Select></Label>
                  <Label>收款者<Select value={manualForm.toId} onValueChange={(value) => setManualForm((form) => ({ ...form, toId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.map((player) => <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>)}</SelectContent></Select></Label>
                </div>
                <Label>点数<Input type="number" min={100} step={100} value={manualForm.amount} onChange={(event) => setManualForm((form) => ({ ...form, amount: Number(event.target.value) }))} /></Label>
                <Label>原因<Input value={manualForm.reason} onChange={(event) => setManualForm((form) => ({ ...form, reason: event.target.value }))} /></Label>
                <Button variant="outline" className="full-width" onClick={applyManualTransfer}>记录转移</Button>
              </div>
            </aside>
          </section>
        )}

        {view === 'skills' && (
          <section className="workspace-view skills-workspace" role="tabpanel" aria-label="技能卡库">
            <div className="workspace-main">
              <div className="workspace-title skills-title">
                <div><span className="eyebrow">已录入 {cards.length} 张</span><h2>技能卡资料库</h2></div>
                <div className="library-actions"><Button variant="outline" onClick={() => setNfcCodesOpen(true)}><Radio /> NFC 代码</Button><Button variant="outline" onClick={() => downloadJson('麻将无双技能卡资料库.json', { schemaVersion: 1, skillCatalogRevision: SKILL_CATALOG_REVISION, cards })}><Download /> 导出</Button><Button className="gold-button" onClick={newCard}><Plus /> 新增技能卡</Button></div>
              </div>

              <WushuangPreview players={game.players} />
              <SpecialCinematicPreview />
              <div className="filter-bar">
                <div className="search-field"><Search /><Input aria-label="搜索技能卡名或效果" placeholder="搜索卡名或效果" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} /></div>
                <div className="type-filters">
                  {['全部', '单', '团', '攻', '陷', '环', '神', '随机'].map((type) => <button type="button" key={type} className={skillType === type ? 'active' : ''} onClick={() => setSkillType(type)}>{type}</button>)}
                </div>
                <button type="button" className="import-label" onClick={() => setDataOpen(true)}><Upload /> 导入 JSON</button>
              </div>

              <div className="skill-grid">
                {filteredCards.map((card) => {
                  const style = TYPE_STYLES[card.type.code] ?? TYPE_STYLES.环;
                  return (
                    <article className={`skill-card type-${style.color}`} key={card.id}>
                      <button className="skill-card-main" type="button" onClick={() => setDetailCard(card)}>
                        <div className="card-art">{card.artwork ? <img src={card.artwork} alt="" /> : <Sparkles />}</div>
                        <div className="card-title"><strong>{card.name}</strong><span>{card.type.code}</span></div>
                        <div className="card-rules"><p>{card.summary || card.effectDescription}</p><small>{card.flavorText}</small></div>
                        <div className="card-meta"><span>{card.rarity}</span><span>{style.label}</span></div>
                      </button>
                      <button className="card-edit" type="button" aria-label={`编辑${card.name}`} onClick={() => beginEditingCard({ ...card })}><Edit3 /></button>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <footer className="status-bar" aria-live="polite">
          <span><i className="online-dot" /> {ready ? '本机自动保存' : '正在读取本机记录'}</span>
          <span>{game.status}</span>
          <span>可随时导出 JSON 备份</span>
        </footer>

        <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
          <DialogContent className="host-room-dialog room-flow-dialog">
            <DialogHeader>
              <DialogTitle>手机遥控房间</DialogTitle>
              <DialogDescription>手机操作由平板确认。房主保持 App 在前台，锁屏或切后台可能断开连接。</DialogDescription>
            </DialogHeader>
            <ol className="room-connect-steps" aria-label="连接步骤"><li><b>1</b> 同一 Wi-Fi</li><li><b>2</b> 手机打开遥控</li><li><b>3</b> 选房间与席位</li></ol>
            <div className="host-room-scroll">{!lanHost.hostInfo ? (
              <div className="host-room-start">
                <span className="host-room-hero"><Wifi /></span>
                <h3>开启本地房间</h3>
                <p>不经过互联网，也不需要登录。开启后，手机会自动找到这张牌桌；若自动发现失败，也可以输入这里显示的 IP 与端口。</p>
                {lanHost.error && <p className="host-room-error">{lanHost.error}</p>}
                <Button className="gold-button" size="lg" disabled={lanHost.starting} onClick={() => void lanHost.startRoom()}>
                  <Radio /> {lanHost.starting ? '正在开启…' : '开启房间'}
                </Button>
              </div>
            ) : (
              <div className="host-room-live">
                <section className="host-room-access">
                  <div><span>房间码</span><strong>{lanHost.roomCode}</strong></div>
                  <details><summary>手动连接地址</summary><code>{lanHost.hostInfo.host || '等待 Wi-Fi 地址'}:{lanHost.hostInfo.port}</code></details>
                </section>
                <p className="host-room-tip"><Wifi /> 手机选择自动发现的“{lanHost.hostInfo.serviceName}”，输入上方房间码，再选择自己的席位。</p>
                <section className="host-seat-list">
                  <h3><Users /> 已连接 {lanHost.peers.filter((peer) => peer.playerId).length} / {game.settings.playerCount}</h3>
                  {game.players.map((player) => {
                    const peer = lanHost.peers.find((entry) => entry.playerId === player.id);
                    return (
                      <article className={peer ? 'is-online' : ''} key={player.id}>
                        <span className="wind-seal">{player.wind}</span><CharacterAvatar choice={player.character} />
                        <div><strong>{player.name}</strong><small>{peer ? peer.deviceName : '等待手机加入'}</small></div>
                        <span>{peer ? <><Wifi /> 在线</> : <><WifiOff /> 未连接</>}</span>
                      </article>
                    );
                  })}
                </section>
                {lanHost.error && <p className="host-room-error">{lanHost.error}</p>}
              </div>
            )}</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoomOpen(false)}>返回牌桌</Button>
              {lanHost.hostInfo && <Button variant="destructive" onClick={() => void lanHost.stopRoom()}>关闭房间</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={effectsOpen} onOpenChange={setEffectsOpen}>
          <DialogContent className="effects-dialog effect-overview-dialog">
            <DialogHeader><DialogTitle>场上效果 · {actionPlayer?.name}视角</DialogTitle><DialogDescription>查看谁对谁生效、持续多久；展开卡片可读完整说明。</DialogDescription></DialogHeader>
            {effectGroups.length === 0 ? <p className="effects-empty">当前没有已记录的技能效果。</p> : (
              <div className="effects-dialog-grid">
                {effectGroups.map((group) => (
                  <section className="ledger-group" key={group.label}>
                    <h3>{group.label}<span>{group.effects.length} 项</span></h3>
                    {group.effects.map((effect) => {
                      const hidden = effectIsHidden(effect);
                      const source = game.players.find((player) => player.id === effectSourceId(effect));
                      const targets = effectTargets(effect).map((id) => game.players.find((player) => player.id === id)?.name).filter(Boolean);
                      const name = effect.cardName ?? cards.find((card) => card.id === effect.cardId)?.name ?? '技能效果';
                      return (
                        <EffectSummary key={effect.id} hidden={Boolean(hidden)} card={hidden ? undefined : { ...cards.find(card => card.id === effect.cardId), id: effect.cardId, name, effectDescription: effect.effectText ?? '' }} title={name} from={`${source?.wind ?? ''} · ${source?.name ?? '玩家'}`} to={effect.scope === 'table' ? '整张牌桌' : targets.join('、') || (effect.wushuang?.status === 'pending' ? '无双专属结算' : '未指定目标')} duration={DURATION_LABELS[effect.duration ?? 'hand']} state={effect.state} text={hidden ? undefined : (effect.effectText ?? cards.find(card => card.id === effect.cardId)?.effectDescription ?? '') + (effect.note && effect.note !== effect.effectText ? ` · ${effect.note}` : '')}>
                          <Button variant="outline" onClick={() => { setEffectsOpen(false); openEffectManager(effect); }}>{hidden ? <><Eye /> 揭示／发动</> : <><Eye /> 查看／管理</>}</Button>
                          {!hidden && effectTargets(effect).length > 0 && <Button variant="outline" onClick={() => { const targetId = effectTargets(effect)[0]; setEffectsOpen(false); focusPlayer(targetId); setQuickPointForm(form => ({ ...form, reason: name })); setPlayerActionOpen(true); }}>快速罚点</Button>}
                        </EffectSummary>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={endMatchOpen} onOpenChange={setEndMatchOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>结束整场对局？</AlertDialogTitle><AlertDialogDescription>生成本场名次和阵营结算，并立即重置新对局。仍可在新对局中撤销，恢复本场进度。{game.riichiSticks > 0 ? `当前还有 ${game.riichiSticks} 根供托，结算画面会标记为未分配。` : ''}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>继续对局</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={finishMatch}><Flag /> 生成结算并重置新对局</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={matchResultOpen} onOpenChange={setMatchResultOpen}>
          <DialogContent className="match-result-dialog match-review-dialog">
            <DialogHeader><DialogTitle>对局最终结算</DialogTitle><DialogDescription>{finalSnapshot?.roundLabel} · {finalSnapshot ? new Date(finalSnapshot.endedAt).toLocaleString('zh-CN') : ''}</DialogDescription></DialogHeader>
            {finalSnapshot && <div className="match-result-body">
              <section className="champion-panel">
                <span>第一名</span><CharacterAvatar choice={finalCharacters[finalSnapshot.players[0]?.id]} /><strong>{finalSnapshot.players[0]?.name}</strong><output>{finalSnapshot.players[0]?.score.toLocaleString('zh-CN')}</output><small>{finalSnapshot.players[0]?.team}</small>
              </section>
              <section className="ranking-panel">
                <h3>个人排名</h3>
                <div className="final-ranking-list">{finalSnapshot.players.map((player, index) => {
                  const returnDelta = player.score - finalSnapshot.targetPoints;
                  return <article className={`rank-${index + 1}`} key={player.id}><b>{index + 1}</b><CharacterAvatar choice={finalCharacters[player.id]} /><div><strong>{player.name}</strong><small>{player.wind}家</small><small>{player.team}</small></div><output>{player.score.toLocaleString('zh-CN')}<small>{returnDelta >= 0 ? '+' : ''}{returnDelta.toLocaleString('zh-CN')} 对返还点</small></output></article>;
                })}</div>
              </section>
              {finalSnapshot.teamsEnabled && <section className="team-result-panel">
                <h3>阵营结算</h3>
                <div>{finalSnapshot.teams.map((team, index) => <article key={team.name}><b>{index + 1}</b><span><strong>{team.name}阵营</strong><small>{finalSnapshot.players.filter((player) => player.team === team.name).map((player) => player.name).join(' · ')}</small></span><output>{team.score.toLocaleString('zh-CN')}</output></article>)}</div>
              </section>}
              {finalSnapshot.riichiSticks > 0 && <p className="unclaimed-pot">未分配供托：{(finalSnapshot.riichiSticks * 1000).toLocaleString('zh-CN')} 点。此数值未加入名次，便于按现场裁定处理。</p>}
            </div>}
            <DialogFooter><Button variant="outline" onClick={() => finalSnapshot && downloadJson('麻将无双最终结算.json', { schemaVersion: 1, result: finalSnapshot })}><Download /> 导出结算</Button><Button className="gold-button" onClick={() => setMatchResultOpen(false)}>进入已重置的新对局</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={scoreReviewOpen} onOpenChange={setScoreReviewOpen}>
          <DialogContent className="score-review-dialog">
            <DialogHeader><DialogTitle>核对和牌结算</DialogTitle><DialogDescription>确认后记入当前对局；返回修改会保留录入内容。</DialogDescription></DialogHeader>
            <div className="score-review-body">
              <div className="win-review-identity"><CharacterAvatar choice={game.players.find(player => player.id === scoreForm.winnerId)?.character} /><div><strong>{game.players.find(player => player.id === scoreForm.winnerId)?.wind} · {game.players.find(player => player.id === scoreForm.winnerId)?.name}</strong><span>{game.settings.playerCount} 人桌 · {scoreForm.closed ? '门清' : '副露'} · {scoreForm.winType === 'tsumo' ? '自摸，对手支付' : `荣和，${game.players.find(player => player.id === scoreForm.loserId)?.name ?? '未选择放铳者'}支付`}</span></div></div>
              <HandDisplay tiles={scoreTiles} />
              <div className="win-review-total"><strong>{yakuman ? `${yakuman} 倍役满` : `${totalHan} 番 ${scoreForm.fu} 符`}</strong><span>{selectedYaku.map(yaku => yaku.name).join('、') || '技能加番／手动录入'}</span></div>
              <dl className="win-source-list"><div><dt>役种番数（含修改）</dt><dd>{yakuHan}</dd></div><div><dt>宝牌 / 里 / 赤 / 花北</dt><dd>{scoreForm.dora} / {scoreForm.uraDora} / {scoreForm.akaDora} / {scoreForm.flowerDora}</dd></div><div><dt>技能加番</dt><dd>{scoreForm.bonusHan}</dd></div><div><dt>环境加番</dt><dd>{environment?.kind === 'number' ? Math.floor(scoreForm.environmentNumberCount / 2) : 0}{environment?.kind === 'yaku' ? '（指定役修正已计入役种）' : ''}</dd></div><div><dt>技能额外得点</dt><dd>{scoreForm.extraPoints.toLocaleString()} 点</dd></div></dl>
              {yakuman > 0 && <p className="skill-flow-note">按役满结算，普通番数与宝牌不叠加到役满倍数。</p>}
              {scorePreview ? <><div className="payment-list">{game.players.map(player => { const delta = player.id === scoreForm.winnerId ? scorePreview.winnerGain : -(scorePreview.payments[player.id] ?? 0); return <div key={player.id}><span>{player.wind} · {player.name}</span><strong className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}>{delta > 0 ? '+' : ''}{(delta || 0).toLocaleString()}</strong></div>; })}</div><p>{scorePreview.summary}</p></> : <p role="alert">{scoreError}</p>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setScoreReviewOpen(false)}>返回修改</Button><Button className="gold-button" disabled={!scorePreview || game.handEnded} onClick={applySettlement}>确认结算</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={playerActionOpen} onOpenChange={setPlayerActionOpen}>
          <DialogContent className="player-action-dialog player-command-panel">
            <DialogHeader><div className="player-command-identity">{actionPlayer && <CharacterAvatar choice={actionPlayer.character} />}<div><DialogTitle><span className="wind-seal">{actionPlayer?.wind}</span>{actionPlayer?.name}</DialogTitle><DialogDescription>玩家操作 · {actionParticipation === 'playing' ? '参与本局' : actionParticipation === 'won' ? '已和了' : '已退出'}</DialogDescription></div><strong className="player-command-score">{actionPlayer?.score.toLocaleString('zh-CN')}<small>点</small></strong></div></DialogHeader>
            {actionPlayer && <div className="player-command-scroll">
              <div className="player-action-grid player-command-primary">
                <Button className="gold-button" onClick={() => { setPlayerActionOpen(false); openScoreFor(actionPlayer.id); }} disabled={game.handEnded || actionParticipation !== 'playing'}><Trophy /><span>和了<small>录入与结算</small></span></Button>
                <Button variant="outline" onClick={() => declareRiichiFor(actionPlayer.id)} disabled={game.handEnded || actionParticipation !== 'playing' || actionPlayer.riichi}><CircleDollarSign /><span>{actionPlayer.riichi ? '已立直' : '立直'}<small>{actionPlayer.riichi ? '已支付立直棒' : '支付 1,000 点'}</small></span></Button>
                {game.settings.wushuang && <Button variant="outline" onClick={() => openSkillRecorder(actionPlayer.id)}><Sparkles /><span>记录技能<small>卡片与作用对象</small></span></Button>}
                <Button variant="outline" onClick={() => { setEffectsOpen(true); setPlayerActionOpen(false); }}><ShieldCheck /><span>查看效果<small>{playerEffectSummaries[actionPlayer.id]?.length ?? 0} 项生效中</small></span></Button>
              </div>
              <section className="quick-points-panel">
                <div className="block-heading"><h3>加点与扣点</h3><span>点选即记账 · 可撤销</span></div>
                <div className="field-grid two">
                  <Label>点数来自／去向<Select value={quickPointForm.counterpartyId} onValueChange={value => setQuickPointForm(form => ({ ...form, counterpartyId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="outside">场外增减（罚点／奖励）</SelectItem>{game.players.filter(player => player.id !== actionPlayer.id).map(player => <SelectItem key={player.id} value={player.id}>与 {player.name} 转移</SelectItem>)}</SelectContent></Select></Label>
                  <Label>原因<Input value={quickPointForm.reason} onChange={event => setQuickPointForm(form => ({ ...form, reason: event.target.value }))} /></Label>
                </div>
                <div className="point-direction-note">{quickPointForm.counterpartyId === 'outside' ? '场外记账：只改变当前玩家点数。' : ('双方转移：' + actionPlayer.name + ' 与 ' + (game.players.find(player => player.id === quickPointForm.counterpartyId)?.name ?? '所选玩家') + ' 一增一减。')}</div>
                <div className="point-columns">{[-1, 1].map(direction => <div key={direction} className={direction < 0 ? 'point-column subtract' : 'point-column add'}><h4>{direction < 0 ? '扣点 −' : '加点 +'}</h4><div>{[1000, 2000, 3000, 4000].map(amount => <Button variant="outline" key={amount} aria-label={(direction < 0 ? '扣除' : '增加') + ' ' + amount + ' 点'} onClick={() => quickAdjustPlayer(direction * amount)}>{direction < 0 ? '−' : '+'}{amount.toLocaleString('zh-CN')}</Button>)}</div></div>)}</div>
                <div className="point-custom"><Label>自定义点数<Input type="number" inputMode="numeric" min={1} step={100} value={quickPointForm.amount} onChange={event => setQuickPointForm(form => ({ ...form, amount: Math.max(0, Number(event.target.value)) }))} /></Label><Button variant="outline" className="subtract" disabled={!quickPointForm.amount} onClick={() => quickAdjustPlayer(-quickPointForm.amount)}>扣除</Button><Button variant="outline" className="add" disabled={!quickPointForm.amount} onClick={() => quickAdjustPlayer(quickPointForm.amount)}>增加</Button></div>
              </section>
              <details className="player-command-manage"><summary><Settings2 /> 玩家管理与计时<span>低频操作</span></summary><div className="player-manage-actions">
                {actionParticipation === 'eliminated' || actionParticipation === 'won' ? <Button variant="outline" onClick={() => setPlayerParticipation(actionPlayer.id, 'playing')}><UserRoundCheck /> 恢复参与</Button> : <Button variant="destructive" onClick={() => setPlayerParticipation(actionPlayer.id, 'eliminated', 'hand')}><UserMinus /> 退出本局</Button>}
                {actionParticipation === 'playing' && <Button variant="destructive" onClick={() => setPlayerParticipation(actionPlayer.id, 'eliminated', 'match')}><UserMinus /> 移出整场</Button>}
              </div><p>退出本局和移出整场仍按现有规则记录，可从对局记录撤销。</p>
              {game.settings.turnTimerEnabled && <div className="player-timer-panel">
                <div className="block-heading"><h3>想牌时间</h3><span>调整后从现在重新计时</span></div>
                <div className="field-grid two">
                  <Label>每巡固定时间<Input type="number" inputMode="numeric" min={0} max={3600} value={actionPlayer.turnFixedSeconds} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updatePlayerTimer(actionPlayer.id, 'turnFixedSeconds', Number(event.target.value))} /></Label>
                  <Label>本局剩余额外时间<Input type="number" inputMode="numeric" min={0} max={86400} value={actionPlayer.turnExtraSeconds} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updatePlayerTimer(actionPlayer.id, 'turnExtraSeconds', Number(event.target.value))} /></Label>
                </div>
                <div className="timer-quick-actions"><Button variant="outline" onClick={() => updatePlayerTimer(actionPlayer.id, 'turnFixedSeconds', 3)}>技能：固定 3 秒</Button><Button variant="outline" onClick={() => updatePlayerTimer(actionPlayer.id, 'turnExtraSeconds', game.settings.turnExtraSeconds)}>恢复额外时间</Button></div>
              </div>}
              </details>
            </div>}
            <DialogFooter className="player-command-footer"><output>{game.status}</output><Button variant="outline" onClick={undo}><RotateCcw /> 撤销上一项</Button><Button onClick={() => setPlayerActionOpen(false)}>返回牌桌</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <DrawSettlementDialog open={drawOpen} onOpenChange={setDrawOpen} game={game} tenpaiIds={tenpaiIds} onTenpaiChange={setTenpaiIds} nagashiIds={nagashiIds} onNagashiChange={setNagashiIds} pool={drawPool} onPoolChange={setDrawPool} deltas={drawPreview} issue={drawIssue} onConfirm={applyExhaustiveDraw} />

        {wushuangActor&&<WushuangWorkbench key={`${game.history[0]?.id}:${wushuangActor.id}`} open={wushuangOpen}
          storageKey={`mahjong-wushuang:workspace:${[...game.history].reverse().find(e=>['对局开始','开始下一局','庄家连庄'].includes(e.title))?.id??game.history[0]?.id}:${wushuangActor.id}`}
          actor={wushuangActor} targets={game.players.map(p=>({...p,active:p.active&&p.participation==='playing',enemy:!game.settings.teamsEnabled||p.team!==wushuangActor.team}))}
          context={{seatWind:wushuangActor.wind,roundWind:game.roundWind,rules:game.settings}} session={wushuangSession} deposits={game.riichiSticks}
          close={()=>setWushuangOpen(false)} backToCards={()=>{setWushuangOpen(false);setSkillRecordOpen(true);}}
          activate={async(decision,targetId,activationId)=>{const outcome=applyRemoteControllerCommand(gameRef.current,cards,wushuangActor.id,{kind:'skill.activate',input:{cardId:41,activationId,coinDecision:decision,wushuangCostConfirmed:true,targetPlayerIds:decision==='heads'?[]:targetId?[targetId]:[],duration:'hand',faceDown:false}});commitRemote(()=>outcome.nextGame);setWushuangOpen(false);}}
          send={async command=>{const outcome=applyRemoteControllerCommand(gameRef.current,cards,wushuangActor.id,command);if(outcome.changed)commitRemote(()=>outcome.nextGame);if(command.kind==='wushuang.commit')setWushuangOpen(false);}}
          correct={async face=>{if(wushuangSession)commitRemote(current=>correctWushuang(current,wushuangSession.effectId,face));}} />}
        {godOpen && selectedSkillCard && godCardCost(selectedSkillCard) && <GodSkillWorkbench key={skillForm.activationId || selectedSkillCard.id} card={selectedSkillCard} actorName={game.players.find(p=>p.id===skillForm.actorId)?.name || '使用者'}
          targets={game.players.filter(p=>p.id!==skillForm.actorId).map(p=>({id:p.id,name:p.name,character:p.character,wind:p.wind,active:p.active&&p.participation==='playing',enemy:!game.settings.teamsEnabled||p.team!==game.players.find(a=>a.id===skillForm.actorId)?.team}))}
          disabled={!game.settings.wushuang||game.handEnded||environment?.kind==='night'} close={()=>setGodOpen(false)}
          activate={async input=>{const outcome=applyRemoteControllerCommand(gameRef.current,cards,skillForm.actorId,{kind:'skill.activate',input});commitRemote(()=>outcome.nextGame);setGodOpen(false);setView('table');}}/>}
        <CoinDecisionDialog open={coinPrompt !== null} cardName={coinPrompt === 'reveal' ? selectedManagedEffect?.cardName ?? '陷阱卡' : selectedSkillCard?.name ?? '技能卡'} error={coinError}
          choose={decision => coinPrompt === 'reveal' ? revealEffect(decision) : recordSkillEffect(decision)}
          cancel={() => { if (coinPrompt === 'activation') setSkillRecordOpen(true); setCoinPrompt(null); setCoinError(''); }} />
        <Dialog open={skillRecordOpen} onOpenChange={setSkillRecordOpen}>
          <DialogContent className="skill-record-dialog skill-workspace-dialog">
            <DialogHeader><DialogTitle>记录技能发动</DialogTitle><DialogDescription>左侧找卡，右侧配置使用者与目标；确认后才记录到牌桌。</DialogDescription></DialogHeader>
            <div className="skill-workspace-body">
              <SkillCatalogPicker cards={cards} selectedId={skillForm.cardId} query={skillRecordSearch} onQuery={setSkillRecordSearch} onSelect={card => chooseSkillCard(card.id)} />
              <section className="skill-workspace-config" aria-label="技能配置">
                {selectedSkillCard && <div className="skill-chosen-heading"><SkillCardArt card={selectedSkillCard} /><div><small>{selectedSkillCard.type.code} · 已选技能</small><h3>{selectedSkillCard.name}</h3><p>{selectedSkillCard.effectDescription}</p></div></div>}
              <Label>使用者
                <Select value={skillForm.actorId} onValueChange={(value) => {
                  const actorId = String(value);
                  setGodCostConfirmed(false);
                  setSkillForm((form) => ({ ...form, actorId, targetIds: defaultSkillTargets(cards.find((card) => card.id === form.cardId), actorId) }));
                }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.map((player) => <SelectItem key={player.id} value={player.id}>{player.wind} · {player.name}</SelectItem>)}</SelectContent></Select>
              </Label>
              {selectedSkillCard?.type.code === '陷' && <SettingRow title="陷阱状态" detail={skillForm.hidden ? '暗置时只公开持有者，不显示卡名与效果' : '立即明置并选择受影响目标'}><Switch checked={skillForm.hidden} onCheckedChange={(checked) => setSkillForm((form) => ({ ...form, hidden: checked, targetIds: checked ? [] : form.targetIds }))} /></SettingRow>}
              {selectedSkillCard?.type.code === '单' && <p className="detected-yaku-note full">“单”只对使用者自己发动，但全场都能看到记录。</p>}
              {selectedSkillCard?.type.code === '环' && <p className="detected-yaku-note full">“环”作用于整张牌桌；新环境会令旧环境效果结束。</p>}
              {(['宿星审判'].includes(selectedSkillCard?.name ?? '') || selectedSkillCard?.type.code === '团' || selectedSkillCard?.type.code === '攻' || (selectedSkillCard?.type.code === '陷' && !skillForm.hidden)) && (
                <fieldset className="full"><legend>实际受影响玩家</legend><div className="target-grid">{game.players.map((player) => {
                  const selected = skillForm.targetIds.includes(player.id);
                  return <Label className="target-toggle" key={player.id}><Checkbox checked={selected} onCheckedChange={(checked) => setSkillForm((form) => ({ ...form, targetIds: checked ? [...form.targetIds, player.id] : form.targetIds.filter((id) => id !== player.id) }))} /><CharacterAvatar choice={player.character} /><span>{player.wind} · {player.name}<small>{player.team}</small></span></Label>;
                })}</div></fieldset>
              )}

                {(godCardCost(selectedSkillCard) || (selectedSkillCard && isWushuangCard(selectedSkillCard))) ? <p className="skill-flow-note">下一步进入专属页面，一次确认实体代价与发动条件。</p> : <>
                  <EnvironmentFields name={selectedSkillCard?.name ?? ''} value={skillForm.environment} change={environment => setSkillForm(form => ({ ...form, environment }))} />
                  <details className="skill-advanced"><summary>持续与说明 · {DURATION_LABELS[skillForm.duration]}</summary><div>
              <Label>持续范围<Select value={skillForm.duration} onValueChange={(value) => setSkillForm((form) => ({ ...form, duration: String(value) as SkillDuration }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DURATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Label>
                    <Label>显示给玩家的效果说明<textarea value={skillForm.note} onChange={event => setSkillForm(form => ({ ...form, note: event.target.value }))} /></Label>
                  </div></details>
                </>}
              </section>
            </div>
            <DialogFooter className="skill-workspace-footer"><output>{coinError || `${game.players.find(player => player.id === skillForm.actorId)?.name ?? '请选择使用者'} · ${skillForm.hidden ? '暗置，不公开卡名与效果' : selectedSkillCard?.type.code === '环' ? '作用于整张牌桌' : skillForm.targetIds.length ? skillForm.targetIds.map(id => game.players.find(player => player.id === id)?.name).join('、') : '请核对作用目标'}`}</output><Button variant="outline" onClick={() => setSkillRecordOpen(false)}>取消</Button><Button className="gold-button" disabled={!selectedSkillCard} onClick={() => recordSkillEffect()}><Sparkles /> {(godCardCost(selectedSkillCard) || (selectedSkillCard && isWushuangCard(selectedSkillCard))) ? '进入专属页面' : skillForm.hidden ? '暗置陷阱' : '记录发动'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(selectedManagedEffect) && coinPrompt !== 'reveal'} onOpenChange={(open) => !open && setManageEffectId(null)}>
          <DialogContent className="effect-manage-dialog effect-manage-workspace">
            <DialogHeader><DialogTitle>{selectedManagedEffect && effectIsHidden(selectedManagedEffect) ? '揭示暗置陷阱' : '管理技能效果'}</DialogTitle><DialogDescription>{selectedManagedEffect && effectIsHidden(selectedManagedEffect) ? '确认后将向所有玩家公开这张卡及其效果。' : '核对作用对象与说明，再决定是否解除。'}</DialogDescription></DialogHeader>
            {selectedManagedEffect && <>
              <div className="effect-manage-body">
                <EffectSummary hidden={Boolean(effectIsHidden(selectedManagedEffect))} card={effectIsHidden(selectedManagedEffect) ? undefined : { ...cards.find(card => card.id === selectedManagedEffect.cardId), id: selectedManagedEffect.cardId, name: selectedManagedEffect.cardName ?? cards.find(card => card.id === selectedManagedEffect.cardId)?.name ?? '技能效果', effectDescription: selectedManagedEffect.effectText ?? '' }} title={selectedManagedEffect.cardName ?? '技能效果'} from={game.players.find(player => player.id === effectSourceId(selectedManagedEffect))?.name ?? '玩家'} to={selectedManagedEffect.scope === 'table' ? '整张牌桌' : effectTargets(selectedManagedEffect).map(id => game.players.find(player => player.id === id)?.name ?? '玩家').join('、') || (selectedManagedEffect.wushuang?.status === 'pending' ? '无双专属结算' : '未指定目标')} duration={DURATION_LABELS[selectedManagedEffect.duration ?? 'hand']} state={selectedManagedEffect.state} text={effectIsHidden(selectedManagedEffect) ? undefined : (selectedManagedEffect.effectText || selectedManagedEffect.note || cards.find(card => card.id === selectedManagedEffect.cardId)?.effectDescription)} expanded />
                {effectIsHidden(selectedManagedEffect) ? <section className="effect-reveal-fields"><h3>选择受影响玩家</h3><div className="target-grid">{game.players.map(player => <Label className="target-toggle" key={player.id}><Checkbox disabled={!player.active} checked={revealTargets.includes(player.id)} onCheckedChange={checked => { setCoinError(''); setRevealTargets(ids => checked ? [...ids, player.id] : ids.filter(id => id !== player.id)); }} /><CharacterAvatar choice={player.character} /><span>{player.wind} · {player.name}<small>{player.active ? '可选择' : '已结束本局'}</small></span></Label>)}</div><Label>公开效果说明<textarea value={revealNote} onChange={event => setRevealNote(event.target.value)} /></Label><p className="effect-action-note">公开对象：所有玩家。受影响对象：{revealTargets.map(id => game.players.find(player => player.id === id)?.name).join('、') || '请先选择'}。</p></section> : <p className="effect-action-note">{selectedManagedEffect.wushuang?.status === 'pending' ? '无双仍待结算，请前往无双专属面板完成。' : '结束后移出场上效果列表，已记录的点数不变。需要恢复时可撤销上一项操作。'}</p>}
              </div>
              <DialogFooter><output className="effect-action-feedback">{coinError}</output>
                <Button variant="outline" onClick={() => setManageEffectId(null)}>{effectIsHidden(selectedManagedEffect) ? '保持暗置' : '返回牌桌'}</Button>
                {effectIsHidden(selectedManagedEffect) ? <Button className="gold-button" disabled={!revealTargets.length || revealTargets.some(id => !game.players.some(player => player.id === id && player.active))} onClick={() => revealEffect()}><Eye /> 揭示并发动</Button> : <>
                  {effectTargets(selectedManagedEffect).length > 0 && <Button variant="outline" onClick={() => { const targetId = effectTargets(selectedManagedEffect)[0]; const name = selectedManagedEffect.cardName ?? '技能效果'; setManageEffectId(null); focusPlayer(targetId); setQuickPointForm(form => ({ ...form, reason: name })); setPlayerActionOpen(true); }}>对目标罚点</Button>}
                  <Button variant="destructive" disabled={selectedManagedEffect.wushuang?.status === 'pending'} onClick={() => resolveEffect(selectedManagedEffect.id)}>结束／解除效果</Button>
                </>}
              </DialogFooter>
            </>}

          </DialogContent>
        </Dialog>

        <Dialog open={musicOpen} onOpenChange={setMusicOpen}>
          <DialogContent className="table-music-dialog">
            <DialogHeader><DialogTitle>对局音乐</DialogTitle><DialogDescription>仅牌桌主机播放，立即生效，不会重开对局。</DialogDescription></DialogHeader>
            <SettingRow title={game.settings.riichiMusicEnabled ? '播放音乐 · 已开启' : '播放音乐 · 已关闭'} detail="无双歌曲优先播放，结束后恢复仍有效的立直音乐"><Switch aria-label="播放对局音乐" checked={game.settings.riichiMusicEnabled} onCheckedChange={(checked) => commit((current) => ({ ...current, settings: { ...current.settings, riichiMusicEnabled: checked } }))} /></SettingRow>
            <Label>立直曲目<Select value={game.settings.riichiMusicTrack} onValueChange={(value) => commit((current) => ({ ...current, settings: { ...current.settings, riichiMusicTrack: value ?? 'random' } }))}><SelectTrigger aria-label="立直曲目"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="random">随机播放</SelectItem>{RIICHI_MUSIC.map((track) => <SelectItem key={track.id} value={track.id}>{track.label}</SelectItem>)}</SelectContent></Select></Label>
            <output className="table-music-status">{game.settings.riichiMusicEnabled ? '音乐已开启；有立直或无双演出时按原规则播放。' : '音乐已关闭，仍保留当前选择的曲目。'}</output><DialogFooter><Button onClick={() => setMusicOpen(false)}>返回牌桌</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={settingsOpen} onOpenChange={open => { if (!open) closeSettings(); }}>
          <DialogContent className="setup-dialog wide-dialog rules-workspace">
            <DialogHeader><DialogTitle>新对局规则</DialogTitle><DialogDescription>调整后会建立一场新对局，当前对局可用撤销恢复。</DialogDescription></DialogHeader>
            <div className="rules-overview"><span><strong>{settingsDraft.playerCount} 人桌</strong><small>{settingsDraft.wushuang ? '麻将无双' : '标准日麻'}</small></span><span><strong>{settingsDraft.startingPoints.toLocaleString()} 点</strong><small>每人开局</small></span><span><strong>{settingsDraft.initialWallCount ?? automaticInitialWallCount(settingsDraft)} 张</strong><small>初始牌山</small></span></div>
            <div className="settings-layout"><nav className="settings-shortcuts" aria-label="规则快捷导航">{['对局','玩家与角色','无双与技能','高级','核对开局'].map((name, index) => <button type="button" key={name} aria-current={settingsSection === name ? 'page' : undefined} onClick={() => setSettingsSection(name)}><b>{index + 1}</b><span>{name}<small>{['人数、点数与牌山','姓名、阵营与头像','技能与特殊玩法','计分、计时与音乐','查看本次改动'][index]}</small></span></button>)}</nav><div className="settings-scroll" key={settingsSection}>
<section className="settings-section" hidden={settingsSection !== '对局'} aria-label="对局"><h3>对局</h3>
<SettingRow title="参与人数" detail="三人麻将会移除二万至八万"><Select value={String(settingsDraft.playerCount)} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, playerCount: Number(value) as 3 | 4 }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="4">四人麻将</SelectItem><SelectItem value="3">三人麻将</SelectItem></SelectContent></Select></SettingRow>
<div className="field-grid two"><Label>开局点数<Input type="number" step={1000} min={0} value={settingsDraft.startingPoints} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, startingPoints: Math.max(0, Number(event.target.value)) }))} /></Label><Label>返还点 / 目标点<Input type="number" step={1000} min={0} value={settingsDraft.targetPoints} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, targetPoints: Math.max(0, Number(event.target.value)) }))} /></Label></div>
<SettingRow title="花牌" detail="允许记录春夏秋冬、梅兰竹菊"><Switch checked={settingsDraft.flowersEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, flowersEnabled: checked }))} /></SettingRow>
                <div className="field-grid two wall-settings-grid">
                  <Label>实体花牌数量<Input type="number" inputMode="numeric" min={0} max={32} disabled={!settingsDraft.flowersEnabled} value={settingsDraft.flowerTileCount} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, flowerTileCount: Math.max(0, Math.min(32, Number(event.target.value) || 0)) }))} /><small>启用花牌后会加入初始牌山；常见八花为 8 张。</small></Label>
                  <Label>初始牌山<Input type="number" inputMode="numeric" min={0} max={999} value={settingsDraft.initialWallCount ?? automaticInitialWallCount(settingsDraft)} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, initialWallCount: Math.max(0, Math.min(999, Number(event.target.value) || 0)) }))} /><small>{settingsDraft.initialWallCount === null ? '当前按人数、王牌与花牌自动计算' : '当前使用自定义张数'}</small></Label>
                </div>
                {settingsDraft.initialWallCount !== null && <Button className="wall-auto-reset" type="button" variant="outline" onClick={() => setSettingsDraft((draft) => ({ ...draft, initialWallCount: null }))}>恢复自动计算（{automaticInitialWallCount(settingsDraft)} 张）</Button>}
                <SettingRow title="三麻拔北" detail="三人麻将可把北风当作宝牌"><Switch checked={settingsDraft.nukiEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, nukiEnabled: checked }))} /></SettingRow>
</section>
<section className="settings-section" hidden={settingsSection !== '玩家与角色'} aria-label="玩家与角色"><h3>玩家与角色</h3>
<SettingRow title="阵营计分" detail="默认东／西同队、南／北同队；自摸不向队友收分"><Switch checked={settingsDraft.teamsEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, teamsEnabled: checked }))} /></SettingRow>
<SettingRow title="对家自动同队" detail="开启后以东／西、南／北为默认阵营"><Switch checked={settingsDraft.oppositeTeams} onCheckedChange={(checked) => { setSettingsDraft((draft) => ({ ...draft, oppositeTeams: checked })); if (checked) setPlayerDrafts((drafts) => drafts.map((player, index) => ({ ...player, team: index % 2 === 0 ? '朱雀' : '玄武' }))); }} /></SettingRow>
<div className="player-settings-grid">{playerDrafts.slice(0, settingsDraft.playerCount).map((player, index) => <div key={index}><span className="wind-seal">{WINDS[index]}</span><Input aria-label={`${WINDS[index]}家名称`} value={player.name} onChange={(event) => setPlayerDrafts((drafts) => drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, name: event.target.value } : draft))} /><Input aria-label={`${WINDS[index]}家阵营`} disabled={!settingsDraft.teamsEnabled} value={player.team} onChange={(event) => setPlayerDrafts((drafts) => drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, team: event.target.value } : draft))} /></div>)}</div>
<h4>角色</h4><div className="character-seat-choices">{playerDrafts.slice(0, settingsDraft.playerCount).map((player, index) => <button type="button" key={index} onClick={() => setCharacterSeat(index)}><CharacterAvatar choice={player.character} /><span>{WINDS[index]}家 · {player.name}<small>{player.character?.name ?? '选择角色'}</small></span></button>)}</div>
</section>
<section className="settings-section" hidden={settingsSection !== '无双与技能'} aria-label="无双与技能"><h3>无双与技能</h3>
<SettingRow title="麻将无双" detail="技能卡、环境与陷阱区"><Switch checked={settingsDraft.wushuang} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, wushuang: checked, bloodBattle: checked ? draft.bloodBattle : false }))} /></SettingRow>
<SettingRow title="血战到底" detail="和牌者退场，其余玩家继续"><Switch checked={settingsDraft.bloodBattle} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, bloodBattle: checked }))} /></SettingRow>
<SettingRow title="飞牌使用" detail="在实体牌桌记录飞牌与技能造成的移牌"><Switch checked={settingsDraft.flyingTiles} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, flyingTiles: checked }))} /></SettingRow>
<div className="slider-setting"><span><strong>每巡技能上限</strong><small>{settingsDraft.maxSkillsPerTurn} 张</small></span><Slider min={0} max={5} step={1} value={[settingsDraft.maxSkillsPerTurn]} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, maxSkillsPerTurn: Number(Array.isArray(value) ? value[0] : value) }))} /></div>
<div className="slider-setting"><span><strong>开局技能卡</strong><small>每人 {settingsDraft.startingSkillCards} 张</small></span><Slider min={0} max={6} step={1} value={[settingsDraft.startingSkillCards]} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, startingSkillCards: Number(Array.isArray(value) ? value[0] : value) }))} /></div>
<SettingRow title="杠牌抽技能" detail="每次杠牌额外获得一张技能卡"><Switch checked={settingsDraft.drawSkillOnKan} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, drawSkillOnKan: checked }))} /></SettingRow>
<SettingRow title="拔花 / 拔北抽技能" detail="补牌以外再获得一张技能卡"><Switch checked={settingsDraft.drawSkillOnFlower} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, drawSkillOnFlower: checked }))} /></SettingRow>
</section>
<section className="settings-section" hidden={settingsSection !== '高级'} aria-label="高级"><h3>高级</h3>
<SettingRow title="赤宝牌" detail="虚拟牌山加入赤五万、筒、索"><Switch checked={settingsDraft.akaDora} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, akaDora: checked }))} /></SettingRow>
<SettingRow title="食断" detail="副露状态下允许断幺九"><Switch checked={settingsDraft.openTanyao} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, openTanyao: checked }))} /></SettingRow>
<SettingRow title="切上满贯" detail="30符4番与60符3番按满贯"><Switch checked={settingsDraft.kiriageMangan} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, kiriageMangan: checked }))} /></SettingRow>
<SettingRow title="累计役满" detail="13番以上按役满而非三倍满"><Switch checked={settingsDraft.kazoeYakuman} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, kazoeYakuman: checked }))} /></SettingRow>
<SettingRow title="三麻自摸损" detail="缺席北家的付款份额不补齐"><Switch checked={settingsDraft.sanmaTsumoLoss} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, sanmaTsumoLoss: checked }))} /></SettingRow>
<SettingRow title="每巡计时" detail="固定时间每巡恢复；额外时间用完后本局不再恢复"><Switch checked={settingsDraft.turnTimerEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, turnTimerEnabled: checked }))} /></SettingRow>
<div className="field-grid two timer-settings-grid"><Label>默认固定时间（秒）<Input type="number" inputMode="numeric" min={0} max={3600} value={settingsDraft.turnFixedSeconds} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, turnFixedSeconds: Math.max(0, Math.min(3600, Number(event.target.value) || 0)) }))} /></Label><Label>默认额外时间（秒）<Input type="number" inputMode="numeric" min={0} max={86400} value={settingsDraft.turnExtraSeconds} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, turnExtraSeconds: Math.max(0, Math.min(86400, Number(event.target.value) || 0)) }))} /></Label></div>
<SettingRow title="对局音乐" detail="无双歌曲与立直音乐仅由牌桌主机播放"><Switch checked={settingsDraft.riichiMusicEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, riichiMusicEnabled: checked }))} /></SettingRow>
<SettingRow title="立直曲目" detail="随机模式：每次开始立直音乐时随机选一首，本次循环播放"><Select value={settingsDraft.riichiMusicTrack} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, riichiMusicTrack: value ?? 'random' }))}><SelectTrigger aria-label="立直曲目"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="random">随机播放</SelectItem>{RIICHI_MUSIC.map((track) => <SelectItem key={track.id} value={track.id}>{track.label}</SelectItem>)}</SelectContent></Select></SettingRow>
</section>
              {settingsSection === '核对开局' && <SettingsReview settings={settingsDraft} players={playerDrafts} baseline={settingsReviewBaseline} />}
            </div></div><DialogFooter className="rules-footer"><output>{settingsSection === '核对开局' ? '确认后重置点数、本场和供托，开始新对局。' : '当前仅修改草稿；下一步核对后才会开局。'}</output><Button variant="outline" onClick={closeSettings}>取消</Button>{settingsSection === '核对开局' ? <Button className="gold-button" onClick={startFreshMatch}><ListRestart /> 应用并开始新对局</Button> : <Button className="gold-button" onClick={() => setSettingsSection('核对开局')}>核对并继续</Button>}</DialogFooter>
          </DialogContent>
        </Dialog>
        {characterSeat !== null && <CharacterPicker value={playerDrafts[characterSeat]?.character} onClose={() => setCharacterSeat(null)} onSelect={(choice: CharacterChoice) => {
          setPlayerDrafts(drafts => drafts.map((draft, index) => index === characterSeat ? { ...draft, character: choice } : draft));
        }} />}

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="history-dialog match-history-dialog"><DialogHeader><DialogTitle>对局记录</DialogTitle><DialogDescription>查看操作与点数变化；撤销仍只恢复最近一次操作。</DialogDescription></DialogHeader><MatchHistory game={game} /><DialogFooter><Button variant="outline" onClick={undo}><RotateCcw /> 撤销上一项</Button><Button onClick={() => setHistoryOpen(false)}>返回牌桌</Button></DialogFooter></DialogContent>
        </Dialog>

        {dataOpen && <DataManagementDialog open close={() => setDataOpen(false)} game={game} cards={cards}
          normalizeMatch={value => normalizeGameState(value, cards)} applyMatch={applyImportedMatch} applyCards={applyImportedCards} />}

        <AlertDialog open={discardDraft !== null} onOpenChange={open => { if (!open) setDiscardDraft(null); }}>
          <AlertDialogContent className="draft-discard-dialog"><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>{discardDraft === 'settings' ? '规则、玩家和角色的调整尚未应用。放弃后当前对局保持不变。' : '技能卡的修改尚未保存，放弃后保留原来的资料。'}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={() => { if (discardDraft === 'settings') { setSettingsOpen(false); setCharacterSeat(null); } else setEditorCard(null); setDiscardDraft(null); }}>放弃修改</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {nfcCodesOpen && <NfcCodeLibrary open onOpenChange={setNfcCodesOpen} cards={cards} />}

        <Dialog open={Boolean(detailCard)} onOpenChange={(open) => !open && setDetailCard(null)}>
          <DialogContent className="card-detail-dialog library-detail-dialog" showCloseButton><DialogHeader><DialogTitle>{detailCard?.name}</DialogTitle><DialogDescription>{detailCard?.rarity} · {detailCard?.type.name}</DialogDescription></DialogHeader>{detailCard && <SkillDetailPanel card={detailCard} change={artwork => setDetailCard(card => card ? { ...card, artwork } : card)} />}<DialogFooter><Button variant="outline" onClick={() => { if (detailCard) beginEditingCard({ ...detailCard }); setDetailCard(null); }}><Edit3 /> 编辑资料</Button>{currentPlayer && game.settings.wushuang && <Button className="gold-button" onClick={() => openSkillRecorder(currentPlayer.id, detailCard?.id)}><Sparkles /> 记录发动</Button>}</DialogFooter></DialogContent>
        </Dialog>

        <Dialog open={Boolean(editorCard)} onOpenChange={(open) => { if (!open) closeEditor(); }}>
          <DialogContent className="editor-dialog library-editor-dialog"><DialogHeader><DialogTitle>技能卡编辑器</DialogTitle><DialogDescription>分区编辑，确认保存后更新本机技能库。</DialogDescription></DialogHeader>{editorCard && <SkillEditorPanel card={editorCard} change={card => { cardImageRequest.current++; setEditorCard(card); setEditorError(''); }} upload={handleCardImage} />}{(editorError || skillEditorIssue(editorCard)) && <p className="library-editor-error" role="alert">{editorError || skillEditorIssue(editorCard)}</p>}<DialogFooter>{editorCard && cards.some((card) => card.id === editorCard.id) && <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> 删除</Button>}<Button variant="outline" onClick={closeEditor}>取消</Button><Button className="gold-button" disabled={Boolean(skillEditorIssue(editorCard))} onClick={saveCard}><Save /> 保存技能卡</Button></DialogFooter></DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这张技能卡？</AlertDialogTitle><AlertDialogDescription>将删除「{editorCard?.name}」，并从技能库、玩家手牌、牌库和弃牌堆中移除。建议先导出技能库备份；删除后可通过导入备份恢复资料。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (!editorCard) return; const id = editorCard.id; setCards((current) => current.filter((card) => card.id !== id)); commit((current) => ({ ...current, players: current.players.map((player) => ({ ...player, skillHand: player.skillHand.filter((cardId) => cardId !== id) })), skillDeck: current.skillDeck.filter((cardId) => cardId !== id), skillDiscard: current.skillDiscard.filter((cardId) => cardId !== id) })); setEditorCard(null); setDeleteOpen(false); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </main>
    </TooltipProvider>
  );
}
