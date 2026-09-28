import type { PlayerCount, Tile } from './tiles';
import type { Wall } from './wall';

export type GameMode = 'STANDARD_RIICHI' | 'MAHJONG_MUSOU';
export type Wind = 'east' | 'south' | 'west' | 'north';
export interface Rules {
  players: PlayerCount;
  length: 'east' | 'hanchan';
  startingPoints: number;
  returnPoints: number;
  openTanyao: boolean;
  redFives: boolean;
  kiriageMangan: boolean;
  kazoeYakuman: boolean;
  doubleYakuman: boolean;
  sanmaTsumoLoss: boolean;
  multiRon: 'all' | 'head-bump' | 'triple-abort';
  abortiveDraws: { nineTerminals: boolean; fourWinds: boolean; fourKans: boolean; fourRiichi: boolean };
  timer: { fixedMs: number; bankMs: number; responseMs: number };
  match: { bankruptcy: boolean; dealerWinEnd: boolean; dealerTenpaiEnd: boolean;
    extension: 'none' | 'one-wind'; uma: number[] };
}

export interface Meld {
  id: string;
  kind: 'chi' | 'pon' | 'daiminkan' | 'ankan' | 'kakan';
  tiles: Tile[];
  sourcePlayerId: string | null;
  calledTileId: number | null;
  addedTileId: number | null;
}
export interface Discard {
  tile: Tile;
  turnId: number;
  riichi: boolean;
  tsumogiri: boolean;
  calledBy: string | null;
}
export interface Player {
  id: string;
  name: string;
  seat: number;
  wind: Wind;
  points: number;
  connected: boolean;
  ready: boolean;
  hand: Tile[];
  drawnTileId: number | null;
  melds: Meld[];
  /** Sanma north extractions are public, but are not melds and keep the hand closed. */
  nuki: Tile[];
  river: Discard[];
  riichi: 'none' | 'riichi' | 'double-riichi';
  ippatsu: boolean;
  furiten: { temporary: boolean; riichi: boolean };
  bankMs: number;
}

/** Host-generated choices; clients return an option ID, never a fabricated meld. */
export interface CallOption {
  id: string;
  kind: 'ron' | 'pon' | 'chi' | 'daiminkan';
  consumeTileIds: number[];
}
export interface CallWindow {
  id: string;
  sourcePlayerId: string;
  tile: Tile;
  trigger: 'discard' | 'kakan' | 'ankan' | 'nuki';
  eligible: Record<string, CallOption[]>;
  /** Option ID or the reserved string "pass". */
  responses: Record<string, string>;
  deadline: number;
  /** Host-only per-player bank accounting. Absent in pre-checkpoint17 saves. */
  timing?: { startedAt: number; fixedMs: number; banks: Record<string, number>; respondedAt: Record<string, number> };
}
export type Phase =
  | { kind: 'ROOM_WAITING' }
  | { kind: 'ROUND_INITIALIZING' | 'DEALING' }
  | { kind: 'WAITING_DRAW' | 'AFTER_DRAW' | 'WAITING_DISCARD'; playerId: string }
  | { kind: 'WAITING_CALL_RESPONSE'; window: CallWindow }
  | { kind: 'CALL_RESOLUTION'; window: CallWindow }
  | { kind: 'KAN_PROCESSING' | 'RINSHAN_DRAW'; playerId: string; meldId: string }
  | { kind: 'WIN_RESOLUTION' | 'DRAW_RESOLUTION' | 'ROUND_RESULT' | 'NEXT_ROUND' | 'MATCH_RESULT' };

export interface AvailableActions {
  discardableTileIds: number[];
  riichiDiscardTileIds: number[];
  selfKanOptions: { id: string; kind: 'ankan' | 'kakan'; tileIds: number[] }[];
  nukiTileIds: number[];
  callOptions: CallOption[];
  canTsumo: boolean;
  canPass: boolean;
  canAbortNineTerminals: boolean;
}
export function emptyActions(): AvailableActions {
  return { discardableTileIds: [], riichiDiscardTileIds: [], selfKanOptions: [], nukiTileIds: [], callOptions: [],
    canTsumo: false, canPass: false, canAbortNineTerminals: false };
}

export interface Clock {
  playerId: string;
  startedAt: number;
  fixedMs: number;
  bankMs: number;
  pausedAt: number | null;
}
export interface WinScore {
  playerId: string;
  winningTile: Tile;
  concealed: Tile[];
  yaku: string[];
  han: number;
  fu: number;
  yakuman: number;
  bonus: { dora: number; ura: number; aka: number; nuki: number };
  uraIndicators: Tile[];
  label: string;
  winnerGain: number;
  payments: Record<string, number>;
}
export interface RoundResult {
  reason: 'ron' | 'tsumo' | 'exhaustive' | 'nagashi' | 'triple-ron' | 'nine-terminals' | 'four-winds' | 'four-riichi' | 'four-kans';
  wins: WinScore[];
  tenpaiPlayerIds: string[];
  nagashiPlayerIds?: string[];
  deltas: Record<string, number>;
}
export interface PrivateEvent {
  sequenceId: number;
  timestamp: number;
  type: 'GAME_START' | 'ROUND_START' | 'DEAL' | 'DRAW' | 'DISCARD' | 'RIICHI' | 'CHI' | 'PON' | 'KAN' | 'NUKI'
    | 'DORA_REVEAL' | 'RON' | 'TSUMO' | 'DRAW_GAME' | 'SCORE_CHANGE' | 'ROUND_END' | 'MATCH_END';
  playerId: string | null;
  data: Record<string, unknown>;
}

export interface MatchResult {
  reason: 'bankruptcy' | 'scheduled-end' | 'dealer-end' | 'extension-target' | 'extension-limit';
  topPlayerId: string;
  depositAward: { playerId: string; points: number };
  rankings: { playerId: string; rank: number; points: number; returnDelta: number;
    oka: number; uma: number; score: number }[];
}

/** Entire object is Host-private, including event payloads and available actions. */
export interface AuthoritativeGameState {
  schemaVersion: 1;
  gameId: string;
  roundId: string;
  turnId: number;
  revision: number;
  mode: GameMode;
  rules: Rules;
  phase: Phase;
  players: Player[];
  wall: Wall | null;
  roundWind: Wind;
  handNumber: number;
  dealerId: string;
  honba: number;
  riichiSticks: number;
  clock: Clock | null;
  actions: Record<string, AvailableActions>;
  events: PrivateEvent[];
  result?: RoundResult;
  matchResult?: MatchResult;
}
