import assert from 'node:assert/strict';
import { MahjongRoundEngine } from '../lib/virtual-mahjong/round-engine';
import { defaultRules } from '../lib/virtual-mahjong/rules';
import { supplyWall, fixtureWall, conserved } from './helpers/local-virtual-fixtures';
import type { LocalSupplyRequest } from '../lib/virtual-mahjong/local-supply';

let count = 0;
function test(name: string, run: () => void) { run(); count++; console.log('PASS local supply: ' + name); }
function harness(location: Parameters<typeof supplyWall>[1] = 'live', players: 3 | 4 = 4, type = 31, enabled = true) {
  const rules = defaultRules(players);
  const ids = ['a', 'b', 'c', 'd'].slice(0, players);
  const access = { humanPlayerId: 'a', botIds: ids.slice(1) };
  const host = { now: () => 0, ...(enabled ? { localSupply: access } : {}),
    makeWall: () => supplyWall(rules, location, type) };
  const engine = new MahjongRoundEngine({ gameId: 'supply', roundId: 'round', rules, dealerSeat: 1,
    players: ids.map(id => ({ id, name: id })) }, host);
  const request = (extra: Partial<LocalSupplyRequest> = {}): LocalSupplyRequest => ({ gameId: 'supply', roundId: 'round',
    turnId: engine.hostSnapshot().turnId, actionId: 'supply-once', tileType: type, keepTypes: [], ...extra });
  return { engine, request, host };
}

for (const players of [3, 4] as const) for (const source of ['own', 'live', 'other', 'dead'] as const) test(players + ' players supply from ' + source, () => {
  const h = harness(source, players);
  const before = h.engine.hostSnapshot();
  assert.ok(h.engine.localSupplyTypes().includes(31));
  assert.equal(h.engine.localSupplyDiscard('b', h.request()).ok, true);
  const after = h.engine.hostSnapshot();
  assert.equal(after.players[1].river.at(-1)!.tile.type, 31);
  assert.deepEqual(after.players[0].hand, before.players[0].hand);
  assert.deepEqual(after.wall!.dead[4], before.wall!.dead[4]);
  assert.equal(after.wall!.dead.length, 14);
  assert.equal(after.wall!.rinshanUsed, 0);
  conserved(after);
  const restored = MahjongRoundEngine.restoreCheckpoint(h.engine.exportCheckpoint(), h.host);
  assert.deepEqual(restored.hostSnapshot(), after);
  assert.throws(() => MahjongRoundEngine.restoreCheckpoint(h.engine.exportCheckpoint(), { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
  const visible = h.engine.view({ role: 'player', playerId: 'a' });
  assert.ok(visible.players.slice(1).every(player => !player.hand));
  assert.equal(JSON.stringify(visible).includes('localSupply'), false);
});
test('red five is supplied intact and preferred over ordinary copies', () => {
  const h = harness('other', 4, 13);
  assert.equal(h.engine.localSupplyDiscard('b', h.request()).ok, true);
  const discarded = h.engine.hostSnapshot().players[1].river.at(-1)!.tile;
  assert.equal(discarded.type, 13); assert.equal(discarded.red, true); assert.equal(discarded.id, 52);
  conserved(h.engine.hostSnapshot());
});
test('public indicator and human hand never become supply sources', () => {
  const h = harness('unavailable');
  const before = h.engine.hostSnapshot();
  assert.equal(h.engine.localSupplyTypes().includes(31), false);
  assert.deepEqual(h.engine.localSupplyDiscard('b', h.request()), { ok: false, error: 'SUPPLY_TILE_UNAVAILABLE' });
  assert.deepEqual(h.engine.hostSnapshot(), before);
});
test('ordinary engine and player/network dispatch cannot invoke supply', () => {
  const h = harness('live', 4, 31, false);
  const before = h.engine.hostSnapshot();
  assert.equal(h.engine.localSupplyDiscard('b', h.request()).ok, false);
  assert.equal(h.engine.dispatch('b', { ...h.request(), kind: 'LOCAL_SUPPLY', localSupply: h.host }).ok, false);
  assert.throws(() => h.engine.localSupplyTypes(), /LOCAL_SUPPLY_DISABLED/);
  assert.deepEqual(h.engine.hostSnapshot(), before);
});
test('human actor, stale request, invalid and sanma-excluded types roll back fully', () => {
  const h = harness('live', 3);
  const before = h.engine.hostSnapshot();
  for (const [actor, request] of [['a', h.request()], ['b', h.request({ turnId: 999 })],
    ['b', h.request({ tileType: 2 })], ['b', h.request({ keepTypes: [NaN] })]] as const) {
    assert.equal(h.engine.localSupplyDiscard(actor, request).ok, false);
    assert.deepEqual(h.engine.hostSnapshot(), before);
  }
});
test('all held faces can be kept while an unheld live-wall face is discarded', () => {
  const h = harness('live');
  const held = [...new Set(h.engine.hostSnapshot().players[1].hand.map(tile => tile.type))];
  assert.equal(h.engine.localSupplyDiscard('b', h.request({ tileType: undefined, keepTypes: held })).ok, true);
  const after = h.engine.hostSnapshot();
  assert.ok(!held.includes(after.players[1].river.at(-1)!.tile.type)); conserved(after);
});
test('impossible keep request does not mutate state; repeated supply cannot commit twice', () => {
  const h = harness();
  const before = h.engine.hostSnapshot();
  assert.equal(h.engine.localSupplyDiscard('b', h.request({ tileType: undefined, keepTypes: h.engine.localSupplyTypes() })).ok, false);
  assert.deepEqual(h.engine.hostSnapshot(), before);
  const request = h.request();
  assert.equal(h.engine.localSupplyDiscard('b', request).ok, true);
  const after = h.engine.hostSnapshot();
  assert.equal(h.engine.localSupplyDiscard('b', request).ok, false);
  assert.deepEqual(h.engine.hostSnapshot(), after);
});
for (const action of ['kan', 'nuki'] as const) test('dead-wall supply preserves subsequent human ' + action, () => {
  const rules = defaultRules(action === 'nuki' ? 3 : 4);
  rules.redFives = false;
  const ids = ['a', 'b', 'c', 'd'].slice(0, rules.players);
  const engine = new MahjongRoundEngine({ gameId: 'replacement', roundId: action, rules, dealerSeat: 1,
    players: ids.map(id => ({ id, name: id })) }, { now: () => 0,
    localSupply: { humanPlayerId: 'a', botIds: ids.slice(1) }, makeWall: () => fixtureWall(rules,
      [action === 'kan' ? '1111m123p789s123z' : '19m123p789s12344z'], '', 1) });
  let sequence = 0;
  const envelope = () => ({ gameId: 'replacement', roundId: action, turnId: engine.hostSnapshot().turnId,
    actionId: 'replacement:' + (++sequence) });
  assert.equal(engine.localSupplyDiscard('b', { ...envelope(), tileType: 33, keepTypes: [] }).ok, true);
  const journal = engine.hostSnapshot().events.find(event => event.type === 'DISCARD')!.data.localSupply as { source: string };
  assert.equal(journal.source, 'dead');
  const pass = () => {
    for (const id of ids) if (engine.view({ role: 'player', playerId: id }).availableActions.canPass) {
      assert.equal(engine.dispatch(id, { ...envelope(), kind: 'RESPOND', optionId: 'pass' }).ok, true);
      return;
    }
    assert.fail('Expected a responder');
  };
  for (let step = 0; step < 30; step++) {
    const state = engine.hostSnapshot();
    if (state.phase.kind === 'WAITING_CALL_RESPONSE') pass();
    else if ('playerId' in state.phase && state.phase.playerId === 'a') break;
    else {
      const actor = 'playerId' in state.phase ? state.phase.playerId : '';
      const tileId = state.actions[actor].discardableTileIds[0];
      assert.equal(engine.dispatch(actor, { ...envelope(), kind: 'DISCARD', tileId }).ok, true);
    }
  }
  const before = engine.hostSnapshot();
  const available = engine.view({ role: 'player', playerId: 'a' }).availableActions;
  const response = action === 'kan'
    ? engine.dispatch('a', { ...envelope(), kind: 'KAN', optionId: available.selfKanOptions.find(option => option.kind === 'ankan')!.id })
    : engine.dispatch('a', { ...envelope(), kind: 'NUKI', tileId: available.nukiTileIds[0] });
  assert.equal(response.ok, true);
  while (engine.hostSnapshot().phase.kind === 'WAITING_CALL_RESPONSE') pass();
  const after = engine.hostSnapshot();
  assert.equal(after.wall!.dead.length, 14);
  assert.equal(after.wall!.live.length, before.wall!.live.length - 1);
  assert.equal(after.wall!.rinshanUsed, action === 'kan' ? 1 : 0);
  assert.equal(after.wall!.indicatorsRevealed, action === 'kan' ? 2 : 1);
  assert.deepEqual(after.wall!.dead[4], before.wall!.dead[4]);
  assert.equal(after.players[0].hand.length, action === 'kan' ? 11 : 14);
  conserved(after);
});
console.log(count + ' local supply groups passed');
