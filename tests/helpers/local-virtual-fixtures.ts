import assert from 'node:assert/strict';
import { createTiles, tileCode, type Tile } from '../../lib/virtual-mahjong/tiles';
import type { Rules, AuthoritativeGameState } from '../../lib/virtual-mahjong/model';
import type { Wall } from '../../lib/virtual-mahjong/wall';

export function fixtureWall(rules: Rules, requested: string[] = [], draws = '', dealer = 0): Wall {
  const pool = createTiles(rules.players, rules.redFives);
  const codes = (text: string) => [...text.matchAll(/([0-9]+)([mpsz])/g)].flatMap(match => match[1].split('').map(n => n + match[2]));
  const take = (code: string) => {
    const at = pool.findIndex(tile => tileCode(tile) === code);
    assert.ok(at >= 0, 'Fixture exhausted ' + code);
    return pool.splice(at, 1)[0];
  };
  const hands = Array.from({ length: rules.players }, (_, i) => codes(requested[i] ?? '').map(take));
  const next = codes(draws).map(take);
  hands.forEach((hand, i) => {
    assert.ok(hand.length <= (i === dealer ? 14 : 13));
    while (hand.length < (i === dealer ? 14 : 13)) hand.push(pool.shift()!);
  });
  return packWall(hands, [...next, ...pool.slice(0, -14)], pool.slice(-14), dealer);
}

export function supplyWall(rules: Rules, location: 'own' | 'live' | 'other' | 'dead' | 'unavailable', type = 31): Wall {
  const all = createTiles(rules.players, rules.redFives);
  const target = all.filter(tile => tile.type === type);
  const pool = all.filter(tile => tile.type !== type);
  const hands: Tile[][] = Array.from({ length: rules.players }, () => []);
  if (location === 'own') hands[1].push(...target);
  if (location === 'other') hands[2].push(...target);
  if (location === 'unavailable') hands[0].push(...target.slice(0, 3));
  hands.forEach((hand, i) => { while (hand.length < (i === 1 ? 14 : 13)) hand.push(pool.shift()!); });
  const dead = pool.splice(-14);
  if (location === 'dead') {
    pool.push(...dead.splice(0, 4, ...target));
  } else if (location === 'live') pool.unshift(...target);
  else if (location === 'unavailable') { pool.push(dead[4]); dead[4] = target[3]; }
  return packWall(hands, pool, dead, 1);
}

function packWall(hands: Tile[][], rest: Tile[], dead: Tile[], dealer: number): Wall {
  const deal: Tile[] = [];
  for (let packet = 0; packet < 3; packet++) for (let relative = 0; relative < hands.length; relative++) {
    deal.push(...hands[(dealer + relative) % hands.length].slice(packet * 4, packet * 4 + 4));
  }
  for (let relative = 0; relative < hands.length; relative++) deal.push(hands[(dealer + relative) % hands.length][12]);
  deal.push(hands[dealer][13]);
  return { live: [...deal, ...rest], dead, rinshanUsed: 0, indicatorsRevealed: 1 };
}

export function conserved(state: AuthoritativeGameState): void {
  const physical = [...state.wall!.live, ...state.wall!.dead,
    ...state.players.flatMap(player => [...player.hand, ...player.nuki, ...player.melds.flatMap(meld => meld.tiles),
      ...player.river.filter(discard => discard.calledBy === null).map(discard => discard.tile)])];
  const expected = createTiles(state.rules.players, state.rules.redFives);
  assert.deepEqual([...physical].sort((a, b) => a.id - b.id), expected);
  assert.equal(new Set(physical.map(tile => tile.id)).size, expected.length);
  assert.equal(state.players.reduce((sum, player) => sum + player.points, state.riichiSticks * 1000),
    state.rules.startingPoints * state.rules.players);
}
