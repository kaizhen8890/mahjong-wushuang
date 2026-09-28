import { defaultSeatCharacter } from './characters';

export type PlayerCount = 3 | 4;
export type Wind = '东' | '南' | '西' | '北';
export type TurnPhase = 'skill' | 'discard';
export type WinType = 'ron' | 'tsumo';

export interface SkillCard {
  id: number;
  name: string;
  rarity: string;
  type: {
    code: string;
    name: string;
    guide: string;
  };
  effectDescription: string;
  flavorText: string;
  summary: string;
  timing?: {
    playWindow?: string;
    activationTriggers?: string[];
    duration?: string;
    expiry?: string;
  };
  targeting?: {
    scope?: string;
    factionRelations?: string[];
  };
  constraints?: string[];
  stackability?: string;
  factionAndMode?: {
    usesFactionSemantics?: boolean;
    requiresTeamAssignment?: boolean;
    bloodBattleRulesRequired?: boolean;
    playerCountNotes?: string[];
    physicalTableDependency?: string;
  };
  ambiguities?: string[];
  artwork?: string | null;
  custom?: boolean;
}

export interface GameSettings {
  playerCount: PlayerCount;
  startingPoints: number;
  targetPoints: number;
  wushuang: boolean;
  bloodBattle: boolean;
  teamsEnabled: boolean;
  oppositeTeams: boolean;
  flyingTiles: boolean;
  flowersEnabled: boolean;
  /** 实体牌组中额外加入的花牌数量，常见为春夏秋冬、梅兰竹菊共 8 张。 */
  flowerTileCount: number;
  /** null 表示按人数、王牌与花牌数量自动计算。 */
  initialWallCount: number | null;
  nukiEnabled: boolean;
  akaDora: boolean;
  openTanyao: boolean;
  kiriageMangan: boolean;
  kazoeYakuman: boolean;
  sanmaTsumoLoss: boolean;
  startingSkillCards: number;
  maxSkillsPerTurn: number;
  drawSkillOnFlower: boolean;
  drawSkillOnKan: boolean;
  /** 每巡倒计时与每名玩家的额外思考时间。 */
  turnTimerEnabled: boolean;
  turnFixedSeconds: number;
  turnExtraSeconds: number;
  /** 只由牌桌主机播放，手机遥控器不会循环播放。 */
  riichiMusicEnabled: boolean;
  riichiMusicTrack: string;
}

export interface PlayerState {
  id: string;
  character?: import('./characters').CharacterChoice;
  wind: Wind;
  name: string;
  score: number;
  team: string;
  active: boolean;
  /** 当前手牌中的参与状态；active 保留用于兼容旧存档。 */
  participation: 'playing' | 'won' | 'eliminated';
  /** 淘汰只持续本局，或持续到整场比赛结束。 */
  eliminationScope?: 'hand' | 'match';
  eliminationReason?: string;
  riichi: boolean;
  flowers: number;
  nuki: number;
  kans: number;
  flyingTiles: number;
  skillHand: number[];
  usedSkillsThisTurn: number;
  /** 当前局的固定时间和剩余额外时间，可由牌桌按技能效果单独修改。 */
  turnFixedSeconds: number;
  turnExtraSeconds: number;
}

export interface GameEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  deltas?: Record<string, number>;
}

export interface ActiveSkillEffect {
  id: string;
  cardId: number;
  /** 新版实体牌桌伴侣使用的可读快照；均为可选以兼容旧存档。 */
  cardName?: string;
  effectText?: string;
  sourcePlayerId?: string;
  targetPlayerIds?: string[];
  affectedPlayerIds?: string[];
  scope?: 'self' | 'team' | 'player' | 'table';
  visibility?: 'public' | 'face-down';
  state?: 'armed' | 'active' | 'triggered' | 'resolved';
  duration?: 'once' | 'hand' | 'match' | 'manual';
  note?: string;
  createdAt?: string;
  /** 旧版字段保留，读取旧存档时可由界面层归一化为上方字段。 */
  ownerId: string;
  targetId?: string;
  faceDown: boolean;
  status: 'active' | 'resolved';
}

export interface VirtualState {
  started: boolean;
  wall: string[];
  hands: Record<string, string[]>;
  rivers: Record<string, string[]>;
}

export interface GameState {
  presentations?: import('./presentation').TablePresentation[];
  settings: GameSettings;
  players: PlayerState[];
  roundWind: Wind;
  handNumber: number;
  honba: number;
  riichiSticks: number;
  turnIndex: number;
  turnNumber: number;
  /** 当前操作玩家这一次计时开始的主机时间戳。 */
  turnStartedAt: number;
  turnState?: 'waiting' | 'thinking';
  turnElapsedMs?: number;
  timerPaused?: boolean;
  phase: TurnPhase;
  handEnded: boolean;
  dealerRepeat: boolean;
  wallCount: number;
  environmentSkillId: number | null;
  skillDeck: number[];
  skillDiscard: number[];
  effects: ActiveSkillEffect[];
  history: GameEvent[];
  virtual: VirtualState;
  status: string;
}

export interface YakuDefinition {
  id: string;
  name: string;
  closedHan: number;
  openHan: number;
  group: string;
  yakuman?: number;
}

export interface SettlementInput {
  winnerId: string;
  loserId?: string;
  winType: WinType;
  han: number;
  fu: number;
  yakuman: number;
  honba: number;
  riichiSticks: number;
  dealer: boolean;
  playerCount: PlayerCount;
  kiriageMangan: boolean;
  kazoeYakuman: boolean;
  sanmaTsumoLoss: boolean;
  /** 技能造成的固定额外得点；荣和由放铳者付，自摸由付款者平分。 */
  extraPoints?: number;
}

export interface SettlementResult {
  label: string;
  basePoints: number;
  winnerGain: number;
  payments: Record<string, number>;
  summary: string;
}

export const WINDS: Wind[] = ['东', '南', '西', '北'];

export const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 4,
  startingPoints: 25000,
  targetPoints: 30000,
  wushuang: true,
  bloodBattle: true,
  teamsEnabled: true,
  oppositeTeams: true,
  flyingTiles: true,
  flowersEnabled: true,
  flowerTileCount: 8,
  initialWallCount: null,
  nukiEnabled: true,
  akaDora: true,
  openTanyao: true,
  kiriageMangan: false,
  kazoeYakuman: true,
  sanmaTsumoLoss: true,
  startingSkillCards: 2,
  maxSkillsPerTurn: 1,
  drawSkillOnFlower: true,
  drawSkillOnKan: true,
  turnTimerEnabled: true,
  turnFixedSeconds: 15,
  turnExtraSeconds: 30,
  riichiMusicEnabled: true,
  riichiMusicTrack: 'random',
};

export const YAKU: YakuDefinition[] = [
  { id: 'menzen-tsumo', name: '门前清自摸和', closedHan: 1, openHan: 0, group: '一番役' },
  { id: 'riichi', name: '立直', closedHan: 1, openHan: 0, group: '一番役' },
  { id: 'double-riichi', name: '两立直', closedHan: 2, openHan: 0, group: '二番以上' },
  { id: 'ippatsu', name: '一发', closedHan: 1, openHan: 0, group: '一番役' },
  { id: 'pinfu', name: '平和', closedHan: 1, openHan: 0, group: '一番役' },
  { id: 'tanyao', name: '断幺九', closedHan: 1, openHan: 1, group: '一番役' },
  { id: 'iipeikou', name: '一杯口', closedHan: 1, openHan: 0, group: '一番役' },
  ...[['seat-wind', '自风刻子'], ['round-wind', '场风刻子'], ['haku', '白刻子'], ['hatsu', '发刻子'], ['chun', '中刻子']].map(([id, name]) => ({ id, name, closedHan: 1, openHan: 1, group: '一番役' })),
  { id: 'sanshoku-doukou', name: '三色同刻', closedHan: 2, openHan: 2, group: '二番以上' },
  ...[['kokushi-13', '国士无双十三面'], ['suuankou-tanki', '四暗刻单骑'], ['junsei-chuuren', '纯正九莲宝灯']].map(([id, name]) => ({ id, name, closedHan: 0, openHan: 0, group: '双倍役满', yakuman: 2 })),
  { id: 'haitei', name: '海底摸月', closedHan: 1, openHan: 1, group: '一番役' },
  { id: 'houtei', name: '河底捞鱼', closedHan: 1, openHan: 1, group: '一番役' },
  { id: 'rinshan', name: '岭上开花', closedHan: 1, openHan: 1, group: '一番役' },
  { id: 'chankan', name: '抢杠', closedHan: 1, openHan: 1, group: '一番役' },
  { id: 'chiitoi', name: '七对子', closedHan: 2, openHan: 0, group: '二番以上' },
  { id: 'toitoi', name: '对对和', closedHan: 2, openHan: 2, group: '二番以上' },
  { id: 'sanankou', name: '三暗刻', closedHan: 2, openHan: 2, group: '二番以上' },
  { id: 'sanshoku', name: '三色同顺', closedHan: 2, openHan: 1, group: '二番以上' },
  { id: 'ittsu', name: '一气通贯', closedHan: 2, openHan: 1, group: '二番以上' },
  { id: 'chanta', name: '混全带幺九', closedHan: 2, openHan: 1, group: '二番以上' },
  { id: 'junchan', name: '纯全带幺九', closedHan: 3, openHan: 2, group: '二番以上' },
  { id: 'honroutou', name: '混老头', closedHan: 2, openHan: 2, group: '二番以上' },
  { id: 'shousangen', name: '小三元', closedHan: 2, openHan: 2, group: '二番以上' },
  { id: 'sankantsu', name: '三杠子', closedHan: 2, openHan: 2, group: '二番以上' },
  { id: 'honitsu', name: '混一色', closedHan: 3, openHan: 2, group: '染手' },
  { id: 'chinitsu', name: '清一色', closedHan: 6, openHan: 5, group: '染手' },
  { id: 'ryanpeikou', name: '二杯口', closedHan: 3, openHan: 0, group: '二番以上' },
  { id: 'kokushi', name: '国士无双', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'suuankou', name: '四暗刻', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'daisangen', name: '大三元', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'shousuushi', name: '小四喜', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'daisuushi', name: '大四喜', closedHan: 0, openHan: 0, group: '役满', yakuman: 2 },
  { id: 'tsuuiisou', name: '字一色', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'ryuuiisou', name: '绿一色', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'chinroutou', name: '清老头', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'chuuren', name: '九莲宝灯', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'suukantsu', name: '四杠子', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'tenhou', name: '天和', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
  { id: 'chiihou', name: '地和', closedHan: 0, openHan: 0, group: '役满', yakuman: 1 },
];

export const TILE_IDS = [
  ...['m', 'p', 's'].flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${index + 1}${suit}`)),
  ...Array.from({ length: 7 }, (_, index) => `${index + 1}z`),
];

export const TILE_LABELS: Record<string, string> = {
  '1z': '东',
  '2z': '南',
  '3z': '西',
  '4z': '北',
  '5z': '白',
  '6z': '发',
  '7z': '中',
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function shuffle<T>(input: T[]): T[] {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createPlayers(settings: GameSettings): PlayerState[] {
  const teams = settings.oppositeTeams
    ? ['朱雀', '玄武', '朱雀', '玄武']
    : ['甲', '甲', '乙', '乙'];
  return WINDS.slice(0, settings.playerCount).map((wind, index) => ({
    id: `player-${index + 1}`,
    character: defaultSeatCharacter(index),
    wind,
    name: `玩家${['一', '二', '三', '四'][index]}`,
    score: settings.startingPoints,
    team: settings.teamsEnabled ? teams[index] : '个人',
    active: true,
    participation: 'playing',
    riichi: false,
    flowers: 0,
    nuki: 0,
    kans: 0,
    flyingTiles: 0,
    skillHand: [],
    usedSkillsThisTurn: 0,
    turnFixedSeconds: Math.max(0, Math.trunc(settings.turnFixedSeconds)),
    turnExtraSeconds: Math.max(0, Math.trunc(settings.turnExtraSeconds)),
  }));
}

/**
 * 东家第一次摸牌前的可摸牌山：四麻 136 - 52 - 14 = 70；
 * 三麻去掉二万至八万后为 108 - 39 - 14 = 55。花牌作为额外实体牌加入。
 */
export function automaticInitialWallCount(settings: Pick<GameSettings, 'playerCount' | 'flowersEnabled' | 'flowerTileCount'>) {
  const base = settings.playerCount === 3 ? 55 : 70;
  const flowers = settings.flowersEnabled ? Math.max(0, Math.trunc(settings.flowerTileCount || 0)) : 0;
  return base + flowers;
}

export function resolveInitialWallCount(settings: GameSettings) {
  if (settings.initialWallCount !== null && Number.isFinite(settings.initialWallCount)) {
    return Math.max(0, Math.trunc(settings.initialWallCount));
  }
  return automaticInitialWallCount(settings);
}

export function drawSkills(
  state: GameState,
  playerId: string,
  count: number,
  allCardIds: number[],
): GameState {
  let deck = [...state.skillDeck];
  let discard = [...state.skillDiscard];
  const drawn: number[] = [];
  const heldCards = new Set(state.players.flatMap((player) => player.skillHand));
  for (let index = 0; index < count; index += 1) {
    if (deck.length === 0) {
      const missingCards = allCardIds.filter((cardId) => !heldCards.has(cardId) && !discard.includes(cardId));
      deck = shuffle([...discard, ...missingCards]);
      discard = [];
    }
    const card = deck.shift();
    if (card !== undefined) {
      drawn.push(card);
      heldCards.add(card);
    }
  }
  return {
    ...state,
    skillDeck: deck,
    skillDiscard: discard,
    players: state.players.map((player) =>
      player.id === playerId
        ? { ...player, skillHand: [...player.skillHand, ...drawn] }
        : player,
    ),
  };
}

export function createGameState(
  settings: GameSettings = DEFAULT_SETTINGS,
  allCardIds: number[] = [],
): GameState {
  let state: GameState = {
    settings: { ...settings },
    players: createPlayers(settings),
    roundWind: '东',
    handNumber: 1,
    honba: 0,
    riichiSticks: 0,
    turnIndex: 0,
    turnNumber: 1,
    turnStartedAt: Date.now(),
    turnState: 'waiting',
    turnElapsedMs: 0,
    timerPaused: false,
    phase: 'skill',
    handEnded: false,
    dealerRepeat: false,
    wallCount: resolveInitialWallCount(settings),
    environmentSkillId: null,
    skillDeck: shuffle(allCardIds),
    skillDiscard: [],
    effects: [],
    history: [
      {
        id: makeId('event'),
        at: new Date().toISOString(),
        title: '对局开始',
        detail: `${settings.playerCount} 人麻将，起始 ${settings.startingPoints.toLocaleString('zh-CN')} 点`,
      },
    ],
    virtual: { started: false, wall: [], hands: {}, rivers: {} },
    status: '对局已建立',
  };

  if (settings.wushuang && settings.startingSkillCards > 0 && allCardIds.length) {
    for (const player of state.players) {
      state = drawSkills(state, player.id, settings.startingSkillCards, allCardIds);
    }
    state.history = [
      ...state.history,
      {
        id: makeId('event'),
        at: new Date().toISOString(),
        title: '分发技能卡',
        detail: `每位玩家获得 ${settings.startingSkillCards} 张技能卡`,
      },
    ];
  }
  return state;
}

export function addEvent(
  state: GameState,
  title: string,
  detail: string,
  deltas?: Record<string, number>,
): GameState {
  return {
    ...state,
    status: detail,
    history: [
      ...state.history,
      { id: makeId('event'), at: new Date().toISOString(), title, detail, deltas },
    ],
  };
}

export function nextActiveIndex(players: PlayerState[], currentIndex: number) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (currentIndex + offset) % players.length;
    if (players[index]?.active) return index;
  }
  return currentIndex;
}

export interface TurnClock {
  enabled: boolean;
  playerId: string;
  fixedRemaining: number;
  extraRemaining: number;
  totalRemaining: number;
  usingExtra: boolean;
  expired: boolean;
}

export function calculateTurnClock(state: GameState, now = Date.now()): TurnClock {
  const player = state.players[state.turnIndex];
  const fixed = Math.max(0, Math.trunc(player?.turnFixedSeconds ?? state.settings.turnFixedSeconds));
  const extra = Math.max(0, Math.trunc(player?.turnExtraSeconds ?? state.settings.turnExtraSeconds));
  const thinking = Boolean(state.settings.turnTimerEnabled && player && !state.handEnded && player.active && state.turnState === 'thinking');
  const enabled = thinking && !state.timerPaused;
  const elapsed = thinking ? turnElapsedMs(state, now) / 1000 : 0;
  const fixedRemaining = Math.max(0, Math.ceil(fixed - elapsed));
  const extraElapsed = Math.max(0, elapsed - fixed);
  const extraRemaining = Math.max(0, Math.ceil(extra - extraElapsed));
  const totalRemaining = Math.max(0, Math.ceil(fixed + extra - elapsed));
  return {
    enabled,
    playerId: player?.id ?? '',
    fixedRemaining,
    extraRemaining,
    totalRemaining,
    usingExtra: enabled && elapsed >= fixed && extra > 0,
    expired: enabled && totalRemaining <= 0,
  };
}

export function turnElapsedMs(state: GameState, now = Date.now()): number {
  if (state.turnState !== 'thinking') return 0;
  return Math.max(0, state.turnElapsedMs ?? 0) + (state.timerPaused ? 0 : Math.max(0, now - state.turnStartedAt));
}

/** 一巡只结算一次额外时间；结束后不启动任何人的下一巡。 */
export function stopTurnClock(state: GameState, now = Date.now()): GameState {
  if (state.turnState !== 'thinking') return state;
  const current = state.players[state.turnIndex];
  let players = state.players;
  if (state.settings.turnTimerEnabled && current && !state.handEnded) {
    const fixed = Math.max(0, Math.trunc(current.turnFixedSeconds ?? state.settings.turnFixedSeconds));
    const elapsed = turnElapsedMs(state, now) / 1000;
    const extraUsed = Math.max(0, Math.ceil(elapsed - fixed));
    if (extraUsed > 0) {
      players = state.players.map((player, index) => index === state.turnIndex
        ? { ...player, turnExtraSeconds: Math.max(0, player.turnExtraSeconds - extraUsed) }
        : player);
    }
  }
  return { ...state, players, turnState: 'waiting', turnElapsedMs: 0, turnStartedAt: Math.max(now, state.turnStartedAt + 1) };
}

/** 只由明确的摸牌/接手操作启动。名牌查看、出牌和下一局均不启动计时。 */
export function startTurnClock(state: GameState, nextIndex: number, now = Date.now()): GameState {
  if (state.timerPaused || state.handEnded || !state.players[nextIndex]?.active) return state;
  if (state.turnState === 'thinking' && nextIndex === state.turnIndex) return state;
  const stopped = stopTurnClock(state, now);
  return { ...stopped, turnIndex: nextIndex, turnState: 'thinking', turnElapsedMs: 0, turnStartedAt: Math.max(now, state.turnStartedAt + 1) };
}

/** 暂停期间不消耗固定或额外时间，恢复后延续同一巡。 */
export function setTimerPaused(state: GameState, paused: boolean, now = Date.now()): GameState {
  if (Boolean(state.timerPaused) === paused) return state;
  return { ...state, timerPaused: paused, turnElapsedMs: turnElapsedMs(state, now), turnStartedAt: Math.max(now, state.turnStartedAt + 1) };
}

/**
 * 计算流局时的听牌/未听罚符。结果只包含仍在本局中的玩家，正数为收入、负数为支出。
 * 不能整除时按玩家在 players 中的顺序分配余数，因此始终保持整数且总和为零。
 */
export function calculateExhaustiveDraw(
  players: PlayerState[],
  tenpaiIds: string[],
  pool = 3000,
): Record<string, number> {
  const playingPlayers = players.filter(
    (player) => player.active && (player.participation ?? 'playing') === 'playing',
  );
  const result = Object.fromEntries(playingPlayers.map((player) => [player.id, 0]));
  const tenpaiSet = new Set(tenpaiIds);
  const tenpaiPlayers = playingPlayers.filter((player) => tenpaiSet.has(player.id));
  const notenPlayers = playingPlayers.filter((player) => !tenpaiSet.has(player.id));
  const normalizedPool = Math.max(0, Math.trunc(pool));

  if (
    normalizedPool === 0
    || tenpaiPlayers.length === 0
    || notenPlayers.length === 0
  ) {
    return result;
  }

  const distribute = (total: number, count: number) => {
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  };

  distribute(normalizedPool, tenpaiPlayers.length).forEach((points, index) => {
    result[tenpaiPlayers[index].id] = points;
  });
  distribute(normalizedPool, notenPlayers.length).forEach((points, index) => {
    result[notenPlayers[index].id] = -points;
  });

  return result;
}

export function ceilHundred(value: number) {
  return Math.ceil(value / 100) * 100;
}

export function scoreBase(
  han: number,
  fu: number,
  yakuman: number,
  kiriageMangan: boolean,
  kazoeYakuman: boolean,
) {
  if (yakuman > 0) {
    return {
      base: 8000 * yakuman,
      label: yakuman === 1 ? '役满' : `${yakuman} 倍役满`,
    };
  }
  if (han >= 13) {
    return kazoeYakuman
      ? { base: 8000, label: '累计役满' }
      : { base: 6000, label: '累计三倍满' };
  }
  if (han >= 11) return { base: 6000, label: '三倍满' };
  if (han >= 8) return { base: 4000, label: '倍满' };
  if (han >= 6) return { base: 3000, label: '跳满' };
  const raw = fu * 2 ** (han + 2);
  const kiriage = kiriageMangan && ((han === 4 && fu === 30) || (han === 3 && fu === 60));
  if (han >= 5 || raw >= 2000 || kiriage) return { base: 2000, label: '满贯' };
  return { base: raw, label: `${han} 番 ${fu} 符` };
}

/** Nagashi mangan uses mangan tsumo payments, replacing noten payments; deposits carry over. */
export function calculateNagashiDraw(game: GameState, winnerIds: string[]): Record<string, number> {
  const deltas: Record<string,number> = Object.fromEntries(game.players.map(p=>[p.id,0]));
  const playing = game.players.filter(p=>p.active && p.participation==='playing');
  for (const id of new Set(winnerIds)) {
    const winner=playing.find(p=>p.id===id);
    if(!winner)continue;
    const result=calculateSettlement({winnerId:id,winType:'tsumo',han:5,fu:30,yakuman:0,honba:0,riichiSticks:0,dealer:winner.wind==='东',playerCount:game.settings.playerCount,kiriageMangan:game.settings.kiriageMangan,kazoeYakuman:game.settings.kazoeYakuman,sanmaTsumoLoss:game.settings.sanmaTsumoLoss},playing);
    deltas[id]+=result.winnerGain;
    Object.entries(result.payments).forEach(([payer,amount])=>{deltas[payer]-=amount;});
  }
  return deltas;
}

export function calculateSettlement(
  input: SettlementInput,
  players: PlayerState[],
): SettlementResult {
  const winner = players.find((player) => player.id === input.winnerId);
  if (!winner) throw new Error('找不到和牌者');
  if (!winner.active) throw new Error('该玩家已在本局和牌');
  if (input.yakuman <= 0 && input.han <= 0) throw new Error('至少需要 1 番或 1 倍役满');

  const { base, label } = scoreBase(
    input.han,
    input.fu,
    input.yakuman,
    input.kiriageMangan,
    input.kazoeYakuman,
  );
  const payers = players.filter((player) => player.active && player.id !== input.winnerId);
  const payments: Record<string, number> = {};

  if (input.winType === 'ron') {
    const loser = players.find((player) => player.id === input.loserId);
    if (!loser || !loser.active || loser.id === winner.id) throw new Error('荣和需要选择仍在牌局中的放铳者');
    payments[loser.id] = ceilHundred(base * (input.dealer ? 6 : 4)) + input.honba * 300;
  } else {
    for (const payer of payers) {
      const isDealerPayer = payer.wind === '东';
      const multiplier = input.dealer || isDealerPayer ? 2 : 1;
      payments[payer.id] = ceilHundred(base * multiplier) + input.honba * 100;
    }

    if (input.playerCount === 3 && !input.sanmaTsumoLoss && payers.length === 2) {
      const normalFourPlayerTotal = input.dealer
        ? ceilHundred(base * 2) * 3 + input.honba * 300
        : ceilHundred(base * 2) + ceilHundred(base) * 2 + input.honba * 300;
      const currentTotal = Object.values(payments).reduce((sum, value) => sum + value, 0);
      const shortfall = Math.max(0, normalFourPlayerTotal - currentTotal);
      let assigned = 0;
      payers.forEach((payer, index) => {
        const remaining = shortfall - assigned;
        const recipientsLeft = payers.length - index;
        const addition = ceilHundred(remaining / recipientsLeft);
        payments[payer.id] += addition;
        assigned += addition;
      });
    }
  }

  const extraPoints = Math.max(0, Math.trunc(input.extraPoints ?? 0));
  if (extraPoints > 0 && payers.length > 0) {
    if (input.winType === 'ron') {
      const loserId = input.loserId as string;
      payments[loserId] = (payments[loserId] ?? 0) + extraPoints;
    } else {
      const baseShare = Math.floor(extraPoints / payers.length);
      let remainder = extraPoints - baseShare * payers.length;
      for (const payer of payers) {
        const addition = baseShare + (remainder > 0 ? 1 : 0);
        payments[payer.id] = (payments[payer.id] ?? 0) + addition;
        remainder = Math.max(0, remainder - 1);
      }
    }
  }

  const paymentTotal = Object.values(payments).reduce((sum, value) => sum + value, 0);
  const winnerGain = paymentTotal + input.riichiSticks * 1000;
  const paymentText = Object.entries(payments)
    .map(([playerId, points]) => {
      const player = players.find((candidate) => candidate.id === playerId);
      return `${player?.name ?? playerId} ${points.toLocaleString('zh-CN')}`;
    })
    .join('，');

  return {
    label,
    basePoints: base,
    winnerGain,
    payments,
    summary: `${winner.name} ${input.winType === 'ron' ? '荣和' : '自摸'}，${label}${extraPoints > 0 ? `，技能额外得点 ${extraPoints.toLocaleString('zh-CN')}` : ''}；${paymentText}`,
  };
}

export function createTileWall(settings: GameSettings) {
  const baseTiles = TILE_IDS.filter((tile) => {
    if (settings.playerCount !== 3) return true;
    return !/^[2-8]m$/.test(tile);
  });
  const wall = baseTiles.flatMap((tile) => Array.from({ length: 4 }, () => tile));
  if (settings.akaDora) {
    for (const suit of ['m', 'p', 's']) {
      if (settings.playerCount === 3 && suit === 'm') continue;
      const index = wall.indexOf(`5${suit}`);
      if (index >= 0) wall[index] = `0${suit}`;
    }
  }
  return shuffle(wall);
}

export function startVirtualRound(state: GameState): GameState {
  const wall = createTileWall(state.settings);
  const hands: Record<string, string[]> = {};
  const rivers: Record<string, string[]> = {};
  for (const player of state.players) {
    hands[player.id] = [];
    rivers[player.id] = [];
  }
  for (let count = 0; count < 13; count += 1) {
    for (const player of state.players) {
      const tile = wall.pop();
      if (tile) hands[player.id].push(tile);
    }
  }
  wall.splice(0, Math.min(14, wall.length));
  return addEvent(
    {
      ...state,
      phase: 'skill',
      turnIndex: 0,
      turnNumber: 1,
      wallCount: wall.length,
      virtual: { started: true, wall, hands, rivers },
    },
    '虚拟牌桌开局',
    `已为 ${state.players.length} 名玩家发牌，等待东家摸牌前操作`,
  );
}

export function sortTiles(tiles: string[]) {
  const suitOrder: Record<string, number> = { m: 0, p: 1, s: 2, z: 3 };
  return [...tiles].sort((a, b) => {
    const aSuit = a.slice(-1);
    const bSuit = b.slice(-1);
    if (suitOrder[aSuit] !== suitOrder[bSuit]) return suitOrder[aSuit] - suitOrder[bSuit];
    const aRank = Number(a[0] === '0' ? 5 : a[0]);
    const bRank = Number(b[0] === '0' ? 5 : b[0]);
    return aRank - bRank || a.localeCompare(b);
  });
}

/**
 * 仅识别无需拆解面子的可靠役种。输入使用 1m..9m、1p..9p、1s..9s、1z..7z，
 * 赤五 0m/0p/0s 会按普通五处理。七对子和国士只在恰好 14 张时识别；杠后
 * 平铺列表超过 14 张时仍可识别纯牌张构成类役种，但不会猜测结构役。
 */
export function recognizeSimpleYaku(tiles: string[]): string[] {
  if (tiles.length === 0) return [];

  const normalizedTiles = tiles.map((tile) => (/^0[mps]$/.test(tile) ? `5${tile[1]}` : tile));
  const validTiles = new Set(TILE_IDS);
  if (normalizedTiles.some((tile) => !validTiles.has(tile))) return [];

  const counts = new Map<string, number>();
  normalizedTiles.forEach((tile) => counts.set(tile, (counts.get(tile) ?? 0) + 1));

  const isHonor = (tile: string) => tile.endsWith('z');
  const isTerminal = (tile: string) => !isHonor(tile) && (tile[0] === '1' || tile[0] === '9');
  const isTerminalOrHonor = (tile: string) => isHonor(tile) || isTerminal(tile);
  const suitedTiles = normalizedTiles.filter((tile) => !isHonor(tile));
  const suits = new Set(suitedTiles.map((tile) => tile[1]));
  const hasHonors = normalizedTiles.some(isHonor);
  const recognized: string[] = [];

  if (normalizedTiles.every((tile) => !isTerminalOrHonor(tile))) recognized.push('tanyao');

  if (suits.size === 1 && suitedTiles.length > 0) {
    recognized.push(hasHonors ? 'honitsu' : 'chinitsu');
  }

  if (normalizedTiles.every(isTerminalOrHonor)) recognized.push('honroutou');

  if (
    normalizedTiles.length === 14
    && counts.size === 7
    && [...counts.values()].every((count) => count === 2)
  ) {
    recognized.push('chiitoi');
  }

  if (normalizedTiles.every(isHonor)) recognized.push('tsuuiisou');

  const greenTiles = new Set(['2s', '3s', '4s', '6s', '8s', '6z']);
  if (normalizedTiles.every((tile) => greenTiles.has(tile))) recognized.push('ryuuiisou');

  if (normalizedTiles.every(isTerminal)) recognized.push('chinroutou');

  if (normalizedTiles.length === 14) {
    const orphanTiles = new Set([
      '1m', '9m', '1p', '9p', '1s', '9s',
      '1z', '2z', '3z', '4z', '5z', '6z', '7z',
    ]);
    const isKokushi = normalizedTiles.every((tile) => orphanTiles.has(tile))
      && counts.size === orphanTiles.size
      && [...counts.values()].filter((count) => count === 2).length === 1
      && [...counts.values()].every((count) => count === 1 || count === 2);
    if (isKokushi) recognized.push('kokushi');
  }

  return recognized;
}
