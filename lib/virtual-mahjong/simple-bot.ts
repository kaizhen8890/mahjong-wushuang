import type { PlayerVisibleGameState } from './projection';
import type { RoundIntent } from './round-engine';
import { countsOf, doraType, tileTypes } from './tiles';
import { remainingTileCounts } from './tenpai-guide';

// Minimum draws needed to reach a real four-copy-limited complete hand.
// Each table has entries for 0..4 melds, with/without the pair.
const suitCache = new Map<string, number[]>();
function suitCosts(counts: readonly number[]): number[] {
  const key = counts.join('');
  const cached = suitCache.get(key);
  if (cached) return cached;
  let states = new Map<string, number>([['0,0,0,0', 0]]);
  for (let rank = 0; rank < 9; rank++) {
    const next = new Map<string, number>();
    for (const [state, cost] of states) {
      const [a, b, groups, pair] = state.split(',').map(Number);
      for (let sequences = 0; sequences <= (rank < 7 ? 4 - groups : 0); sequences++) {
        for (let triplet = 0; triplet <= 1 && groups + sequences + triplet <= 4; triplet++) {
          for (let addPair = 0; addPair <= 1 - pair; addPair++) {
            const target = a + b + sequences + triplet * 3 + addPair * 2;
            if (target > 4) continue;
            const id = [b, sequences, groups + sequences + triplet, pair + addPair].join(',');
            const value = cost + Math.max(0, target - counts[rank]);
            if (value < (next.get(id) ?? Infinity)) next.set(id, value);
          }
        }
      }
    }
    states = next;
  }
  const result = Array<number>(10).fill(Infinity);
  for (const [state, cost] of states) {
    const [a, b, groups, pair] = state.split(',').map(Number);
    if (!a && !b) result[groups * 2 + pair] = Math.min(result[groups * 2 + pair], cost);
  }
  if (suitCache.size > 4096) suitCache.clear();
  suitCache.set(key, result);
  return result;
}
function combine(a: readonly number[], b: readonly number[]): number[] {
  const result = Array<number>(10).fill(Infinity);
  for (let i = 0; i < 10; i++) if (Number.isFinite(a[i])) {
    for (let j = 0; j < 10; j++) if (Number.isFinite(b[j])) {
      const groups = Math.floor(i / 2) + Math.floor(j / 2), pairs = i % 2 + j % 2;
      if (groups <= 4 && pairs <= 1) result[groups * 2 + pairs] = Math.min(result[groups * 2 + pairs], a[i] + b[j]);
    }
  }
  return result;
}
export function botShanten(counts: readonly number[], players: 3 | 4, melds = 0): number {
  if (counts.length !== 34 || counts.some(n => !Number.isInteger(n) || n < 0 || n > 4)
    || !Number.isInteger(melds) || melds < 0 || melds > 4
    || counts.reduce((a, b) => a + b, 0) > 14 - 3 * melds) throw new Error('INVALID_BOT_HAND');
  if (players === 3 && counts.some((n, i) => n > 0 && i > 0 && i < 8)) throw new Error('SANMA_EXCLUDED_TILE');
  let costs = Array<number>(10).fill(Infinity); costs[melds * 2] = 0;
  for (const suit of players === 3 ? [1, 2] : [0, 1, 2]) costs = combine(costs, suitCosts(counts.slice(suit * 9, suit * 9 + 9)));
  const honors = players === 3 ? [counts[0], counts[8], ...counts.slice(27)] : counts.slice(27);
  for (const count of honors) {
    const choices = Array<number>(10).fill(Infinity);
    choices[0] = 0; choices[1] = Math.max(0, 2 - count); choices[2] = Math.max(0, 3 - count);
    costs = combine(costs, choices);
  }
  let best = costs[9] - 1;
  if (!melds) {
    const pairs = counts.filter(n => n >= 2).length, unique = counts.filter(n => n > 0).length;
    const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    best = Math.min(best, 6 - pairs + Math.max(0, 7 - unique),
      13 - terminals.filter(i => counts[i] > 0).length - Number(terminals.some(i => counts[i] >= 2)));
  }
  return best;
}
export function simpleBotIntent(view: PlayerVisibleGameState): RoundIntent | null {
  const actions = view.availableActions;
  if (actions.canTsumo) return { kind: 'TSUMO' };
  const ron = actions.callOptions.find(option => option.kind === 'ron');
  if (ron) return { kind: 'RESPOND', optionId: ron.id };
  if (actions.canPass) return { kind: 'RESPOND', optionId: 'pass' };
  const own = view.players.find(player => player.id === view.viewerId);
  if (!own?.hand || !actions.discardableTileIds.length) return null;
  const counts = countsOf(own.hand);
  const unseen = remainingTileCounts(view);
  const allowed = tileTypes(view.rules.players);
  const dora = view.doraIndicators.map(tile => doraType(tile.type, view.rules.players));
  const distances = new Map<string, number>();
  const distance = (input: readonly number[]) => {
    const key = input.join('');
    if (!distances.has(key)) distances.set(key, botShanten(input, view.rules.players, own.melds.length));
    return distances.get(key)!;
  };
  // Evaluate each face once. Keeping a red five wins an otherwise equal comparison.
  const choices = actions.discardableTileIds.map(id => own.hand!.find(tile => tile.id === id)!);
  const byType = new Map<number, { distance: number; outs: number }>();
  let best: { id: number; distance: number; outs: number; value: number } | null = null;
  for (const tile of choices) {
    let score = byType.get(tile.type);
    if (!score) {
      counts[tile.type]--;
      const base = distance(counts);
      let outs = 0;
      // Wide hands need only a simple distance comparison. Full ukeire matters near tenpai.
      if (base <= 2) for (const type of allowed) {
        if (!unseen[type] || counts[type] >= 4) continue;
        counts[type]++;
        if (distance(counts) < base) outs += unseen[type];
        counts[type]--;
      }
      score = { distance: base, outs }; byType.set(tile.type, score);
      counts[tile.type]++;
    }
    const value = Number(tile.red) * 4 + dora.filter(type => type === tile.type).length * 3
      + Number(tile.type < 27 && tile.type % 9 > 0 && tile.type % 9 < 8);
    if (!best || score.distance < best.distance || (score.distance === best.distance && score.outs > best.outs)
      || (score.distance === best.distance && score.outs === best.outs && value < best.value)) {
      best = { id: tile.id, ...score, value };
    }
  }
  if (!best) return null;
  return { kind: actions.riichiDiscardTileIds.includes(best.id) ? 'RIICHI' : 'DISCARD', tileId: best.id };
}

