import { emptyActions, type AuthoritativeGameState, type AvailableActions, type Clock, type Discard,
  type GameMode, type Meld, type Phase, type Rules, type Wind, type RoundResult, type MatchResult } from './model';
import type { Tile } from './tiles';
import { doraIndicators } from './wall';
import { callDeadline } from './call-window';
import { isFuriten } from './scoring';

type VisibleTile = Pick<Tile, 'id' | 'type' | 'red'>;
export interface VisiblePlayer {
  id: string; name: string; seat: number; wind: Wind; points: number;
  connected: boolean; ready: boolean; handCount: number;
  riichi: 'none' | 'riichi' | 'double-riichi';
  melds: Meld[]; nuki: VisibleTile[]; river: Discard[];
  /** These properties are ABSENT for opponents, not hidden only by CSS. */
  hand?: VisibleTile[];
  drawnTileId?: number | null;
  furiten?: boolean;
}
export interface PlayerVisibleGameState {
  protocol: 'musou.virtual.v1';
  gameId: string; roundId: string; turnId: number; revision: number;
  viewerId: string | null; mode: GameMode; rules: Rules;
  phase: { kind: Phase['kind']; playerId?: string; responseDeadline?: number;
    responseClock?: { startedAt: number; fixedMs: number; bankMs: number };
    call?: { sourcePlayerId: string; trigger: 'discard' | 'ankan' | 'kakan' | 'nuki'; tile: VisibleTile } };
  players: VisiblePlayer[];
  roundWind: Wind; handNumber: number; dealerId: string; honba: number; riichiSticks: number;
  wallRemaining: number; doraIndicators: VisibleTile[];
  clock: Clock | null;
  availableActions: AvailableActions;
  result?: RoundResult;
  matchResult?: MatchResult;
  roundContinuation?: { dealerId: string; roundWind: Wind; handNumber: number; honba: number; riichiSticks: number };
}

// Explicit allowlists: adding a private property later must not silently expose it.
const tile = (value: Tile): VisibleTile => ({ id: value.id, type: value.type, red: value.red });
function copyRules(value: Rules): Rules {
  return { players: value.players, length: value.length, startingPoints: value.startingPoints,
    returnPoints: value.returnPoints, openTanyao: value.openTanyao, redFives: value.redFives,
    kiriageMangan: value.kiriageMangan, kazoeYakuman: value.kazoeYakuman, doubleYakuman: value.doubleYakuman,
    sanmaTsumoLoss: value.sanmaTsumoLoss, multiRon: value.multiRon,
    abortiveDraws: { nineTerminals: value.abortiveDraws.nineTerminals, fourWinds: value.abortiveDraws.fourWinds,
      fourKans: value.abortiveDraws.fourKans, fourRiichi: value.abortiveDraws.fourRiichi },
    timer: { fixedMs: value.timer.fixedMs, bankMs: value.timer.bankMs, responseMs: value.timer.responseMs },
    match: { bankruptcy: value.match.bankruptcy, dealerWinEnd: value.match.dealerWinEnd,
      dealerTenpaiEnd: value.match.dealerTenpaiEnd, extension: value.match.extension, uma: [...value.match.uma] } };
}
function copyActions(value: AvailableActions): AvailableActions {
  return { discardableTileIds: [...value.discardableTileIds], riichiDiscardTileIds: [...value.riichiDiscardTileIds],
    selfKanOptions: value.selfKanOptions.map(option => ({ id: option.id, kind: option.kind, tileIds: [...option.tileIds] })),
    nukiTileIds: [...value.nukiTileIds],
    callOptions: value.callOptions.map(option => ({ id: option.id, kind: option.kind, consumeTileIds: [...option.consumeTileIds] })),
    canTsumo: value.canTsumo, canPass: value.canPass, canAbortNineTerminals: value.canAbortNineTerminals };
}

function copyResult(result: RoundResult, playerIds: string[]): RoundResult {
  const amounts = (record: Record<string, number>) => Object.fromEntries(playerIds
    .filter(id => Object.hasOwn(record, id)).map(id => [id, record[id]]));
  return { reason: result.reason, tenpaiPlayerIds: [...result.tenpaiPlayerIds],
    ...(result.nagashiPlayerIds ? { nagashiPlayerIds: [...result.nagashiPlayerIds] } : {}), deltas: amounts(result.deltas),
    wins: result.wins.map(win => ({ playerId: win.playerId, winningTile: tile(win.winningTile),
      concealed: win.concealed.map(tile), yaku: [...win.yaku], han: win.han, fu: win.fu, yakuman: win.yakuman,
      bonus: { dora: win.bonus.dora, ura: win.bonus.ura, aka: win.bonus.aka, nuki: win.bonus.nuki },
      uraIndicators: win.uraIndicators.map(tile), label: win.label, winnerGain: win.winnerGain, payments: amounts(win.payments) })) };
}

export type Viewer = { role: 'player'; playerId: string } | { role: 'spectator' };

function copyMatchResult(value: MatchResult): MatchResult {
  return { reason: value.reason, topPlayerId: value.topPlayerId,
    depositAward: { playerId: value.depositAward.playerId, points: value.depositAward.points },
    rankings: value.rankings.map(rank => ({ playerId: rank.playerId, rank: rank.rank, points: rank.points,
      returnDelta: rank.returnDelta, oka: rank.oka, uma: rank.uma, score: rank.score })) };
}

/** Transport must authenticate Viewer first. This function is NOT an authentication API. */
export function projectForViewer(state: AuthoritativeGameState, viewer: Viewer): PlayerVisibleGameState {
  const viewerId = viewer.role === 'player' ? viewer.playerId : null;
  if (viewerId !== null && !state.players.some(player => player.id === viewerId)) throw new Error('Unknown viewer');
  const phase: PlayerVisibleGameState['phase'] = { kind: state.phase.kind };
  if ('playerId' in state.phase) phase.playerId = state.phase.playerId;
  if (state.phase.kind === 'WAITING_CALL_RESPONSE') {
    const window = state.phase.window;
    phase.responseDeadline = window.deadline;
    if (viewerId && window.timing && Object.hasOwn(window.eligible, viewerId) && !Object.hasOwn(window.responses, viewerId)) {
      phase.responseDeadline = callDeadline(window, viewerId);
      phase.responseClock = { startedAt: window.timing.startedAt, fixedMs: window.timing.fixedMs, bankMs: window.timing.banks[viewerId] };
    }
    phase.call = { sourcePlayerId: window.sourcePlayerId, trigger: window.trigger, tile: tile(window.tile) };
  }
  const clock = state.clock;
  return {
    protocol: 'musou.virtual.v1', gameId: state.gameId, roundId: state.roundId, turnId: state.turnId,
    revision: state.revision, viewerId, mode: state.mode, rules: copyRules(state.rules), phase,
    players: state.players.map(player => {
      const visible: VisiblePlayer = {
        id: player.id, name: player.name, seat: player.seat, wind: player.wind, points: player.points,
        connected: player.connected, ready: player.ready, handCount: player.hand.length, riichi: player.riichi,
        nuki: player.nuki.map(tile),
        melds: player.melds.map(meld => ({ id: meld.id, kind: meld.kind, tiles: meld.tiles.map(tile),
          sourcePlayerId: meld.sourcePlayerId, calledTileId: meld.calledTileId, addedTileId: meld.addedTileId })),
        river: player.river.map(discard => ({ tile: tile(discard.tile), turnId: discard.turnId,
          riichi: discard.riichi, tsumogiri: discard.tsumogiri, calledBy: discard.calledBy })),
      };
      if (player.id === viewerId) {
        visible.hand = player.hand.map(tile);
        visible.drawnTileId = player.drawnTileId;
        // On a drawn turn, retain the pre-draw wait's indication until the chosen discard updates it.
        const beforeDraw = player.drawnTileId === null ? player : { ...player, hand: player.hand.filter(tile => tile.id !== player.drawnTileId) };
        const window = state.phase.kind === 'WAITING_CALL_RESPONSE' ? state.phase.window : null;
        const response = window?.responses[player.id];
        const passedRon = Boolean(response && window?.eligible[player.id]?.some(option => option.kind === 'ron' && option.id !== response));
        visible.furiten = player.furiten.temporary || player.furiten.riichi || passedRon
          || (beforeDraw.hand.length % 3 === 1 && isFuriten(beforeDraw, state.rules.players));
      }
      return visible;
    }),
    roundWind: state.roundWind, handNumber: state.handNumber, dealerId: state.dealerId,
    honba: state.honba, riichiSticks: state.riichiSticks, wallRemaining: state.wall?.live.length ?? 0,
    doraIndicators: state.wall ? doraIndicators(state.wall).map(tile) : [],
    clock: clock ? { playerId: clock.playerId, startedAt: clock.startedAt, fixedMs: clock.fixedMs,
      bankMs: clock.bankMs, pausedAt: clock.pausedAt } : null,
    availableActions: viewerId === null || !Object.hasOwn(state.actions, viewerId)
      ? emptyActions() : copyActions(state.actions[viewerId]),
    ...(['ROUND_RESULT', 'MATCH_RESULT'].includes(state.phase.kind) && state.result
      ? { result: copyResult(state.result, state.players.map(player => player.id)) } : {}),
    ...(state.phase.kind === 'MATCH_RESULT' && state.matchResult ? { matchResult: copyMatchResult(state.matchResult) } : {}),
  };
}
