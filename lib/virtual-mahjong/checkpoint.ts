import type { AuthoritativeGameState, PrivateEvent } from './model';
import type { SelfKanOption } from './kan';
import { createTiles } from './tiles';
import { validateRules } from './rules';
import { nagashiPlayerIds, nagashiSettlement, waits } from './scoring';
import { validateLocalAccess, type LocalSupplyAccess } from './local-supply';

/** Host-only payload. Never send through the player protocol or put into UI props. */
export interface RoundCheckpoint {
  format: 'musou.host.round'; version: 1; savedAt: number;
  state: Omit<AuthoritativeGameState, 'actions'>;
  runtime: { lastNow: number; firstCycleInterrupted: boolean; pendingRiichi: string | null;
    forbiddenDiscardTypes: number[]; pendingKan: { playerId: string; option: SelfKanOption } | null;
    pendingNuki: { playerId: string; tileId: number } | null;
    rinshanPlayerId: string | null; committedActions: string[]; localSupply?: LocalSupplyAccess };
  // The capability must also be supplied explicitly by the restoring local Host.
}
export function requireCheckpoint(condition: unknown): asserts condition {
  if (!condition) throw new Error('INVALID_HOST_CHECKPOINT');
}
const integer = (n: unknown, min = 0) => Number.isSafeInteger(n) && (n as number) >= min;
const time = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const object = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Accept only JSON data, not custom instances, accessors, NaN, cycles or prototype keys. */
export function cloneCheckpoint<T>(value: unknown): T {
  const seen = new Set<object>();
  function check(item: unknown, depth: number): void {
    requireCheckpoint(depth < 64);
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') { requireCheckpoint(Number.isFinite(item)); return; }
    requireCheckpoint(typeof item === 'object' && !seen.has(item));
    requireCheckpoint(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null);
    if (Array.isArray(item)) requireCheckpoint(Object.keys(item).length === item.length);
    seen.add(item);
    for (const key of Object.keys(item)) {
      requireCheckpoint(!['__proto__', 'constructor', 'prototype'].includes(key));
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      requireCheckpoint('value' in descriptor); check(descriptor.value, depth + 1);
    }
    seen.delete(item);
  }
  check(value, 0);
  return structuredClone(value) as T;
}

export function validateEvents(events: PrivateEvent[], savedAt: number): void {
  requireCheckpoint(Array.isArray(events));
  let lastTime = 0;
  const types = ['GAME_START', 'ROUND_START', 'DEAL', 'DRAW', 'DISCARD', 'RIICHI', 'CHI', 'PON', 'KAN', 'NUKI',
    'DORA_REVEAL', 'RON', 'TSUMO', 'DRAW_GAME', 'SCORE_CHANGE', 'ROUND_END', 'MATCH_END'];
  events.forEach((event, index) => {
    requireCheckpoint(event && event.sequenceId === index + 1 && time(event.timestamp)
      && event.timestamp >= lastTime && event.timestamp <= savedAt && types.includes(event.type)
      && (event.playerId === null || typeof event.playerId === 'string') && object(event.data));
    lastTime = event.timestamp;
  });
}

/** Structural validation, before installing any state or consulting RNG. Semantic prompts are recomputed by the engine. */
export function readRoundCheckpoint(input: unknown): RoundCheckpoint {
  try {
    const value = cloneCheckpoint<RoundCheckpoint>(input);
    requireCheckpoint(value.format === 'musou.host.round' && value.version === 1 && time(value.savedAt));
    const state = value.state; const meta = value.runtime;
    // Existing Host saves predate nuki. Add only the fields that did not exist then.
    if (state?.players) for (const player of state.players) if (player.nuki === undefined) player.nuki = [];
    if (meta && meta.pendingNuki === undefined) meta.pendingNuki = null;
    if (state?.result) for (const win of state.result.wins) if (win.bonus.nuki === undefined) win.bonus.nuki = 0;
    const roundEndResult = state?.events?.at(-1)?.type === 'ROUND_END'
      ? state.events.at(-1)?.data.result as typeof state.result : undefined;
    if (roundEndResult) for (const win of roundEndResult.wins) if (win.bonus.nuki === undefined) win.bonus.nuki = 0;
    requireCheckpoint(state && meta && state.schemaVersion === 1 && state.mode === 'STANDARD_RIICHI'
      && typeof state.gameId === 'string' && state.gameId.length && typeof state.roundId === 'string' && state.roundId.length
      && integer(state.turnId, 1) && integer(state.revision, 1) && !('actions' in state) && !('matchResult' in state));
    validateRules(state.rules);
    requireCheckpoint(Array.isArray(state.players) && state.players.length === state.rules.players);
    const ids = state.players.map(player => player.id);
    if (meta.localSupply !== undefined) validateLocalAccess(meta.localSupply, ids);
    requireCheckpoint(new Set(ids).size === ids.length && ids.every(id => typeof id === 'string'
      && /^[A-Za-z0-9_-]{1,128}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id)));
    const playerRef = (id: unknown) => id === null || ids.includes(id as string);
    const winds = ['east', 'south', 'west', 'north'];
    requireCheckpoint(ids.includes(state.dealerId) && winds.includes(state.roundWind)
      && integer(state.handNumber, 1) && state.handNumber <= ids.length && integer(state.honba) && integer(state.riichiSticks));
    const dealerSeat = ids.indexOf(state.dealerId);
    const expected = createTiles(state.rules.players, state.rules.redFives);
    const tile = (item: { id: number; type: number; red: boolean }) => requireCheckpoint(item && expected.some(original =>
      original.id === item.id && original.type === item.type && original.red === item.red));
    const wall = state.wall;
    requireCheckpoint(wall && Array.isArray(wall.live) && Array.isArray(wall.dead) && wall.dead.length === 14
      && integer(wall.rinshanUsed) && wall.rinshanUsed <= 4 && wall.indicatorsRevealed === wall.rinshanUsed + 1);
    const physical = [...wall.live, ...wall.dead];
    const meldIds = new Set<string>(); let kans = 0;
    const phase = state.phase;
    requireCheckpoint(phase && ['AFTER_DRAW', 'WAITING_DISCARD', 'WAITING_CALL_RESPONSE', 'ROUND_RESULT'].includes(phase.kind));
    state.players.forEach((player, seat) => {
      requireCheckpoint(player.seat === seat && player.wind === winds[(seat - dealerSeat + ids.length) % ids.length]
        && typeof player.name === 'string' && player.name.trim() && Number.isSafeInteger(player.points) && player.points % 100 === 0
        && typeof player.connected === 'boolean' && typeof player.ready === 'boolean'
        && ['none', 'riichi', 'double-riichi'].includes(player.riichi) && typeof player.ippatsu === 'boolean'
        && typeof player.furiten?.temporary === 'boolean' && typeof player.furiten?.riichi === 'boolean'
        && time(player.bankMs) && player.bankMs <= state.rules.timer.bankMs
        && Array.isArray(player.hand) && Array.isArray(player.melds) && player.melds.length <= 4
        && Array.isArray(player.nuki) && player.nuki.length <= 4 && Array.isArray(player.river));
      requireCheckpoint(player.drawnTileId === null || player.hand.some(item => item.id === player.drawnTileId));
      physical.push(...player.hand);
      requireCheckpoint((state.rules.players === 3 || player.nuki.length === 0)
        && player.nuki.every(item => item.type === 30));
      physical.push(...player.nuki);
      for (const meld of player.melds) {
        requireCheckpoint(typeof meld.id === 'string' && !meldIds.has(meld.id)
          && ['chi', 'pon', 'ankan', 'kakan', 'daiminkan'].includes(meld.kind) && Array.isArray(meld.tiles));
        meldIds.add(meld.id);
        const kan = !['chi', 'pon'].includes(meld.kind); if (kan) kans++;
        requireCheckpoint(meld.tiles.length === (kan ? 4 : 3));
        const types = meld.tiles.map(item => item.type).sort((a, b) => a - b);
        requireCheckpoint(meld.kind === 'chi' ? state.rules.players === 4 && types[0] < 27 && types[0] % 9 <= 6
          && types[1] === types[0] + 1 && types[2] === types[0] + 2 : types.every(type => type === types[0]));
        requireCheckpoint(meld.kind === 'ankan' ? meld.sourcePlayerId === null && meld.calledTileId === null && meld.addedTileId === null
          : ids.includes(meld.sourcePlayerId!) && meld.sourcePlayerId !== player.id
            && meld.tiles.some(item => item.id === meld.calledTileId));
        requireCheckpoint(meld.kind === 'kakan' ? meld.addedTileId !== meld.calledTileId && meld.tiles.some(item => item.id === meld.addedTileId)
          : meld.addedTileId === null);
        if (meld.sourcePlayerId !== null) requireCheckpoint(state.players.find(item => item.id === meld.sourcePlayerId)!.river.some(discard =>
          discard.tile.id === meld.calledTileId && discard.calledBy === player.id));
        physical.push(...meld.tiles);
      }
      for (const discard of player.river) {
        tile(discard.tile);
        requireCheckpoint(integer(discard.turnId, 1) && discard.turnId <= state.turnId
          && typeof discard.riichi === 'boolean' && typeof discard.tsumogiri === 'boolean' && playerRef(discard.calledBy));
        if (discard.calledBy === null) physical.push(discard.tile);
        else requireCheckpoint(state.players.find(item => item.id === discard.calledBy)!.melds.some(meld =>
          meld.sourcePlayerId === player.id && meld.calledTileId === discard.tile.id));
      }
      const base = 13 - 3 * player.melds.length;
      let extra = 0;
      if ('playerId' in phase && phase.playerId === player.id) extra = 1;
      if (phase.kind === 'WAITING_CALL_RESPONSE' && phase.window.trigger !== 'discard' && phase.window.sourcePlayerId === player.id) extra = 1;
      requireCheckpoint(phase.kind === 'ROUND_RESULT' ? [base, base + 1].includes(player.hand.length) : player.hand.length === base + extra);
    });
    requireCheckpoint(kans === wall.rinshanUsed && physical.length === expected.length
      && new Set(physical.map(item => item.id)).size === expected.length);
    physical.forEach(tile);
    requireCheckpoint(state.players.reduce((sum, player) => sum + player.points, state.riichiSticks * 1000)
      === state.rules.startingPoints * ids.length);
    requireCheckpoint(time(meta.lastNow) && meta.lastNow <= value.savedAt && typeof meta.firstCycleInterrupted === 'boolean'
      && playerRef(meta.pendingRiichi) && playerRef(meta.rinshanPlayerId)
      && (meta.pendingNuki === null || (ids.includes(meta.pendingNuki?.playerId)
        && integer(meta.pendingNuki.tileId) && meta.pendingNuki.tileId >= 120 && meta.pendingNuki.tileId <= 123))
      && Array.isArray(meta.forbiddenDiscardTypes)
      && meta.forbiddenDiscardTypes.every(type => integer(type) && type < 34)
      && Array.isArray(meta.committedActions) && new Set(meta.committedActions).size === meta.committedActions.length);
    for (const key of meta.committedActions) {
      const pair = JSON.parse(key);
      requireCheckpoint(Array.isArray(pair) && pair.length === 2 && ids.includes(pair[0]) && typeof pair[1] === 'string'
        && pair[1].length > 0 && pair[1].length <= 128 && JSON.stringify(pair) === key);
    }
    validateEvents(state.events, value.savedAt);
    requireCheckpoint(state.events.length >= 2 && state.events.some(event => event.type === 'ROUND_START')
      && state.events.at(-1)!.timestamp <= meta.lastNow
      && meta.firstCycleInterrupted === state.events.some(event => ['CHI', 'PON', 'KAN', 'NUKI'].includes(event.type)));
    const lastDraw = state.events.findLast(event => event.type === 'DRAW');
    requireCheckpoint(meta.rinshanPlayerId === (lastDraw?.data.source === 'rinshan' ? lastDraw.playerId : null));
    if (phase.kind === 'AFTER_DRAW' || phase.kind === 'WAITING_DISCARD') {
      requireCheckpoint(ids.includes(phase.playerId) && state.clock && state.clock.playerId === phase.playerId
        && time(state.clock.startedAt) && state.clock.startedAt <= meta.lastNow && state.clock.pausedAt === null
        && state.clock.fixedMs === state.rules.timer.fixedMs && state.clock.bankMs === state.players.find(item => item.id === phase.playerId)!.bankMs);
    } else requireCheckpoint(state.clock === null);
    if (phase.kind === 'WAITING_CALL_RESPONSE') {
      const window = phase.window;
      requireCheckpoint(window && typeof window.id === 'string' && ids.includes(window.sourcePlayerId)
        && ['discard', 'ankan', 'kakan', 'nuki'].includes(window.trigger) && time(window.deadline)
        && object(window.eligible) && object(window.responses));
      tile(window.tile);
      for (const [id, response] of Object.entries(window.responses)) requireCheckpoint(Object.hasOwn(window.eligible, id)
        && typeof response === 'string' && (response === 'pass' || window.eligible[id].some(option => option.id === response)));
      if (window.timing !== undefined) {
        const timing = window.timing;
        requireCheckpoint(object(timing) && time(timing.startedAt) && timing.startedAt <= meta.lastNow
          && timing.fixedMs === state.rules.timer.responseMs && object(timing.banks) && object(timing.respondedAt));
        const eligible = Object.keys(window.eligible);
        requireCheckpoint(Object.keys(timing.banks).length === eligible.length
          && Object.keys(timing.banks).every(id => eligible.includes(id))
          && Object.keys(timing.respondedAt).length === Object.keys(window.responses).length
          && Object.keys(timing.respondedAt).every(id => Object.hasOwn(window.responses, id)));
        for (const id of eligible) {
          const bank = timing.banks[id]; const at = timing.respondedAt[id];
          requireCheckpoint(ids.includes(id) && time(bank) && bank <= state.rules.timer.bankMs);
          if (Object.hasOwn(window.responses, id)) requireCheckpoint(time(at) && at >= timing.startedAt && at <= meta.lastNow
            && (window.responses[id] === 'pass' ? at <= timing.startedAt + timing.fixedMs + bank : at < timing.startedAt + timing.fixedMs + bank));
          const expectedBank = Object.hasOwn(window.responses, id) ? Math.max(0, bank - Math.max(0, at - timing.startedAt - timing.fixedMs)) : bank;
          requireCheckpoint(state.players.find(player => player.id === id)!.bankMs === expectedBank);
        }
        requireCheckpoint(window.deadline === timing.startedAt + timing.fixedMs + Math.max(0, ...Object.values(timing.banks)));
      }
      requireCheckpoint(Object.keys(window.eligible).some(id => !Object.hasOwn(window.responses, id)));
      requireCheckpoint(window.trigger === 'discard' ? meta.pendingKan === null && meta.pendingNuki === null
        : window.trigger === 'nuki' ? meta.pendingKan === null && meta.pendingNuki?.playerId === window.sourcePlayerId
          && meta.pendingNuki.tileId === window.tile.id && window.tile.type === 30
          : meta.pendingNuki === null && meta.pendingKan && meta.pendingKan.playerId === window.sourcePlayerId
            && meta.pendingKan.option.kind === window.trigger);
      if (meta.pendingRiichi) requireCheckpoint(window.trigger === 'discard' && meta.pendingRiichi === window.sourcePlayerId);
    } else requireCheckpoint(meta.pendingKan === null && meta.pendingNuki === null && meta.pendingRiichi === null);
    if (phase.kind === 'ROUND_RESULT') {
      requireCheckpoint(state.result && state.events.at(-1)?.type === 'ROUND_END'
        && JSON.stringify(state.events.at(-1)!.data.result) === JSON.stringify(state.result));
      if (state.result.reason === 'nagashi') {
        const winners = nagashiPlayerIds(state);
        const tenpai = state.players.filter(player => waits(player, state.rules.players).length > 0).map(player => player.id);
        const deltas = Object.fromEntries(ids.map(id => [id, 0]));
        for (const id of winners) {
          const settlement = nagashiSettlement(state, id);
          deltas[id] += settlement.winnerGain;
          for (const [payer, amount] of Object.entries(settlement.payments)) deltas[payer] -= amount;
        }
        requireCheckpoint(wall.live.length === 0 && winners.length > 0 && state.result.wins.length === 0
          && JSON.stringify(state.result.nagashiPlayerIds) === JSON.stringify(winners)
          && JSON.stringify(state.result.tenpaiPlayerIds) === JSON.stringify(tenpai)
          && ids.every(id => state.result!.deltas[id] === deltas[id]));
      }
    } else requireCheckpoint(!state.result);
    return value;
  } catch { throw new Error('INVALID_HOST_CHECKPOINT'); }
}

/** Pause downtime. Logical timestamps remain comparable even after a device clock/reboot reset. */
export function resumeClock(now: () => number, savedAt: number): () => number {
  const origin = now(); requireCheckpoint(time(origin));
  let last = origin;
  return () => {
    const current = now();
    if (!time(current) || current < last) throw new Error('Invalid Host clock');
    last = current;
    return savedAt + current - origin;
  };
}
