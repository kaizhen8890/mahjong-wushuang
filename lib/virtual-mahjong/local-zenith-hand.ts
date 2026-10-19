import type { Rules } from './model';
import { countsOf, createTiles, tileTypes, type Tile } from './tiles';
import { dealHands, type RandomUint32, type Wall } from './wall';

export const ZENITH_TEMPLATES = ['daisuushi', 'kokushi', 'chuuren', 'shousuushi', 'ryuuiisou', 'suuankou', 'daisangen'] as const;
export type ZenithTemplate = typeof ZENITH_TEMPLATES[number];
type TileRules = Pick<Rules, 'players' | 'redFives'>;
const secureWord: RandomUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Rejection sampling preserves exact 1/7 and 12/100 probabilities. */
export function zenithRandomBelow(bound: number, random: RandomUint32): number {
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > 0x100000000) throw new Error('INVALID_ZENITH_BOUND');
  const limit = Math.floor(0x100000000 / bound) * bound;
  for (;;) {
    const word = random();
    if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) throw new Error('INVALID_ZENITH_RANDOM');
    if (word < limit) return word % bound;
  }
}

function take<T>(pool: T[], random: RandomUint32): T {
  if (!pool.length) throw new Error('EMPTY_ZENITH_POOL');
  return pool.splice(zenithRandomBelow(pool.length, random), 1)[0];
}
function choose<T>(pool: readonly T[], random: RandomUint32): T {
  if (!pool.length) throw new Error('EMPTY_ZENITH_POOL');
  return pool[zenithRandomBelow(pool.length, random)];
}
function shuffle<T>(pool: T[], random: RandomUint32): T[] {
  for (let i = pool.length - 1; i > 0; i--) {
    const j = zenithRandomBelow(i + 1, random);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
const repeat = (type: number, n: number) => Array<number>(n).fill(type);
const isWind = (type: number) => type >= 27 && type <= 30;
function randomMeld(allowed: readonly number[], random: RandomUint32): number[] {
  const melds = allowed.map(type => repeat(type, 3));
  for (const type of allowed) if (type < 27 && type % 9 <= 6 && allowed.includes(type + 1) && allowed.includes(type + 2)) {
    melds.push([type, type + 1, type + 2]);
  }
  return [...choose(melds, random)];
}

/** Direct constructions only: no hand-strength search or retries that alter category weights. */
function templateTypes(template: ZenithTemplate, players: 3 | 4, random: RandomUint32): number[] {
  const allowed = tileTypes(players), winds = [27, 28, 29, 30];
  switch (template) {
    case 'daisuushi': return [...winds.flatMap(type => repeat(type, 3)), ...repeat(choose(allowed.filter(type => !isWind(type)), random), 2)];
    case 'kokushi': {
      const base = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
      return [...base, choose(base, random)];
    }
    case 'chuuren': {
      const suit = choose(players === 3 ? [9, 18] : [0, 9, 18], random);
      return [...[0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8].map(rank => suit + rank), suit + zenithRandomBelow(9, random)];
    }
    case 'shousuushi': {
      const pair = choose(winds, random);
      return [...winds.filter(type => type !== pair).flatMap(type => repeat(type, 3)), ...repeat(pair, 2),
        ...randomMeld(allowed.filter(type => !isWind(type)), random)];
    }
    case 'ryuuiisou': return [...choose([
      [...repeat(19, 3), ...repeat(20, 3), ...repeat(21, 3), ...repeat(23, 3), 32, 32],
      ...[23, 25, 32].map(triplet => [...repeat(19, 3), ...repeat(20, 3), ...repeat(21, 3),
        ...repeat(triplet, 3), ...repeat(triplet === 32 ? 25 : 32, 2)]),
      [19, 20, 21, 19, 20, 21, ...repeat(23, 3), ...repeat(25, 3), 32, 32],
    ], random)];
    case 'suuankou': {
      const pool = [...allowed];
      const groups = Array.from({ length: 4 }, () => take(pool, random));
      return [...groups.flatMap(type => repeat(type, 3)), ...repeat(take(pool, random), 2)];
    }
    case 'daisangen': {
      const base = [...[31, 32, 33].flatMap(type => repeat(type, 3)), ...randomMeld(allowed.filter(type => type < 31), random)];
      const counts = countsOf(base.map(type => ({ type })));
      return [...base, ...repeat(choose(allowed.filter(type => counts[type] <= 2), random), 2)];
    }
  }
}

/** Host-only pure step. The returned stock includes every displaced physical tile. */
export function perturbZenithHand(hand: readonly Tile[], stock: readonly Tile[], random: RandomUint32 = secureWord) {
  if (hand.length !== 13 && hand.length !== 14) throw new Error('INVALID_ZENITH_HAND');
  const result = [...hand], pool = [...stock];
  // Roll exactly once per original position before drawing replacements.
  const replacedIndices = hand.flatMap((_, index) => zenithRandomBelow(100, random) < 12 ? [index] : []);
  for (const index of replacedIndices) {
    pool.push(result[index]);
    result[index] = take(pool, random);
  }
  return { hand: result, stock: pool, replacedIndices };
}

/** Internal generation details are never passed to React, projections or LAN messages. */
export function generateZenithOpening(rules: TileRules, dealer: boolean, random: RandomUint32 = secureWord) {
  const template = choose(ZENITH_TEMPLATES, random);
  const types = templateTypes(template, rules.players, random);
  const pool = createTiles(rules.players, rules.redFives);
  const hand = types.map(type => {
    const candidates = pool.filter(tile => tile.type === type);
    const tile = choose(candidates, random);
    pool.splice(pool.findIndex(item => item.id === tile.id), 1);
    return tile;
  });
  const removedIndex = dealer ? null : zenithRandomBelow(14, random);
  if (removedIndex !== null) pool.push(hand.splice(removedIndex, 1)[0]);
  return { template, templateTypes: types, originalHand: [...hand], removedIndex, ...perturbZenithHand(hand, pool, random) };
}

/** Arrange only an unpublished wall. Existing dealHands still performs the actual deal. */
export function prepareZenithWall(base: Wall, rules: TileRules, humanSeat: number, dealerSeat: number,
  random: RandomUint32 = secureWord): Wall {
  if (![humanSeat, dealerSeat].every(seat => Number.isInteger(seat) && seat >= 0 && seat < rules.players)) {
    throw new Error('INVALID_ZENITH_SEAT');
  }
  const wall = structuredClone(base), expected = createTiles(rules.players, rules.redFives);
  const expectedById = new Map(expected.map(tile => [tile.id, tile]));
  const all = [...wall.live, ...wall.dead];
  if (wall.dead.length !== 14 || wall.rinshanUsed !== 0 || wall.indicatorsRevealed !== 1 || all.length !== expected.length
    || new Set(all.map(tile => tile.id)).size !== expected.length || all.some(tile => {
      const original = expectedById.get(tile.id);
      return !original || original.type !== tile.type || original.red !== tile.red;
    })) throw new Error('INVALID_ZENITH_WALL');
  const preview = dealHands({ ...wall, live: [...wall.live], dead: [...wall.dead] }, rules.players, dealerSeat);
  const destinations = preview[humanSeat].map(tile => wall.live.findIndex(item => item.id === tile.id));
  const opening = generateZenithOpening(rules, humanSeat === dealerSeat, random);
  const target = shuffle([...opening.hand], random);
  const positions = new Map<number, { tiles: Tile[]; index: number }>();
  for (const tiles of [wall.live, wall.dead]) tiles.forEach((tile, index) => positions.set(tile.id, { tiles, index }));
  for (const [i, id] of target.map(tile => tile.id).entries()) {
    const source = positions.get(id)!;
    const index = destinations[i], displaced = wall.live[index];
    wall.live[index] = source.tiles[source.index];
    source.tiles[source.index] = displaced;
    positions.set(id, { tiles: wall.live, index });
    positions.set(displaced.id, source);
  }
  return wall;
}
