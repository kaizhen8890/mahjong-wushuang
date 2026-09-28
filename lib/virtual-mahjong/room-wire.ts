import type { Rules } from './model';
import type { PlayerVisibleGameState } from './projection';
import { validateRules } from './rules';
import { validCharacterChoice, type CharacterChoice } from '../characters';
export const VIRTUAL_ROOM_PROTOCOL = 'musou.virtual.room.v2';
export interface RoomSnapshot {
  revision: number; configurationRevision: number; hostPlayerId: string; serverNow: number; rules: Rules;
  seats: { playerId: string; name: string; seat: number; ready: boolean; connected: boolean; bot?: boolean; character?: CharacterChoice }[];
  game?: PlayerVisibleGameState;
}
type Shape = string | Shape[] | { [key: string]: Shape };
const tile = { id: 'number', type: 'number', red: 'boolean' };
const meld = { id: 'string', kind: 'string', tiles: [tile], sourcePlayerId: 'string|null', calledTileId: 'number|null', addedTileId: 'number|null' };
const rules = { players: 'number', length: 'string', startingPoints: 'number', returnPoints: 'number', openTanyao: 'boolean', redFives: 'boolean', kiriageMangan: 'boolean', kazoeYakuman: 'boolean', doubleYakuman: 'boolean', sanmaTsumoLoss: 'boolean', multiRon: 'string', abortiveDraws: { nineTerminals: 'boolean', fourWinds: 'boolean', fourKans: 'boolean', fourRiichi: 'boolean' }, timer: { fixedMs: 'number', bankMs: 'number', responseMs: 'number' }, match: { bankruptcy: 'boolean', dealerWinEnd: 'boolean', dealerTenpaiEnd: 'boolean', extension: 'string', uma: ['number'] } };
const amounts = { '*': 'number' };
const gameShape = {
  protocol: 'string', gameId: 'string', roundId: 'string', turnId: 'number', revision: 'number', viewerId: 'string', mode: 'string', rules,
  phase: { kind: 'string', 'playerId?': 'string', 'responseDeadline?': 'number', 'responseClock?': { startedAt: 'number', fixedMs: 'number', bankMs: 'number' }, 'call?': { sourcePlayerId: 'string', trigger: 'string', tile } },
  players: [{ id: 'string', name: 'string', seat: 'number', wind: 'string', points: 'number', connected: 'boolean', ready: 'boolean', handCount: 'number', riichi: 'string', melds: [meld], nuki: [tile], river: [{ tile, turnId: 'number', riichi: 'boolean', tsumogiri: 'boolean', calledBy: 'string|null' }], 'hand?': [tile], 'drawnTileId?': 'number|null', 'furiten?': 'boolean' }],
  roundWind: 'string', handNumber: 'number', dealerId: 'string', honba: 'number', riichiSticks: 'number', wallRemaining: 'number', doraIndicators: [tile],
  clock: { playerId: 'string', startedAt: 'number', fixedMs: 'number', bankMs: 'number', pausedAt: 'number|null', '$nullable': 'yes' },
  availableActions: { discardableTileIds: ['number'], riichiDiscardTileIds: ['number'], selfKanOptions: [{ id: 'string', kind: 'string', tileIds: ['number'] }], nukiTileIds: ['number'], callOptions: [{ id: 'string', kind: 'string', consumeTileIds: ['number'] }], canTsumo: 'boolean', canPass: 'boolean', canAbortNineTerminals: 'boolean' },
  'result?': { reason: 'string', tenpaiPlayerIds: ['string'], 'nagashiPlayerIds?': ['string'], deltas: amounts, wins: [{ playerId: 'string', winningTile: tile, concealed: [tile], yaku: ['string'], han: 'number', fu: 'number', yakuman: 'number', bonus: { dora: 'number', ura: 'number', aka: 'number', nuki: 'number' }, uraIndicators: [tile], label: 'string', winnerGain: 'number', payments: amounts }] },
  'matchResult?': { reason: 'string', topPlayerId: 'string', depositAward: { playerId: 'string', points: 'number' }, rankings: [{ playerId: 'string', rank: 'number', points: 'number', returnDelta: 'number', oka: 'number', uma: 'number', score: 'number' }] },
  'roundContinuation?': { dealerId: 'string', roundWind: 'string', handNumber: 'number', honba: 'number', riichiSticks: 'number' },
};
function check(value: unknown, shape: Shape): void {
  if (typeof shape === 'string') {
    if (value === null && shape.endsWith('|null')) return;
    if (typeof value !== shape.split('|')[0] || (typeof value === 'number' && !Number.isFinite(value)) || (typeof value === 'string' && value.length > 256)) throw new Error('INVALID_SNAPSHOT');
  } else if (Array.isArray(shape)) {
    if (!Array.isArray(value) || value.length > 136) throw new Error('INVALID_SNAPSHOT');
    value.forEach(item => check(item, shape[0]));
  } else {
    if (value === null && shape.$nullable) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SNAPSHOT');
    const data = value as Record<string, unknown>;
    if (shape['*']) { Object.values(data).forEach(item => check(item, shape['*'])); return; }
    const keys = Object.keys(shape).filter(key => key !== '$nullable');
    if (Object.keys(data).some(key => !keys.some(allowed => allowed.replace(/\?$/, '') === key))) throw new Error('UNEXPECTED_SNAPSHOT_FIELD');
    for (const key of keys) {
      const name = key.replace(/\?$/, '');
      if (!(name in data) && key.endsWith('?')) continue;
      check(data[name], shape[key]);
    }
    if (shape === tile && (!Number.isInteger(data.id) || Number(data.id) < 0 || Number(data.id) > 135 || !Number.isInteger(data.type) || Number(data.type) < 0 || Number(data.type) > 33 || (data.red && ![4, 13, 22].includes(Number(data.type))))) throw new Error('INVALID_TILE');
  }
}
/** Validate the wire shape, not mahjong legality. Reject authority fields and another player's hand. */
export function readRoomSnapshot(input: unknown, playerId: string): RoomSnapshot {
  const character = { id: 'string', name: 'string', 'avatarHash?': 'string', 'portraitHash?': 'string' };
  check(input, { revision: 'number', configurationRevision: 'number', hostPlayerId: 'string', serverNow: 'number', rules, seats: [{ playerId: 'string', name: 'string', seat: 'number', ready: 'boolean', connected: 'boolean', 'bot?': 'boolean', 'character?': character }], 'game?': gameShape });
  const value = input as RoomSnapshot;
  validateRules(value.rules);
  const ids = value.seats.map(seat => seat.playerId);
  const validId = (id: string) => ids.includes(id);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isSafeInteger(value.configurationRevision) || value.configurationRevision < 1 || value.seats.length > value.rules.players || new Set(ids).size !== ids.length || !validId(playerId) || !validId(value.hostPlayerId) || value.seats.some((seat, i) => seat.seat !== i)
    || value.seats.some(seat => seat.character !== undefined && !validCharacterChoice(seat.character))
    || value.seats.some(seat => seat.bot && (!seat.ready || !seat.connected || seat.playerId === value.hostPlayerId || seat.playerId === playerId))) throw new Error('INVALID_ROOM_SEATS');
  const game = value.game;
  if (game) {
    validateRules(game.rules);
    if (JSON.stringify(game.rules) !== JSON.stringify(value.rules)) throw new Error('RULES_MISMATCH');
    if (game.protocol !== 'musou.virtual.v1' || game.viewerId !== playerId || game.players.length !== value.rules.players || game.players.some((player, i) => player.id !== ids[i]) || !validId(game.dealerId)) throw new Error('WRONG_VIEWER');
    if (!['AFTER_DRAW', 'WAITING_DISCARD', 'WAITING_CALL_RESPONSE', 'ROUND_RESULT', 'MATCH_RESULT'].includes(game.phase.kind)) throw new Error('INVALID_PHASE');
    if (game.result && !['ROUND_RESULT', 'MATCH_RESULT'].includes(game.phase.kind)) throw new Error('EARLY_RESULT');
    const next = game.roundContinuation;
    if (next && (!game.result || game.matchResult || game.phase.kind !== 'ROUND_RESULT' || !validId(next.dealerId)
      || !['east', 'south', 'west', 'north'].includes(next.roundWind)
      || !Number.isSafeInteger(next.handNumber) || next.handNumber < 1 || next.handNumber > game.players.length
      || !Number.isSafeInteger(next.honba) || next.honba < 0 || !Number.isSafeInteger(next.riichiSticks) || next.riichiSticks < 0)) throw new Error('INVALID_CONTINUATION');
    if (!['east', 'south', 'west', 'north'].includes(game.roundWind) || game.handNumber < 1 || game.handNumber > value.rules.players) throw new Error('INVALID_ROUND');
    for (const player of game.players) {
      if (player.id !== playerId && (player.hand !== undefined || player.drawnTileId !== undefined || player.furiten !== undefined)) throw new Error('HIDDEN_HAND');
      if (!['east', 'south', 'west', 'north'].includes(player.wind)) throw new Error('INVALID_WIND');
      for (const meld of player.melds) if (!['chi', 'pon', 'daiminkan', 'ankan', 'kakan'].includes(meld.kind) || (meld.kind !== 'ankan' && (!validId(meld.sourcePlayerId!) || !meld.tiles.some(tile => tile.id === meld.calledTileId)))) throw new Error('INVALID_MELD');
      if (player.nuki.length > 4 || player.nuki.some(tile => tile.type !== 30) || (game.rules.players === 4 && player.nuki.length)) throw new Error('INVALID_NUKI');
    }
    const own = game.players.find(player => player.id === playerId)!;
    if (!own.hand || own.hand.length !== own.handCount || (own.drawnTileId != null && !own.hand.some(tile => tile.id === own.drawnTileId))) throw new Error('INVALID_HAND');
    const actions = game.availableActions;
    const responseClock = game.phase.responseClock;
    if (responseClock && (game.phase.kind !== 'WAITING_CALL_RESPONSE' || !actions.canPass
      || responseClock.startedAt < 0 || responseClock.fixedMs !== game.rules.timer.responseMs
      || responseClock.bankMs < 0 || responseClock.bankMs > game.rules.timer.bankMs
      || game.phase.responseDeadline !== responseClock.startedAt + responseClock.fixedMs + responseClock.bankMs)) throw new Error('INVALID_RESPONSE_CLOCK');
    const optionIds = [...actions.discardableTileIds, ...actions.riichiDiscardTileIds, ...actions.nukiTileIds,
      ...actions.callOptions.flatMap(option => option.consumeTileIds), ...actions.selfKanOptions.flatMap(option => option.tileIds)];
    if (optionIds.some(id => !own.hand!.some(tile => tile.id === id)) || actions.callOptions.some(option => !['chi', 'pon', 'daiminkan', 'ron'].includes(option.kind)) || actions.selfKanOptions.some(option => !['ankan', 'kakan'].includes(option.kind))) throw new Error('INVALID_PROMPT');
    if (actions.nukiTileIds.some(id => !own.hand!.some(tile => tile.id === id && tile.type === 30))
      || (game.rules.players === 4 && actions.nukiTileIds.length)) throw new Error('INVALID_NUKI_PROMPT');
    if (game.result?.wins.some(win => !validId(win.playerId) || Object.keys(win.payments).some(id => !validId(id)))
      || game.result?.nagashiPlayerIds?.some(id => !validId(id))
      || (game.result?.nagashiPlayerIds && new Set(game.result.nagashiPlayerIds).size !== game.result.nagashiPlayerIds.length)
      || (game.result?.reason === 'nagashi' && (!game.result.nagashiPlayerIds?.length || game.result.wins.length > 0))
      || (game.result?.reason !== 'nagashi' && Boolean(game.result?.nagashiPlayerIds?.length))
      || game.matchResult?.rankings.some(rank => !validId(rank.playerId))) throw new Error('INVALID_RESULT');
  }
  return structuredClone(value);
}
