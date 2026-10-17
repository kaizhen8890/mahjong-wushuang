import assert from 'node:assert/strict';
import { calculateSettlement, calculateNagashiDraw, createGameState, DEFAULT_SETTINGS, type GameState, type SettlementInput } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import type { RemoteWinDraft } from '../lib/lan-protocol';

const fresh = () => createGameState({ ...DEFAULT_SETTINGS, teamsEnabled: true });
function input(game: GameState, index = 0, overrides: Partial<SettlementInput> = {}): SettlementInput {
  const winner = game.players[index];
  return { winnerId: winner.id, winType: 'tsumo', han: 5, fu: 30, yakuman: 0,
    honba: game.honba, riichiSticks: game.riichiSticks, dealer: winner.wind === '东',
    playerCount: game.settings.playerCount, kiriageMangan: false, kazoeYakuman: true,
    sanmaTsumoLoss: game.settings.sanmaTsumoLoss, teamsEnabled: game.settings.teamsEnabled, ...overrides };
}
const game = fresh();
assert.deepEqual(calculateSettlement(input(game), game.players).payments, { 'player-2': 4000, 'player-4': 4000 }, 'dealer tsumo must not charge the west teammate');
assert.equal(calculateSettlement(input(game), game.players).winnerGain, 8000);
assert.deepEqual(calculateSettlement(input(game, 1), game.players).payments, { 'player-1': 4000, 'player-3': 2000 }, 'non-dealer tsumo preserves each opponent share');
const bonus = calculateSettlement(input(game, 0, { honba: 2, riichiSticks: 3, extraPoints: 2001 }), game.players);
assert.deepEqual(bonus.payments, { 'player-2': 5201, 'player-4': 5200 });
assert.equal(bonus.winnerGain, 13401);
assert(!bonus.summary.includes(game.players[2].name));
assert.deepEqual(calculateSettlement(input(game, 0, { teamsEnabled: false }), game.players).payments,
  { 'player-2': 4000, 'player-3': 4000, 'player-4': 4000 }, 'turning teams off must ignore saved team labels');
assert.deepEqual(calculateSettlement(input(game, 0, { teamsEnabled: undefined }), game.players).payments,
  { 'player-2': 4000, 'player-3': 4000, 'player-4': 4000 }, 'shared virtual scorer defaults to ordinary payments');
assert.deepEqual(calculateSettlement(input(game, 0, { winType: 'ron', loserId: 'player-3', extraPoints: 2000 }), game.players).payments,
  { 'player-3': 14000 }, 'this rule must not silently change ron');

let cases = 0;
for (const playerCount of [3, 4] as const) for (const oppositeTeams of [false, true]) for (const sanmaTsumoLoss of [false, true]) {
  const state = createGameState({ ...DEFAULT_SETTINGS, playerCount, oppositeTeams, sanmaTsumoLoss, teamsEnabled: true });
  for (let seat = 0; seat < playerCount; seat++) {
    const ordinary = calculateSettlement(input(state, seat, { han: 1, honba: 2, teamsEnabled: false }), state.players);
    const actual = calculateSettlement(input(state, seat, { han: 1, honba: 2 }), state.players);
    const expected = Object.fromEntries(Object.entries(ordinary.payments).filter(([id]) => state.players.find(p => p.id === id)!.team !== state.players[seat].team));
    assert.deepEqual(actual.payments, expected);
    assert.equal(actual.winnerGain, Object.values(expected).reduce((sum, amount) => sum + amount, 0));
    cases++;
  }
}
const custom = fresh(); custom.players.forEach((p, i) => { p.team = i < 2 ? '自订甲' : '自订乙'; });
assert.deepEqual(calculateSettlement(input(custom, 1), custom.players).payments, { 'player-3': 2000, 'player-4': 2000 }, 'use actual teams, not opposite seats or dealer position');
custom.players[2].active = false;
assert.deepEqual(calculateSettlement(input(custom, 1, { extraPoints: 2000 }), custom.players).payments, { 'player-4': 4000 }, 'retired enemy and active teammate both exempt');
custom.players[3].active = false;
assert.deepEqual(calculateSettlement(input(custom, 1, { extraPoints: 2000 }), custom.players).payments, {}, 'no eligible opponent must not fall back to teammate');
const sanma = createGameState({ ...DEFAULT_SETTINGS, playerCount: 3, teamsEnabled: true, sanmaTsumoLoss: false });
assert.deepEqual(calculateSettlement(input(sanma, 0, { han: 1 }), sanma.players).payments, { 'player-2': 800 }, 'preserve the normal sanma compensation without reallocating teammate share');

const draft: RemoteWinDraft = { winType: 'tsumo', tiles: [], closed: true, fu: 30,
  selectedYakuIds: ['riichi'], yakuOverrides: {}, dora: 0, uraDora: 0, akaDora: 0, flowerDora: 0, bonusHan: 0, extraPoints: 0 };
for (const teamsEnabled of [false, true]) for (const bloodBattle of [false, true]) {
  const state = createGameState({ ...DEFAULT_SETTINGS, teamsEnabled, bloodBattle });
  const original = JSON.stringify(state);
  const preview = applyRemoteControllerCommand(state, [], 'player-1', { kind: 'win.preview', draft });
  assert.equal(preview.changed, false); assert.equal(preview.nextGame, state);
  const outcome = applyRemoteControllerCommand(state, [], 'player-1', { kind: 'win.commit', draft });
  assert.deepEqual(preview.preview, outcome.preview);
  assert.equal(JSON.stringify(state), original, 'Host must not mutate input state');
  assert.equal(outcome.nextGame.players[2].score, teamsEnabled ? 25000 : 24500);
  assert.equal(outcome.nextGame.players[1].score, 24500);
  assert.equal(outcome.nextGame.players[3].score, 24500);
  assert.equal(outcome.nextGame.players[0].score, teamsEnabled ? 26000 : 26500);
  assert.equal(outcome.nextGame.players.reduce((sum, p) => sum + p.score, 0), 100000);
  const event = outcome.nextGame.presentations![0];
  assert.equal(event.scores.find(s => s.playerId === 'player-3')!.after, teamsEnabled ? 25000 : 24500);
  assert.equal(outcome.nextGame.history.find(e => e.title === '和牌结算')!.deltas!['player-3'], teamsEnabled ? 0 : -500);
  const snapshot = createControllerSnapshot(outcome.nextGame, [], { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: 'player-3' });
  assert.equal(snapshot.self.score, teamsEnabled ? 25000 : 24500);
  assert.equal(snapshot.presentations![0].scores.length, 1, 'teammate score broadcast remains seat-private');
  if (teamsEnabled && bloodBattle) {
    const second = applyRemoteControllerCommand(outcome.nextGame, [], 'player-3', { kind: 'win.commit', draft }).nextGame;
    assert.deepEqual(second.players.map(p => p.score), [26000, 24200, 25600, 24200], 'consecutive teammate wins in blood battle');
  }
}
assert.deepEqual(Object.values(calculateNagashiDraw(game, ['player-1'])), [8000, -4000, 0, -4000]);
assert.deepEqual(Object.values(calculateNagashiDraw(game, ['player-1', 'player-3'])), [8000, -6000, 4000, -6000]);
console.log(`PASS team tsumo: dealer/non-dealer, ${cases} payment variants, honba/deposits/extra, custom/disabled teams, sanma, retirement, Host preview/commit/history/private presentation, blood battle and nagashi`);
