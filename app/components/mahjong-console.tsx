'use client';

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
  EyeOff,
  Flag,
  History,
  Import,
  Library,
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
  Target,
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
import { analyzeHand, parseMelds } from '@/lib/hand-analysis';
import { HandCalculator } from './hand-calculator';
import { FloatingEmote, TurnTimerDisplay, useTurnCountdown } from './game-overlays';
import { useLanHost } from '@/app/hooks/use-lan-host';
import { RIICHI_MUSIC, useCountdownSound, useRealtimeSound, useRiichiMusic } from '@/app/hooks/use-game-audio';
import { recordRiichiTransitions, recordSkillTransitions, recordWin } from '@/lib/presentation';
import { PresentationOverlay, usePresentationSequence, RollingScore, WinParticles, type PresentationSequence } from './table-presentation';
import { FitLabel } from './fit-label';
import { CharacterAvatar, CharacterPicker } from './character-picker';
import { characterChoice, defaultSeatCharacter, type CharacterChoice } from '@/lib/characters';
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

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeGameState(state: GameState): GameState {
  return {
    ...state,
    presentations: [],
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
  };
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

function PlayerPlate({
  player,
  current,
  position,
  effects,
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
  effects: Array<{ id: string; label: string; hidden?: boolean }>;
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
        aria-label={`${player.wind}家 ${player.name} ${player.score}点，打开玩家操作`}
        type="button"
        onClick={onSelect}
      >
        <span className="player-card-head">
          <span><i className={`wind-seal ${player.wind === '东' ? 'is-east' : ''}`} title={player.wind === '东' ? '东家 · 庄家' : `${player.wind}家`}>{player.wind}</i><strong>{player.name}</strong></span>
        </span>
        <RollingScore className="player-score" value={player.score} playerId={player.id} sequence={presentation} />
        <WinParticles active={celebrating} />
        <span className="player-tags">
          {player.riichi && <b>立直</b>}
          {participation === 'won' && <b>已和牌</b>}
          {participation === 'eliminated' && <b>已退出</b>}
          {player.eliminationReason && participation === 'eliminated' && <b>{player.eliminationReason}</b>}
        </span>
        <span className="effect-chips">
          {effects.slice(0, 1).map((effect) => (
            <span className={`effect-chip ${effect.hidden ? 'hidden' : ''}`} key={effect.id}>
              {effect.hidden ? <EyeOff /> : <Sparkles />}{effect.label}
            </span>
          ))}
          {effects.length > 1 && <span className="effect-chip">效果 {effects.length}</span>}
        </span>
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
  const [editorCard, setEditorCard] = useState<SkillCard | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playerActionOpen, setPlayerActionOpen] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const lastTurnTap = useRef(0);
  const [nagashiIds,setNagashiIds]=useState<string[]>([]);
  const [settingsSection,setSettingsSection]=useState('基础规则');
  const [drawOpen, setDrawOpen] = useState(false);
  const [tenpaiIds, setTenpaiIds] = useState<string[]>([]);
  const [drawPool, setDrawPool] = useState(3000);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [endMatchOpen, setEndMatchOpen] = useState(false);
  const [matchResultOpen, setMatchResultOpen] = useState(false);
  const [finalSnapshot, setFinalSnapshot] = useState<MatchResultSnapshot | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [skillRecordOpen, setSkillRecordOpen] = useState(false);
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
    bonusHan: 0,
    extraPoints: 0,
    selectedYaku: [] as string[],
    yakuOverrides: {} as Record<string, number>,
  });
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
        const parsed = JSON.parse(saved) as { game?: GameState; cards?: SkillCard[] };
        if (parsed.cards?.length) setCards(parsed.cards);
        if (parsed.game?.players?.length) {
          const restored = normalizeGameState(parsed.game);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, cards }));
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
    setGame((current) => {
      undoStack.current = [...undoStack.current.slice(-29), current];
      const next = recordSkillTransitions(current, recordRiichiTransitions(current, updater(current)), cards);
      gameRef.current = next;
      return next;
    });
  }, [cards]);

  const commitRemote = useCallback((updater: (current: GameState) => GameState) => {
    const current = gameRef.current;
    undoStack.current = [...undoStack.current.slice(-29), current];
    const next = recordSkillTransitions(current, recordRiichiTransitions(current, updater(current)), cards);
    if (next.presentations?.some(event => event.kind === 'skill' && !current.presentations?.some(previous => previous.id === event.id))) {
      setView('table');
      setEffectsOpen(false);
    }
    gameRef.current = next;
    setGame(next);
    return next;
  }, [cards]);

  const lanHost = useLanHost({ game, cards, gameRef, commitRemote });
  const presentation = usePresentationSequence(game.presentations);

  const currentPlayer = game.players[game.turnIndex] ?? game.players[0];
  const currentParticipation = currentPlayer?.participation ?? (currentPlayer?.active ? 'playing' : 'won');
  const actionPlayer = game.players.find(player => player.id === actionPlayerId) ?? currentPlayer;
  const actionParticipation = actionPlayer?.participation ?? (actionPlayer?.active ? 'playing' : 'won');
  const turnClock = useTurnCountdown(game);
  const timerStatus = game.timerPaused ? '已暂停' : game.turnState !== 'thinking' || game.handEnded ? '等待摸牌' : undefined;
  useRealtimeSound(lanHost.realtimeEvent);
  useCountdownSound(turnClock.enabled, turnClock.totalRemaining);
  useRiichiMusic(Boolean(game.settings.riichiMusicEnabled && !game.handEnded && game.players.some((player) => player.riichi)), game.settings.riichiMusicTrack);
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
    () => nagashiIds.length ? calculateNagashiDraw(game,nagashiIds) : calculateExhaustiveDraw(game.players, tenpaiIds, drawPool),
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
  const yakuHan = selectedYaku.reduce(
    (sum, yaku) => sum + (scoreForm.yakuOverrides[yaku.id] ?? (scoreForm.closed ? yaku.closedHan : yaku.openHan)),
    0,
  );
  const yakuman = selectedYaku.reduce((sum, yaku) => sum + (yaku.yakuman ?? 0), 0);
  const totalHan = yakuHan + scoreForm.dora + scoreForm.uraDora + scoreForm.akaDora + scoreForm.flowerDora + scoreForm.bonusHan;
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
      const matchesType = skillType === '全部' || card.type.code === skillType;
      const haystack = `${card.name} ${card.summary} ${card.effectDescription}`.toLocaleLowerCase('zh-CN');
      return matchesType && (!query || haystack.includes(query));
    });
  }, [cards, skillSearch, skillType]);

  const skillRecordCards = useMemo(() => {
    const query = skillRecordSearch.trim().toLocaleLowerCase('zh-CN');
    return cards.filter((card) => !query || `${card.name} ${card.summary} ${card.effectDescription}`.toLocaleLowerCase('zh-CN').includes(query));
  }, [cards, skillRecordSearch]);

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
    const other = publicPlayerEffects.filter((effect) => {
      const targets = effectTargets(effect);
      return effectSourceId(effect) !== playerId && !targets.includes(playerId) && effect.scope !== 'team';
    });
    return [
      { label: '对我生效', effects: incoming },
      { label: '我对自己使用', effects: self },
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
    setSkillForm({
      actorId: actor.id,
      cardId: card.id,
      targetIds: defaultSkillTargets(card, actor.id),
      duration: 'hand',
      hidden: card.type.code === '陷',
      note: card.effectDescription,
    });
    setSkillRecordSearch('');
    setPlayerActionOpen(false);
    setDetailCard(null);
    setSkillRecordOpen(true);
  }, [cards, defaultSkillTargets]);

  const chooseSkillCard = useCallback((cardId: number) => {
    const card = cards.find((candidate) => candidate.id === cardId);
    setSkillForm((form) => ({
      ...form,
      cardId,
      targetIds: defaultSkillTargets(card, form.actorId),
      hidden: card?.type.code === '陷',
      note: card?.effectDescription ?? '',
    }));
  }, [cards, defaultSkillTargets]);

  const recordSkillEffect = useCallback(() => {
    const card = cards.find((candidate) => candidate.id === skillForm.cardId);
    const actor = gameRef.current.players.find((player) => player.id === skillForm.actorId);
    if (!card || !actor) {
      setStatus('请选择使用者和技能卡');
      return;
    }
    const cardType = card.type.code;
    const isHidden = cardType === '陷' && skillForm.hidden;
    const targets = cardType === '单'
      ? [actor.id]
      : cardType === '团'
        ? (skillForm.targetIds.length ? skillForm.targetIds : defaultSkillTargets(card, actor.id))
        : cardType === '环'
          ? []
          : skillForm.targetIds;
    if ((cardType === '攻' || (cardType === '陷' && !isHidden)) && targets.length === 0) {
      setStatus('这张卡需要至少选择一个目标');
      return;
    }
    commit((current) => {
      const environmentEffects = cardType === '环'
        ? current.effects.map((effect) => effect.scope === 'table' && effectIsLive(effect) ? { ...effect, status: 'resolved' as const, state: 'resolved' as const } : effect)
        : current.effects;
      const effect: ActiveSkillEffect = {
        id: `effect-${Date.now()}-${card.id}`,
        cardId: card.id,
        cardName: card.name,
        effectText: skillForm.note || card.effectDescription,
        sourcePlayerId: actor.id,
        targetPlayerIds: targets,
        affectedPlayerIds: targets,
        scope: cardType === '单' ? 'self' : cardType === '团' ? 'team' : cardType === '环' ? 'table' : 'player',
        visibility: isHidden ? 'face-down' : 'public',
        state: isHidden ? 'armed' : 'active',
        duration: skillForm.duration,
        note: skillForm.note,
        createdAt: new Date().toISOString(),
        ownerId: actor.id,
        targetId: targets[0],
        faceDown: isHidden,
        status: 'active',
      };
      return addEvent(
        {
          ...current,
          environmentSkillId: cardType === '环' ? card.id : current.environmentSkillId,
          effects: [...environmentEffects, effect],
        },
        isHidden ? '暗置陷阱' : '记录技能发动',
        isHidden ? `${actor.name}暗置了一张陷阱卡` : `${actor.name}发动「${card.name}」${targets.length ? `，影响${targets.map((id) => current.players.find((player) => player.id === id)?.name).filter(Boolean).join('、')}` : '，作用于牌桌'}`,
      );
    });
    setSkillRecordOpen(false);
    setEffectsOpen(isHidden);
    if (!isHidden) setView('table');
  }, [cards, commit, defaultSkillTargets, setStatus, skillForm]);

  const openEffectManager = useCallback((effect: ActiveSkillEffect) => {
    setManageEffectId(effect.id);
    setRevealTargets(effectTargets(effect));
    setRevealNote(effect.note ?? effect.effectText ?? '');
  }, []);

  const revealEffect = useCallback(() => {
    if (!selectedManagedEffect) return;
    commit((current) => {
      const cardName = selectedManagedEffect.cardName ?? cards.find((card) => card.id === selectedManagedEffect.cardId)?.name ?? '陷阱卡';
      const owner = current.players.find((player) => player.id === effectSourceId(selectedManagedEffect));
      return addEvent(
        {
          ...current,
          effects: current.effects.map((effect) => effect.id === selectedManagedEffect.id ? {
            ...effect,
            visibility: 'public' as const,
            faceDown: false,
            state: 'triggered' as const,
            targetPlayerIds: revealTargets,
            affectedPlayerIds: revealTargets,
            targetId: revealTargets[0],
            note: revealNote,
            effectText: revealNote || effect.effectText,
          } : effect),
        },
        '陷阱发动',
        `${owner?.name ?? '玩家'}揭示「${cardName}」${revealTargets.length ? `，影响${revealTargets.map((id) => current.players.find((player) => player.id === id)?.name).filter(Boolean).join('、')}` : ''}`,
      );
    });
    setManageEffectId(null);
    setEffectsOpen(false);
    setView('table');
  }, [cards, commit, revealNote, revealTargets, selectedManagedEffect]);

  const resolveEffect = useCallback((effectId: string) => {
    commit((current) => {
      const effect = current.effects.find((candidate) => candidate.id === effectId);
      if (!effect) return current;
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
  }, [cards, commit]);

  const applySettlement = useCallback(() => {
    if (game.handEnded) {
      setStatus('本局已经结算，请先开始下一局');
      return;
    }
    if (!scorePreview) {
      setStatus(scoreError || '请完善和牌信息');
      return;
    }
    commit((current) => recordWin(current, applySettlementToState(current, scoreInput, scorePreview as SettlementResult), scoreInput, scorePreview as SettlementResult, selectedYaku.map(yaku => yaku.name), scoreTiles));
    setView('table');
  }, [commit, game.handEnded, scoreError, scoreInput, scorePreview, setStatus, selectedYaku, scoreTiles]);

  const applyExhaustiveDraw = useCallback(() => {
    commit((current) => {
      const deltas = nagashiIds.length ? calculateNagashiDraw(current,nagashiIds) : calculateExhaustiveDraw(current.players, tenpaiIds, drawPool);
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
        nagashiIds.length ? `流局满贯：${playing.filter(p=>nagashiIds.includes(p.id)).map(p=>p.name).join('、')}；替代未听罚符，供托保留` : tenpaiNames.length === 0 ? '流局：无人听牌' : tenpaiNames.length === playing.length ? '流局：全员听牌，无罚符转移' : `流局：${tenpaiNames.join('、')}听牌（振听亦按听牌）`,
        deltas,
      );
    });
    setDrawOpen(false);
    setTenpaiIds([]);
    setNagashiIds([]);
  }, [commit, drawPool, tenpaiIds, nagashiIds]);

  const beginNextHand = useCallback(() => {
    commit((current) => {
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
        handEnded: false,
        dealerRepeat: false,
        wallCount: resolveInitialWallCount(current.settings),
        environmentSkillId: current.effects.find((effect) => effectIsLive(effect) && effect.duration === 'match' && effect.scope === 'table')?.cardId ?? null,
        skillDiscard: [...current.skillDiscard, ...returnedCards],
        effects: current.effects.map((effect) => effect.duration === 'match' && effectIsLive(effect) ? effect : { ...effect, status: 'resolved' as const, state: 'resolved' as const }),
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
    setScoreForm((form) => ({
      ...form,
      closed: true,
      fu: 30,
      dora: 0,
      uraDora: 0,
      akaDora: 0,
      flowerDora: 0,
      bonusHan: 0,
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
      bonusHan: 0,
      extraPoints: 0,
      selectedYaku: [],
      yakuOverrides: {},
    }));
    setScoreTiles([]);
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
    setFinalSnapshot(snapshot);
    setGame(next);
    setEndMatchOpen(false);
    setMatchResultOpen(true);
    setScoreTiles([]);
    setScoreForm((form) => ({ ...form, winnerId: next.players[0]?.id ?? '', loserId: next.players[1]?.id ?? '', selectedYaku: [], yakuOverrides: {}, dora: 0, uraDora: 0, akaDora: 0, flowerDora: 0, bonusHan: 0, extraPoints: 0 }));
  }, [cards]);

  const openSettings = useCallback(() => {
    setSettingsDraft({ ...game.settings });
    setPlayerDrafts(
      Array.from({ length: 4 }, (_, index) => ({
        name: game.players[index]?.name ?? `玩家${['一', '二', '三', '四'][index]}`,
        team: game.players[index]?.team ?? (index % 2 === 0 ? '朱雀' : '玄武'),
        character: characterChoice(game.players[index]?.character),
      })),
    );
    setSettingsOpen(true);
  }, [game.players, game.settings]);

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
    if (!editorCard?.name.trim() || !editorCard.effectDescription.trim()) {
      setStatus('技能卡需要名称和效果说明');
      return;
    }
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
    setEditorCard({
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
  }, [cards]);

  const handleCardImage = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      setStatus('图片超过 1.5 MB，建议先压缩后再导入');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setEditorCard((card) => (card ? { ...card, artwork: reader.result as string } : card));
    };
    reader.readAsDataURL(file);
  }, [setStatus]);

  const importSkillLibrary = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as { cards?: SkillCard[] } | SkillCard[];
        const imported = Array.isArray(parsed) ? parsed : parsed.cards;
        if (!imported?.length) throw new Error('没有卡片');
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
      } catch {
        setStatus('技能库文件格式不正确');
      }
    });
    event.target.value = '';
  }, [commit, setStatus]);

  const importMatch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as unknown;
        const imported: GameState | undefined =
          typeof parsed === 'object' && parsed !== null && 'game' in parsed
            ? (parsed as { game?: GameState }).game
            : (parsed as GameState);
        if (!imported?.players?.length) throw new Error('没有对局');
        undoStack.current = [...undoStack.current.slice(-29), gameRef.current];
        const restored = normalizeGameState(imported);
        gameRef.current = restored;
        setGame({ ...restored, status: '已导入对局记录' });
        setDataOpen(false);
      } catch {
        setStatus('对局文件格式不正确');
      }
    });
    event.target.value = '';
  }, [setStatus]);

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

  const positions = ['seat-bottom', 'seat-right', 'seat-top', 'seat-left'];
  const isTurnActive = game.turnState === 'thinking' && !game.handEnded;

  return (
    <TooltipProvider>
      <main className={`app-shell view-${view}`}>
        <FloatingEmote events={lanHost.emoteEvents} tablet />
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
            <Button variant="ghost" size="icon-lg" aria-label="立直音乐设置" onClick={() => setMusicOpen(true)}><Music2 /></Button>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label={game.settings.riichiMusicEnabled ? '关闭立直音乐' : '开启立直音乐'} onClick={() => commit((current) => ({ ...current, settings: { ...current.settings, riichiMusicEnabled: !current.settings.riichiMusicEnabled }, status: current.settings.riichiMusicEnabled ? '立直音乐已关闭' : '立直音乐已开启' }))} />}>
                {game.settings.riichiMusicEnabled ? <Volume2 /> : <VolumeX />}
              </TooltipTrigger>
              <TooltipContent>{game.settings.riichiMusicEnabled ? '关闭立直音乐' : '开启立直音乐'}</TooltipContent>
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
                    effects={playerEffectSummaries[player.id] ?? []}
                    onSelect={() => focusPlayer(player.id, true)}
                    thinking={index === game.turnIndex && isTurnActive}
                    drawDisabled={game.handEnded || player.participation !== 'playing' || (!(index === game.turnIndex && game.turnState === 'thinking') && (Boolean(game.timerPaused) || game.wallCount <= 0))}
                    onDraw={() => actOnPlayerTurn(player.id, index === game.turnIndex && game.turnState === 'thinking' ? 'discard.confirm' : 'draw.confirm', game.turnStartedAt)}
                  />
                ))}

                <div className="table-wind-dial" aria-hidden="true">
                  {positions.map((position, index) => <span key={position} className={`wind-slot ${position} ${isTurnActive && index === game.turnIndex ? 'is-lit' : ''}`} />)}
                </div>

                <div className="table-control-island">
                  <div className="table-round-line">
                    <strong>{game.roundWind}{game.handNumber}局 · {game.honba}本场</strong>
                    <span>供托 {game.riichiSticks}</span>
                  </div>
                  <div className="wall-control">
                    <button className="wall-stepper" type="button" aria-label="牌山减一" onClick={() => adjustWall(-1)}><Minus /></button>
                    <label className={`wall-number ${game.wallCount === 0 ? 'is-empty' : ''}`}>

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
                  {tableEffects.length > 0 ? (
                    <button className="environment-banner" type="button" onClick={() => tableEffects.length === 1 ? openEffectManager(tableEffects[0]) : setEffectsOpen(true)}>
                      <Target /><FitLabel maxSize={18}>{`环境：${tableEffects.map((effect) => effect.cardName ?? cards.find((card) => card.id === effect.cardId)?.name ?? '牌桌效果').join('、')}`}</FitLabel>
                    </button>
                  ) : <span className="no-environment">当前无环境效果</span>}
                  <button className="current-player-indicator" type="button" onClick={() => focusPlayer(currentPlayer.id, true)}><FitLabel>{`${currentPlayer.name} · ${currentParticipation === 'playing' ? '当前操作' : currentParticipation === 'won' ? '已和牌' : '已退出'}`}</FitLabel></button>
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
                {lanHost.supported && <button type="button" onClick={() => setRoomOpen(true)}><Radio /><span>房间</span>{lanHost.hostInfo && <b>{lanHost.peers.filter((peer) => peer.playerId).length}</b>}</button>}
                <button type="button" onClick={() => openSkillRecorder(currentPlayer.id)} disabled={!game.settings.wushuang}><Sparkles /><span>技能</span></button>
                <button type="button" onClick={() => { setTenpaiIds([]); setDrawOpen(true); }}><ListRestart /><span>流局</span></button>
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
                <p>选择和牌者、役种与番符，右侧会实时显示每家的收支。</p>
              </div>

              <div className="score-form-grid">
                <div className="form-block">
                  <h3>和牌信息</h3>
                  <div className="field-grid two">
                    <Label>和牌者<Select value={scoreForm.winnerId} onValueChange={(value) => setScoreForm((form) => ({ ...form, winnerId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.filter((player) => !game.settings.bloodBattle || player.active).map((player) => <SelectItem key={player.id} value={player.id}>{player.wind}家 · {player.name}</SelectItem>)}</SelectContent></Select></Label>
                    <Label>和牌方式<Select value={scoreForm.winType} onValueChange={(value) => setScoreForm((form) => ({ ...form, winType: String(value) as 'ron' | 'tsumo' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ron">荣和</SelectItem><SelectItem value="tsumo">自摸</SelectItem></SelectContent></Select></Label>
                    {scoreForm.winType === 'ron' && <Label>放铳者<Select value={scoreForm.loserId} onValueChange={(value) => setScoreForm((form) => ({ ...form, loserId: String(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.filter((player) => player.active && player.id !== scoreForm.winnerId).map((player) => <SelectItem key={player.id} value={player.id}>{player.wind}家 · {player.name}</SelectItem>)}</SelectContent></Select></Label>}
                    <Label>副露状态<Select value={scoreForm.closed ? 'closed' : 'open'} onValueChange={(value) => setScoreForm((form) => ({ ...form, closed: value === 'closed', selectedYaku: form.selectedYaku.filter((id) => value === 'closed' || (YAKU.find((yaku) => yaku.id === id)?.openHan ?? 0) > 0) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closed">门清</SelectItem><SelectItem value="open">副露</SelectItem></SelectContent></Select></Label>
                    <Label>符数<Select value={String(scoreForm.fu)} onValueChange={(value) => setScoreForm((form) => ({ ...form, fu: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((fu) => <SelectItem key={fu} value={String(fu)}>{fu} 符</SelectItem>)}</SelectContent></Select></Label>
                  </div>
                </div>

                <div className="form-block">
                  <div className="block-heading"><h3>牌姿记录</h3><span>{scoreTiles.length} 张 · 杠后可超过 14</span></div>
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
                  <HandCalculator key={scoreForm.winnerId} tiles={scoreTiles} closed={scoreForm.closed} winType={scoreForm.winType} seatWind={game.players.find(p=>p.id===scoreForm.winnerId)?.wind ?? '东'} roundWind={game.roundWind} selected={scoreForm.selectedYaku} bonusHan={scoreForm.dora+scoreForm.uraDora+scoreForm.akaDora+scoreForm.flowerDora+scoreForm.bonusHan} overrides={scoreForm.yakuOverrides} openTanyao={game.settings.openTanyao} kiriage={game.settings.kiriageMangan} kazoe={game.settings.kazoeYakuman} onApply={(ids,fu,closed,analysis)=>{if(analysis)setScoreAnalysis(previous=>JSON.stringify(previous)===JSON.stringify(analysis)?previous:analysis);setScoreForm(form=>JSON.stringify(form.selectedYaku)===JSON.stringify(ids)&&(fu===undefined||fu===form.fu)&&(closed===undefined||closed===form.closed)?form:{...form,selectedYaku:ids,fu:fu??form.fu,closed:closed??form.closed});}}/>
                </div>

                <div className="form-block yaku-block">
                  <div className="block-heading"><h3>役种</h3><strong>{yakuman ? `${yakuman} 倍役满` : `${totalHan} 番`}</strong></div>
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
                  <h3>宝牌与技能修正</h3>
                  <div className="field-grid five">
                    {[['dora', '宝牌'], ['uraDora', '里宝牌'], ['akaDora', '赤宝牌'], ['flowerDora', '花 / 北'], ['bonusHan', '技能加番']].map(([key, label]) => (
                      <Label key={key}>{label}<Select value={String(scoreForm[key as keyof typeof scoreForm] as number)} onValueChange={(value) => setScoreForm((form) => ({ ...form, [key]: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{HAN_NUMBER_OPTIONS.map((count) => <SelectItem key={count} value={String(count)}>{count}</SelectItem>)}</SelectContent></Select></Label>
                    ))}
                  </div>
                  <Label className="extra-points-field">技能额外得点<Input type="number" inputMode="numeric" step={100} min={0} max={1000000} placeholder="0" value={scoreForm.extraPoints || ''} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setScoreForm((form) => ({ ...form, extraPoints: Math.max(0, Math.min(1000000, Number(event.target.value) || 0)) }))} /><small>例如“恭喜发财”固定增加的 1000 点；荣和由放铳者支付，自摸由其余玩家合计支付。</small></Label>
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
                      const gain = player.id === scoreForm.winnerId ? scorePreview.winnerGain : -payment;
                      return <div key={player.id}><span>{player.wind} · {player.name}</span><strong className={gain > 0 ? 'positive' : gain < 0 ? 'negative' : ''}>{gain > 0 ? '+' : ''}{gain.toLocaleString('zh-CN')}</strong></div>;
                    })}
                  </div>
                  <p>{scorePreview.summary}</p>
                  <Button className="gold-button result-apply" size="lg" onClick={applySettlement} disabled={game.handEnded}><Save /> {game.handEnded ? '本局已结算' : '应用结算'}</Button>
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
                <div className="library-actions"><Button variant="outline" onClick={() => downloadJson('麻将无双技能卡资料库.json', { schemaVersion: 1, cards })}><Download /> 导出</Button><Button className="gold-button" onClick={newCard}><Plus /> 新增技能卡</Button></div>
              </div>

              <div className="filter-bar">
                <div className="search-field"><Search /><Input aria-label="搜索技能卡名或效果" placeholder="搜索卡名或效果" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} /></div>
                <div className="type-filters">
                  {['全部', '单', '团', '攻', '陷', '环'].map((type) => <button type="button" key={type} className={skillType === type ? 'active' : ''} onClick={() => setSkillType(type)}>{type}</button>)}
                </div>
                <label className="import-label"><Upload /> 导入 JSON<input type="file" accept="application/json,.json" onChange={importSkillLibrary} /></label>
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
                      <button className="card-edit" type="button" aria-label={`编辑${card.name}`} onClick={() => setEditorCard({ ...card })}><Edit3 /></button>
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
          <DialogContent className="host-room-dialog">
            <DialogHeader>
              <DialogTitle>手机遥控房间</DialogTitle>
              <DialogDescription>平板保存唯一对局状态。让所有手机与平板连接同一个 Wi-Fi，再用同一 APK 选择“手机遥控”。</DialogDescription>
            </DialogHeader>
            {!lanHost.hostInfo ? (
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
                  <div><span>平板地址</span><strong>{lanHost.hostInfo.host || '等待 Wi-Fi 地址'}:{lanHost.hostInfo.port}</strong></div>
                </section>
                <p className="host-room-tip"><Wifi /> 手机选择自动发现的“{lanHost.hostInfo.serviceName}”，输入上方房间码，再选择自己的席位。</p>
                <section className="host-seat-list">
                  <h3><Users /> 已连接 {lanHost.peers.filter((peer) => peer.playerId).length} / {game.settings.playerCount}</h3>
                  {game.players.map((player) => {
                    const peer = lanHost.peers.find((entry) => entry.playerId === player.id);
                    return (
                      <article className={peer ? 'is-online' : ''} key={player.id}>
                        <span className="wind-seal">{player.wind}</span>
                        <div><strong>{player.name}</strong><small>{peer ? peer.deviceName : '等待手机加入'}</small></div>
                        <span>{peer ? <><Wifi /> 在线</> : <><WifiOff /> 未连接</>}</span>
                      </article>
                    );
                  })}
                </section>
                {lanHost.error && <p className="host-room-error">{lanHost.error}</p>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoomOpen(false)}>返回牌桌</Button>
              {lanHost.hostInfo && <Button variant="destructive" onClick={() => void lanHost.stopRoom()}>关闭房间</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={effectsOpen} onOpenChange={setEffectsOpen}>
          <DialogContent className="effects-dialog">
            <DialogHeader><DialogTitle>场上效果 · {actionPlayer?.name}视角</DialogTitle><DialogDescription>这里集中显示公开技能、团队效果、牌桌环境和暗置陷阱。点击任一公开效果可查看完整说明。</DialogDescription></DialogHeader>
            {effectGroups.length === 0 ? <p className="effects-empty">当前没有已记录的技能效果。</p> : (
              <div className="effects-dialog-grid">
                {effectGroups.map((group) => (
                  <section className="ledger-group" key={group.label}>
                    <h3>{group.label}</h3>
                    {group.effects.map((effect) => {
                      const hidden = effectIsHidden(effect);
                      const source = game.players.find((player) => player.id === effectSourceId(effect));
                      const targets = effectTargets(effect).map((id) => game.players.find((player) => player.id === id)?.name).filter(Boolean);
                      const name = effect.cardName ?? cards.find((card) => card.id === effect.cardId)?.name ?? '技能效果';
                      return (
                        <article className="effect-row" key={effect.id}>
                          <strong>{hidden ? `${source?.name ?? '玩家'}的暗置陷阱` : name}</strong>
                          {!hidden && <><span>{source?.name ?? '玩家'} → {effect.scope === 'table' ? '牌桌' : targets.join('、') || '未指定目标'}</span><p>{effect.effectText ?? cards.find((card) => card.id === effect.cardId)?.effectDescription ?? '按卡面说明执行'}{effect.note && effect.note !== effect.effectText ? ` · ${effect.note}` : ''}</p><small>{DURATION_LABELS[effect.duration ?? 'hand']}</small></>}
                          {hidden && <p>卡名与效果保持隐藏；实际触发时再揭示并选择目标。</p>}
                          <div className="effect-row-actions">
                            <Button variant="outline" onClick={() => { setEffectsOpen(false); openEffectManager(effect); }}>{hidden ? <><Eye /> 揭示／发动</> : <><Eye /> 查看／管理</>}</Button>
                            {!hidden && effectTargets(effect).length > 0 && <Button variant="outline" onClick={() => { const targetId = effectTargets(effect)[0]; setEffectsOpen(false); focusPlayer(targetId); setQuickPointForm((form) => ({ ...form, reason: name })); setPlayerActionOpen(true); }}>快速罚点</Button>}
                          </div>
                        </article>
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
            <AlertDialogHeader><AlertDialogTitle>结束整场对局？</AlertDialogTitle><AlertDialogDescription>将按当前点数生成个人名次与阵营结算画面。确认后，新对局会在结算画面背后自动重置；本次操作仍可从新对局中撤销恢复。{game.riichiSticks > 0 ? `当前还有 ${game.riichiSticks} 根供托，结算画面会标记为未分配。` : ''}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>继续对局</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={finishMatch}><Flag /> 结束并查看结算</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={matchResultOpen} onOpenChange={setMatchResultOpen}>
          <DialogContent className="match-result-dialog">
            <DialogHeader><DialogTitle>对局最终结算</DialogTitle><DialogDescription>{finalSnapshot?.roundLabel} · {finalSnapshot ? new Date(finalSnapshot.endedAt).toLocaleString('zh-CN') : ''}</DialogDescription></DialogHeader>
            {finalSnapshot && <div className="match-result-body">
              <section className="champion-panel">
                <span>第一名</span><strong>{finalSnapshot.players[0]?.name}</strong><output>{finalSnapshot.players[0]?.score.toLocaleString('zh-CN')}</output><small>{finalSnapshot.players[0]?.team}</small>
              </section>
              <section className="ranking-panel">
                <h3>个人排名</h3>
                <div className="final-ranking-list">{finalSnapshot.players.map((player, index) => {
                  const returnDelta = player.score - finalSnapshot.targetPoints;
                  return <article className={`rank-${index + 1}`} key={player.id}><b>{index + 1}</b><span className="wind-seal">{player.wind}</span><div><strong>{player.name}</strong><small>{player.team}</small></div><output>{player.score.toLocaleString('zh-CN')}<small>{returnDelta >= 0 ? '+' : ''}{returnDelta.toLocaleString('zh-CN')} 对返还点</small></output></article>;
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

        <Dialog open={playerActionOpen} onOpenChange={setPlayerActionOpen}>
          <DialogContent className="player-action-dialog">
            <DialogHeader>
              <DialogTitle>{actionPlayer?.wind}家 · {actionPlayer?.name}</DialogTitle>
              <DialogDescription>点数 {actionPlayer?.score.toLocaleString('zh-CN')}。这里仅记录会影响现实牌桌状态的关键操作。</DialogDescription>
            </DialogHeader>
            {actionPlayer && <>
              <div className="player-action-grid">
                <Button className="gold-button" onClick={() => { setPlayerActionOpen(false); openScoreFor(actionPlayer.id); }} disabled={game.handEnded || actionParticipation !== 'playing'}><Trophy /> 和了</Button>
                <Button variant="outline" onClick={() => declareRiichiFor(actionPlayer.id)} disabled={game.handEnded || actionParticipation !== 'playing' || actionPlayer.riichi}><CircleDollarSign /> {actionPlayer.riichi ? '已立直' : '立直 −1,000'}</Button>
                {game.settings.wushuang && <Button variant="outline" onClick={() => openSkillRecorder(actionPlayer.id)}><Sparkles /> 记录技能</Button>}
                <Button variant="outline" onClick={() => { setEffectsOpen(true); setPlayerActionOpen(false); }}><ShieldCheck /> 查看效果（{playerEffectSummaries[actionPlayer.id]?.length ?? 0}）</Button>
                {actionParticipation === 'eliminated' || actionParticipation === 'won' ? (
                  <Button variant="outline" onClick={() => setPlayerParticipation(actionPlayer.id, 'playing')}><UserRoundCheck /> 恢复参与</Button>
                ) : (
                  <Button variant="destructive" onClick={() => setPlayerParticipation(actionPlayer.id, 'eliminated', 'hand')}><UserMinus /> 退出本局</Button>
                )}
                {actionParticipation === 'playing' && <Button variant="destructive" onClick={() => setPlayerParticipation(actionPlayer.id, 'eliminated', 'match')}><UserMinus /> 移出整场</Button>}
              </div>

              <div className="quick-points-panel">
                <div className="block-heading"><h3>快速加／扣点</h3><span>所有操作都可撤销</span></div>
                <div className="field-grid two">
                  <Label>点数来自／去向
                    <Select value={quickPointForm.counterpartyId} onValueChange={(value) => setQuickPointForm((form) => ({ ...form, counterpartyId: String(value) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="outside">场外增减（罚点／奖励）</SelectItem>{game.players.filter((player) => player.id !== actionPlayer.id).map((player) => <SelectItem key={player.id} value={player.id}>与 {player.name} 转移</SelectItem>)}</SelectContent>
                    </Select>
                  </Label>
                  <Label>原因<Input value={quickPointForm.reason} onChange={(event) => setQuickPointForm((form) => ({ ...form, reason: event.target.value }))} /></Label>
                </div>
                <div className="point-preset-grid">
                  {[1000, 2000, 3000, 4000].flatMap((amount) => [
                    <Button variant="destructive" key={`minus-${amount}`} onClick={() => quickAdjustPlayer(-amount)}>−{amount.toLocaleString('zh-CN')}</Button>,
                    <Button variant="outline" key={`plus-${amount}`} onClick={() => quickAdjustPlayer(amount)}>+{amount.toLocaleString('zh-CN')}</Button>,
                  ])}
                </div>
                <div className="field-grid two">
                  <Label>自定义点数<Input type="number" min={1} step={100} value={quickPointForm.amount} onChange={(event) => setQuickPointForm((form) => ({ ...form, amount: Math.max(0, Number(event.target.value)) }))} /></Label>
                  <div className="custom-point-actions"><Button variant="destructive" onClick={() => quickAdjustPlayer(-quickPointForm.amount)}>自定义扣点</Button><Button variant="outline" onClick={() => quickAdjustPlayer(quickPointForm.amount)}>自定义加点</Button></div>
                </div>
              </div>
              {game.settings.turnTimerEnabled && <div className="player-timer-panel">
                <div className="block-heading"><h3>想牌时间</h3><span>调整后从现在重新计时</span></div>
                <div className="field-grid two">
                  <Label>每巡固定时间<Input type="number" inputMode="numeric" min={0} max={3600} value={actionPlayer.turnFixedSeconds} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updatePlayerTimer(actionPlayer.id, 'turnFixedSeconds', Number(event.target.value))} /></Label>
                  <Label>本局剩余额外时间<Input type="number" inputMode="numeric" min={0} max={86400} value={actionPlayer.turnExtraSeconds} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updatePlayerTimer(actionPlayer.id, 'turnExtraSeconds', Number(event.target.value))} /></Label>
                </div>
                <div className="timer-quick-actions"><Button variant="outline" onClick={() => updatePlayerTimer(actionPlayer.id, 'turnFixedSeconds', 3)}>技能：固定 3 秒</Button><Button variant="outline" onClick={() => updatePlayerTimer(actionPlayer.id, 'turnExtraSeconds', game.settings.turnExtraSeconds)}>恢复额外时间</Button></div>
              </div>}
            </>}
          </DialogContent>
        </Dialog>

        <Dialog open={drawOpen} onOpenChange={setDrawOpen}>
          <DialogContent className="draw-dialog">
            <DialogHeader><DialogTitle>流局结算</DialogTitle><DialogDescription>勾选听牌玩家。振听仍算听牌；牌山归零不会自动流局，只有确认后才结算。</DialogDescription></DialogHeader>
            <div className="tenpai-grid">
              {game.players.filter((player) => player.active && player.participation === 'playing').map((player) => (
                <Label key={player.id}>
                  <Checkbox checked={tenpaiIds.includes(player.id)} onCheckedChange={(checked) => setTenpaiIds((ids) => checked ? [...ids, player.id] : ids.filter((id) => id !== player.id))} />
                  <span><strong>{player.wind} · {player.name}</strong><small> 听牌（含振听）</small></span>
                </Label>
              ))}
            </div>
            <div className="nagashi-picker"><h3>流局满贯</h3><p>牌河全部为幺九牌且未被他家鸣牌时，可勾选成立玩家。按满贯自摸支付，替代未听罚符；供托保留、本场加一，连庄仍按听牌勾选。</p><div className="tenpai-grid">{game.players.filter(p=>p.active&&p.participation==='playing').map(p=><Label key={p.id}><Checkbox checked={nagashiIds.includes(p.id)} onCheckedChange={checked=>setNagashiIds(ids=>checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.wind} · {p.name}</Label>)}</div></div>
            <Label>未听罚符总额<Input disabled={nagashiIds.length>0} type="number" min={0} step={100} value={drawPool} onChange={(event) => setDrawPool(Math.max(0, Number(event.target.value)))} /></Label>
            <div className="draw-preview payment-list">
              {game.players.filter((player) => player.active && player.participation === 'playing').map((player) => {
                const delta = drawPreview[player.id] ?? 0;
                return <div key={player.id}><span>{player.name} · {nagashiIds.includes(player.id) ? '流局满贯' : tenpaiIds.includes(player.id) ? '听牌' : '未听'}</span><strong className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}>{delta > 0 ? '+' : ''}{delta.toLocaleString('zh-CN')}</strong></div>;
              })}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setDrawOpen(false)}>取消</Button><Button className="gold-button" onClick={applyExhaustiveDraw}><ListRestart /> 确认流局</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={skillRecordOpen} onOpenChange={setSkillRecordOpen}>
          <DialogContent className="skill-record-dialog">
            <DialogHeader><DialogTitle>记录技能发动</DialogTitle><DialogDescription>按现实牌桌录入使用者、卡片、目标和持续范围；不要求先在网站里抽卡。</DialogDescription></DialogHeader>
            <div className="skill-record-grid">
              <Label>使用者
                <Select value={skillForm.actorId} onValueChange={(value) => {
                  const actorId = String(value);
                  setSkillForm((form) => ({ ...form, actorId, targetIds: defaultSkillTargets(cards.find((card) => card.id === form.cardId), actorId) }));
                }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{game.players.map((player) => <SelectItem key={player.id} value={player.id}>{player.wind} · {player.name}</SelectItem>)}</SelectContent></Select>
              </Label>
              <Label>搜索技能<Input placeholder="输入卡名或效果关键词" value={skillRecordSearch} onChange={(event) => setSkillRecordSearch(event.target.value)} /></Label>
              <Label className="full">技能卡
                <Select items={cards.map(card=>({value:String(card.id),label:card.type.code+' · '+card.name}))} value={String(skillForm.cardId)} onValueChange={(value) => chooseSkillCard(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{skillRecordCards.map((card) => <SelectItem key={card.id} value={String(card.id)}>{card.type.code} · {card.name}</SelectItem>)}</SelectContent></Select>
              </Label>
              <div className="selected-skill-summary full">
                <span className="wind-seal">{selectedSkillCard?.type.code}</span><div><strong>{selectedSkillCard?.name}</strong><p>{selectedSkillCard?.effectDescription}</p></div>
              </div>
              {selectedSkillCard?.type.code === '陷' && <SettingRow title="陷阱状态" detail={skillForm.hidden ? '暗置时只公开持有者，不显示卡名与效果' : '立即明置并选择受影响目标'}><Switch checked={skillForm.hidden} onCheckedChange={(checked) => setSkillForm((form) => ({ ...form, hidden: checked, targetIds: checked ? [] : form.targetIds }))} /></SettingRow>}
              {selectedSkillCard?.type.code === '单' && <p className="detected-yaku-note full">“单”只对使用者自己发动，但全场都能看到记录。</p>}
              {selectedSkillCard?.type.code === '环' && <p className="detected-yaku-note full">“环”作用于整张牌桌；新环境会令旧环境效果结束。</p>}
              {(selectedSkillCard?.type.code === '团' || selectedSkillCard?.type.code === '攻' || (selectedSkillCard?.type.code === '陷' && !skillForm.hidden)) && (
                <fieldset className="full"><legend>实际受影响玩家</legend><div className="target-grid">{game.players.map((player) => {
                  const selected = skillForm.targetIds.includes(player.id);
                  return <Label className="target-toggle" key={player.id}><Checkbox checked={selected} onCheckedChange={(checked) => setSkillForm((form) => ({ ...form, targetIds: checked ? [...form.targetIds, player.id] : form.targetIds.filter((id) => id !== player.id) }))} /><span>{player.wind} · {player.name}<small>{player.team}</small></span></Label>;
                })}</div></fieldset>
              )}
              <Label>持续范围<Select value={skillForm.duration} onValueChange={(value) => setSkillForm((form) => ({ ...form, duration: String(value) as SkillDuration }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DURATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Label>
              <Label>显示给玩家的效果说明<textarea value={skillForm.note} onChange={(event) => setSkillForm((form) => ({ ...form, note: event.target.value }))} /></Label>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setSkillRecordOpen(false)}>取消</Button><Button className="gold-button" onClick={recordSkillEffect}><Sparkles /> {skillForm.hidden ? '暗置陷阱' : '记录发动'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(selectedManagedEffect)} onOpenChange={(open) => !open && setManageEffectId(null)}>
          <DialogContent className="effect-manage-dialog">
            <DialogHeader><DialogTitle>{selectedManagedEffect && effectIsHidden(selectedManagedEffect) ? '揭示暗置陷阱' : selectedManagedEffect?.cardName ?? '管理技能效果'}</DialogTitle><DialogDescription>{selectedManagedEffect && effectIsHidden(selectedManagedEffect) ? '触发后补录目标与公开说明，所有玩家即可看到。' : '可结束效果，或先打开目标玩家的快速罚点面板。'}</DialogDescription></DialogHeader>
            {selectedManagedEffect && effectIsHidden(selectedManagedEffect) ? <>
              <div className="target-grid">{game.players.map((player) => <Label className="target-toggle" key={player.id}><Checkbox checked={revealTargets.includes(player.id)} onCheckedChange={(checked) => setRevealTargets((ids) => checked ? [...ids, player.id] : ids.filter((id) => id !== player.id))} /><span>{player.wind} · {player.name}</span></Label>)}</div>
              <Label>公开效果说明<textarea value={revealNote} onChange={(event) => setRevealNote(event.target.value)} /></Label>
              <DialogFooter><Button variant="outline" onClick={() => setManageEffectId(null)}>保持暗置</Button><Button className="gold-button" onClick={revealEffect}><Eye /> 揭示并发动</Button></DialogFooter>
            </> : selectedManagedEffect ? <>
              <div className="effect-detail-copy"><p>{selectedManagedEffect.effectText}</p><small>{DURATION_LABELS[selectedManagedEffect.duration ?? 'hand']}</small></div>
              <DialogFooter>
                {effectTargets(selectedManagedEffect).length > 0 && <Button variant="outline" onClick={() => { const targetId = effectTargets(selectedManagedEffect)[0]; const name = selectedManagedEffect.cardName ?? '技能效果'; setManageEffectId(null); focusPlayer(targetId); setQuickPointForm((form) => ({ ...form, reason: name })); setPlayerActionOpen(true); }}>对目标罚点</Button>}
                <Button variant="destructive" onClick={() => resolveEffect(selectedManagedEffect.id)}>结束／解除效果</Button>
              </DialogFooter>
            </> : null}
          </DialogContent>
        </Dialog>

        <Dialog open={musicOpen} onOpenChange={setMusicOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>立直音乐</DialogTitle><DialogDescription>仅牌桌主机播放，立即生效，不会重开对局。</DialogDescription></DialogHeader>
            <SettingRow title="播放音乐" detail="场上无人立直时自动停止"><Switch checked={game.settings.riichiMusicEnabled} onCheckedChange={(checked) => commit((current) => ({ ...current, settings: { ...current.settings, riichiMusicEnabled: checked } }))} /></SettingRow>
            <Label>立直曲目<Select value={game.settings.riichiMusicTrack} onValueChange={(value) => commit((current) => ({ ...current, settings: { ...current.settings, riichiMusicTrack: value ?? 'random' } }))}><SelectTrigger aria-label="立直曲目"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="random">随机播放</SelectItem>{RIICHI_MUSIC.map((track) => <SelectItem key={track.id} value={track.id}>{track.label}</SelectItem>)}</SelectContent></Select></Label>
          </DialogContent>
        </Dialog>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="setup-dialog wide-dialog">
            <DialogHeader><DialogTitle>新对局规则</DialogTitle><DialogDescription>调整后会建立一场新对局，当前对局可用撤销恢复。</DialogDescription></DialogHeader>
            <div className="settings-layout"><nav className="settings-shortcuts" aria-label="规则快捷导航">{['基础规则','技能与牌山','日麻计分细则','玩家与阵营'].map(name=><button type="button" key={name} aria-current={settingsSection===name?'location':undefined} onClick={()=>{setSettingsSection(name);document.getElementById('settings-'+name)?.scrollIntoView({behavior:'smooth',block:'start'});}}>{name}</button>)}</nav><div className="settings-scroll">
              <div className="settings-section" id="settings-基础规则"><h3>基础规则</h3>
                <SettingRow title="参与人数" detail="三人麻将会移除二万至八万"><Select value={String(settingsDraft.playerCount)} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, playerCount: Number(value) as 3 | 4 }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="4">四人麻将</SelectItem><SelectItem value="3">三人麻将</SelectItem></SelectContent></Select></SettingRow>
                <SettingRow title="麻将无双" detail="技能卡、环境与陷阱区"><Switch checked={settingsDraft.wushuang} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, wushuang: checked, bloodBattle: checked ? draft.bloodBattle : false }))} /></SettingRow>
                <SettingRow title="血战到底" detail="和牌者退场，其余玩家继续"><Switch checked={settingsDraft.bloodBattle} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, bloodBattle: checked }))} /></SettingRow>
                <SettingRow title="阵营计分" detail="默认东／西同队、南／北同队"><Switch checked={settingsDraft.teamsEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, teamsEnabled: checked }))} /></SettingRow>
                <SettingRow title="对家自动同队" detail="开启后以东／西、南／北为默认阵营"><Switch checked={settingsDraft.oppositeTeams} onCheckedChange={(checked) => { setSettingsDraft((draft) => ({ ...draft, oppositeTeams: checked })); if (checked) setPlayerDrafts((drafts) => drafts.map((player, index) => ({ ...player, team: index % 2 === 0 ? '朱雀' : '玄武' }))); }} /></SettingRow>
                <SettingRow title="飞牌使用" detail="在实体牌桌记录飞牌与技能造成的移牌"><Switch checked={settingsDraft.flyingTiles} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, flyingTiles: checked }))} /></SettingRow>
                <div className="field-grid two"><Label>开局点数<Input type="number" step={1000} min={0} value={settingsDraft.startingPoints} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, startingPoints: Math.max(0, Number(event.target.value)) }))} /></Label><Label>返还点 / 目标点<Input type="number" step={1000} min={0} value={settingsDraft.targetPoints} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, targetPoints: Math.max(0, Number(event.target.value)) }))} /></Label></div>
                <SettingRow title="每巡计时" detail="固定时间每巡恢复；额外时间用完后本局不再恢复"><Switch checked={settingsDraft.turnTimerEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, turnTimerEnabled: checked }))} /></SettingRow>
                <div className="field-grid two timer-settings-grid"><Label>默认固定时间（秒）<Input type="number" inputMode="numeric" min={0} max={3600} value={settingsDraft.turnFixedSeconds} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, turnFixedSeconds: Math.max(0, Math.min(3600, Number(event.target.value) || 0)) }))} /></Label><Label>默认额外时间（秒）<Input type="number" inputMode="numeric" min={0} max={86400} value={settingsDraft.turnExtraSeconds} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, turnExtraSeconds: Math.max(0, Math.min(86400, Number(event.target.value) || 0)) }))} /></Label></div>
                <SettingRow title="立直音乐" detail="有人立直时只在牌桌主机循环播放"><Switch checked={settingsDraft.riichiMusicEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, riichiMusicEnabled: checked }))} /></SettingRow>
                <SettingRow title="立直曲目" detail="随机模式：每次开始立直音乐时随机选一首，本次循环播放"><Select value={settingsDraft.riichiMusicTrack} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, riichiMusicTrack: value ?? 'random' }))}><SelectTrigger aria-label="立直曲目"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="random">随机播放</SelectItem>{RIICHI_MUSIC.map((track) => <SelectItem key={track.id} value={track.id}>{track.label}</SelectItem>)}</SelectContent></Select></SettingRow>
              </div>
              <div className="settings-section" id="settings-技能与牌山"><h3>技能与牌山</h3>
                <div className="slider-setting"><span><strong>每巡技能上限</strong><small>{settingsDraft.maxSkillsPerTurn} 张</small></span><Slider min={0} max={5} step={1} value={[settingsDraft.maxSkillsPerTurn]} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, maxSkillsPerTurn: Number(Array.isArray(value) ? value[0] : value) }))} /></div>
                <div className="slider-setting"><span><strong>开局技能卡</strong><small>每人 {settingsDraft.startingSkillCards} 张</small></span><Slider min={0} max={6} step={1} value={[settingsDraft.startingSkillCards]} onValueChange={(value) => setSettingsDraft((draft) => ({ ...draft, startingSkillCards: Number(Array.isArray(value) ? value[0] : value) }))} /></div>
                <SettingRow title="杠牌抽技能" detail="每次杠牌额外获得一张技能卡"><Switch checked={settingsDraft.drawSkillOnKan} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, drawSkillOnKan: checked }))} /></SettingRow>
                <SettingRow title="拔花 / 拔北抽技能" detail="补牌以外再获得一张技能卡"><Switch checked={settingsDraft.drawSkillOnFlower} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, drawSkillOnFlower: checked }))} /></SettingRow>
                <SettingRow title="花牌" detail="允许记录春夏秋冬、梅兰竹菊"><Switch checked={settingsDraft.flowersEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, flowersEnabled: checked }))} /></SettingRow>
                <div className="field-grid two wall-settings-grid">
                  <Label>实体花牌数量<Input type="number" inputMode="numeric" min={0} max={32} disabled={!settingsDraft.flowersEnabled} value={settingsDraft.flowerTileCount} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, flowerTileCount: Math.max(0, Math.min(32, Number(event.target.value) || 0)) }))} /><small>启用花牌后会加入初始牌山；常见八花为 8 张。</small></Label>
                  <Label>初始牌山<Input type="number" inputMode="numeric" min={0} max={999} value={settingsDraft.initialWallCount ?? automaticInitialWallCount(settingsDraft)} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setSettingsDraft((draft) => ({ ...draft, initialWallCount: Math.max(0, Math.min(999, Number(event.target.value) || 0)) }))} /><small>{settingsDraft.initialWallCount === null ? '当前按人数、王牌与花牌自动计算' : '当前使用自定义张数'}</small></Label>
                </div>
                {settingsDraft.initialWallCount !== null && <Button className="wall-auto-reset" type="button" variant="outline" onClick={() => setSettingsDraft((draft) => ({ ...draft, initialWallCount: null }))}>恢复自动计算（{automaticInitialWallCount(settingsDraft)} 张）</Button>}
                <SettingRow title="三麻拔北" detail="三人麻将可把北风当作宝牌"><Switch checked={settingsDraft.nukiEnabled} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, nukiEnabled: checked }))} /></SettingRow>
              </div>
              <div className="settings-section" id="settings-日麻计分细则"><h3>日麻计分细则</h3>
                <SettingRow title="赤宝牌" detail="虚拟牌山加入赤五万、筒、索"><Switch checked={settingsDraft.akaDora} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, akaDora: checked }))} /></SettingRow>
                <SettingRow title="食断" detail="副露状态下允许断幺九"><Switch checked={settingsDraft.openTanyao} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, openTanyao: checked }))} /></SettingRow>
                <SettingRow title="切上满贯" detail="30符4番与60符3番按满贯"><Switch checked={settingsDraft.kiriageMangan} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, kiriageMangan: checked }))} /></SettingRow>
                <SettingRow title="累计役满" detail="13番以上按役满而非三倍满"><Switch checked={settingsDraft.kazoeYakuman} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, kazoeYakuman: checked }))} /></SettingRow>
                <SettingRow title="三麻自摸损" detail="缺席北家的付款份额不补齐"><Switch checked={settingsDraft.sanmaTsumoLoss} onCheckedChange={(checked) => setSettingsDraft((draft) => ({ ...draft, sanmaTsumoLoss: checked }))} /></SettingRow>
              </div>
              <div className="settings-section" id="settings-玩家与阵营"><h3>玩家与阵营</h3><div className="player-settings-grid">{playerDrafts.slice(0, settingsDraft.playerCount).map((player, index) => <div key={index}><span className="wind-seal">{WINDS[index]}</span><Input aria-label={`${WINDS[index]}家名称`} value={player.name} onChange={(event) => setPlayerDrafts((drafts) => drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, name: event.target.value } : draft))} /><Input aria-label={`${WINDS[index]}家阵营`} disabled={!settingsDraft.teamsEnabled} value={player.team} onChange={(event) => setPlayerDrafts((drafts) => drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, team: event.target.value } : draft))} /></div>)}</div></div>
              <div className="settings-section"><h3>角色</h3><div className="character-seat-choices">{playerDrafts.slice(0, settingsDraft.playerCount).map((player, index) => <button type="button" key={index} onClick={() => setCharacterSeat(index)}><CharacterAvatar choice={player.character} /><span>{WINDS[index]}家 · {player.name}<small>{player.character?.name ?? '选择角色'}</small></span></button>)}</div></div>
            </div>
            </div><DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button><Button className="gold-button" onClick={startFreshMatch}><ListRestart /> 应用并开始新对局</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        {characterSeat !== null && <CharacterPicker value={playerDrafts[characterSeat]?.character} onClose={() => setCharacterSeat(null)} onSelect={(choice: CharacterChoice) => {
          setPlayerDrafts(drafts => drafts.map((draft, index) => index === characterSeat ? { ...draft, character: choice } : draft));
          const playerId = game.players[characterSeat]?.id;
          if (playerId) commit(current => ({ ...current, players: current.players.map(player => player.id === playerId ? { ...player, character: choice } : player) }));
        }} />}

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="history-dialog"><DialogHeader><DialogTitle>对局记录</DialogTitle><DialogDescription>最近的操作显示在最上方。</DialogDescription></DialogHeader><div className="history-list">{[...game.history].reverse().map((event) => <article key={event.id}><time>{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{event.title}</strong><p>{event.detail}</p>{event.deltas && <small>{Object.entries(event.deltas).map(([id, delta]) => `${game.players.find((player) => player.id === id)?.name ?? id} ${delta > 0 ? '+' : ''}${delta.toLocaleString('zh-CN')}`).join(' · ')}</small>}</div></article>)}</div><DialogFooter><Button variant="outline" onClick={undo}><RotateCcw /> 撤销上一项</Button></DialogFooter></DialogContent>
        </Dialog>

        <Dialog open={dataOpen} onOpenChange={setDataOpen}>
          <DialogContent className="data-dialog"><DialogHeader><DialogTitle>导入与导出</DialogTitle><DialogDescription>JSON 文件适合备份、迁移和后续扩展。导入会替换对应的本机数据。</DialogDescription></DialogHeader><div className="data-actions"><button type="button" onClick={() => downloadJson('麻将无双对局备份.json', { schemaVersion: 1, exportedAt: new Date().toISOString(), game })}><Download /><span><strong>导出当前对局</strong><small>玩家、点数、设置、技能手牌与历史</small></span></button><label><Import /><span><strong>导入对局备份</strong><small>从此前导出的 JSON 恢复</small></span><input type="file" accept="application/json,.json" onChange={importMatch} /></label><button type="button" onClick={() => downloadJson('麻将无双技能卡资料库.json', { schemaVersion: 1, cards })}><Library /><span><strong>导出技能库</strong><small>包含 40 张内置卡与自制卡</small></span></button><label><Upload /><span><strong>导入技能库</strong><small>适合批量维护与迁移</small></span><input type="file" accept="application/json,.json" onChange={importSkillLibrary} /></label></div></DialogContent>
        </Dialog>

        <Dialog open={Boolean(detailCard)} onOpenChange={(open) => !open && setDetailCard(null)}>
          <DialogContent className="card-detail-dialog" showCloseButton><DialogHeader><DialogTitle>{detailCard?.name}</DialogTitle><DialogDescription>{detailCard?.rarity} · {detailCard?.type.name}</DialogDescription></DialogHeader>{detailCard && <div className={`card-detail type-${TYPE_STYLES[detailCard.type.code]?.color ?? 'gray'}`}><div className="detail-art">{detailCard.artwork ? <img src={detailCard.artwork} alt="" /> : <Sparkles />}</div><div className="detail-rule"><span>{detailCard.type.code}</span><p>{detailCard.effectDescription}</p><blockquote>{detailCard.flavorText}</blockquote></div><dl><div><dt>使用时机</dt><dd>{detailCard.timing?.playWindow ?? '摸牌前'}</dd></div><div><dt>目标</dt><dd>{detailCard.targeting?.scope ?? '依卡面说明'}</dd></div><div><dt>持续</dt><dd>{detailCard.timing?.duration ?? '依卡面说明'}</dd></div><div><dt>叠加</dt><dd>{detailCard.stackability ?? '资料未说明'}</dd></div></dl>{detailCard.ambiguities?.length ? <div className="ambiguity-note"><ShieldCheck /><span><strong>裁定提示</strong>{detailCard.ambiguities[0]}</span></div> : null}</div>}<DialogFooter><Button variant="outline" onClick={() => { if (detailCard) setEditorCard({ ...detailCard }); setDetailCard(null); }}><Edit3 /> 编辑资料</Button>{currentPlayer && game.settings.wushuang && <Button className="gold-button" onClick={() => openSkillRecorder(currentPlayer.id, detailCard?.id)}><Sparkles /> 记录发动</Button>}</DialogFooter></DialogContent>
        </Dialog>

        <Dialog open={Boolean(editorCard)} onOpenChange={(open) => !open && setEditorCard(null)}>
          <DialogContent className="editor-dialog"><DialogHeader><DialogTitle>技能卡编辑器</DialogTitle><DialogDescription>卡片会保存到本机技能库；图片建议小于 1.5 MB。</DialogDescription></DialogHeader>{editorCard && <div className="editor-grid"><div className="editor-preview">{editorCard.artwork ? <img src={editorCard.artwork} alt="技能卡素材预览" /> : <Sparkles />}<label className="upload-art"><Upload /> 更换素材<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleCardImage} /></label></div><div className="editor-fields"><div className="field-grid two"><Label>名称<Input value={editorCard.name} onChange={(event) => setEditorCard((card) => card ? { ...card, name: event.target.value } : card)} /></Label><Label>稀有度<Select value={editorCard.rarity} onValueChange={(value) => setEditorCard((card) => card ? { ...card, rarity: String(value) } : card)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['普通', '稀有', '史诗'].map((rarity) => <SelectItem key={rarity} value={rarity}>{rarity}</SelectItem>)}</SelectContent></Select></Label><Label>类型<Select value={editorCard.type.code} onValueChange={(value) => setEditorCard((card) => card ? { ...card, type: { ...card.type, code: String(value), name: TYPE_STYLES[String(value)]?.label ?? '自定义' } } : card)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['单', '团', '攻', '陷', '环'].map((type) => <SelectItem key={type} value={type}>{type} · {TYPE_STYLES[type].label}</SelectItem>)}</SelectContent></Select></Label><Label>使用时机<Input value={editorCard.timing?.playWindow ?? ''} onChange={(event) => setEditorCard((card) => card ? { ...card, timing: { ...card.timing, playWindow: event.target.value } } : card)} /></Label></div><Label>效果说明<textarea value={editorCard.effectDescription} onChange={(event) => setEditorCard((card) => card ? { ...card, effectDescription: event.target.value, summary: event.target.value } : card)} /></Label><Label>风味文字<Input value={editorCard.flavorText} onChange={(event) => setEditorCard((card) => card ? { ...card, flavorText: event.target.value } : card)} /></Label></div></div>}<DialogFooter>{editorCard && cards.some((card) => card.id === editorCard.id) && <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> 删除</Button>}<Button variant="outline" onClick={() => setEditorCard(null)}>取消</Button><Button className="gold-button" onClick={saveCard}><Save /> 保存技能卡</Button></DialogFooter></DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这张技能卡？</AlertDialogTitle><AlertDialogDescription>技能库和玩家手牌中的这张卡都会移除。此操作可通过重新导入备份恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (!editorCard) return; const id = editorCard.id; setCards((current) => current.filter((card) => card.id !== id)); commit((current) => ({ ...current, players: current.players.map((player) => ({ ...player, skillHand: player.skillHand.filter((cardId) => cardId !== id) })), skillDeck: current.skillDeck.filter((cardId) => cardId !== id), skillDiscard: current.skillDiscard.filter((cardId) => cardId !== id) })); setEditorCard(null); setDeleteOpen(false); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </main>
    </TooltipProvider>
  );
}
