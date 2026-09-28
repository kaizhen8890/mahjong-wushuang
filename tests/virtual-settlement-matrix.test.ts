import assert from 'node:assert/strict';
import { calculateSettlement, createPlayers, DEFAULT_SETTINGS, type SettlementInput } from '../lib/mahjong';

function settle(overrides: Partial<SettlementInput> = {}, count: 3 | 4 = 4) {
  const input: SettlementInput = {
    winnerId: 'player-2', loserId: 'player-3', winType: 'ron', han: 1, fu: 30, yakuman: 0,
    honba: 0, riichiSticks: 0, dealer: false, playerCount: count,
    kiriageMangan: false, kazoeYakuman: true, sanmaTsumoLoss: true,
    ...overrides,
  };
  return calculateSettlement(input, createPlayers({ ...DEFAULT_SETTINGS, playerCount: count }));
}

const ron = [
  { han: 1, fu: 30, points: 1000 }, { han: 2, fu: 40, points: 2600 },
  { han: 4, fu: 30, points: 7700 }, { han: 4, fu: 40, points: 8000 },
  { han: 6, fu: 30, points: 12000 }, { han: 8, fu: 30, points: 16000 },
  { han: 11, fu: 30, points: 24000 }, { han: 13, fu: 30, points: 32000 },
] as const;
for (const { han, fu, points } of ron) {
  const result = settle({ han, fu });
  assert.equal(result.payments['player-3'], points, `${han}番${fu}符`);
  assert.equal(result.winnerGain, points);
}
assert.equal(settle({ han: 4, fu: 30, kiriageMangan: true }).winnerGain, 8000);
assert.equal(settle({ han: 13, kazoeYakuman: false }).winnerGain, 24000);
assert.equal(settle({ yakuman: 2, han: 0 }).winnerGain, 64000);
assert.equal(settle({ yakuman: 2, han: 0, winnerId: 'player-1', dealer: true }).winnerGain, 96000);
assert.deepEqual(settle({ honba: 2, riichiSticks: 3 }).payments, { 'player-3': 1600 });
assert.equal(settle({ honba: 2, riichiSticks: 3 }).winnerGain, 4600);

assert.deepEqual(settle({ winType: 'tsumo' }).payments,
  { 'player-1': 500, 'player-3': 300, 'player-4': 300 });
assert.deepEqual(settle({ winType: 'tsumo', winnerId: 'player-1', dealer: true }).payments,
  { 'player-2': 500, 'player-3': 500, 'player-4': 500 });
assert.deepEqual(settle({ winType: 'tsumo', honba: 2, riichiSticks: 3 }).payments,
  { 'player-1': 700, 'player-3': 500, 'player-4': 500 });
assert.equal(settle({ winType: 'tsumo', honba: 2, riichiSticks: 3 }).winnerGain, 4700);

assert.deepEqual(settle({ winType: 'tsumo' }, 3).payments,
  { 'player-1': 500, 'player-3': 300 });
assert.deepEqual(settle({ winType: 'tsumo', sanmaTsumoLoss: false }, 3).payments,
  { 'player-1': 700, 'player-3': 400 });
assert.deepEqual(settle({ winType: 'tsumo', winnerId: 'player-1', dealer: true }, 3).payments,
  { 'player-2': 500, 'player-3': 500 });
assert.deepEqual(settle({ winType: 'tsumo', winnerId: 'player-1', dealer: true, sanmaTsumoLoss: false }, 3).payments,
  { 'player-2': 800, 'player-3': 700 });
console.log('PASS settlement matrix: fu/han limits, dealer, honba, deposits, ron/tsumo and three-player payments');
