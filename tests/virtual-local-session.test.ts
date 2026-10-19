import assert from 'node:assert/strict';
import { LocalGameClock } from '../lib/virtual-mahjong/local-clock';
import { LocalVirtualSession } from '../lib/virtual-mahjong/local-session';
import { DEFAULT_LOCAL_SETTINGS, changeLocalPlayers, localRules, readLocalSettings } from '../lib/virtual-mahjong/local-settings';
import { tileTypes } from '../lib/virtual-mahjong/tiles';
import { simpleBotIntent } from '../lib/virtual-mahjong/simple-bot';
import { fixtureWall, conserved } from './helpers/local-virtual-fixtures';

let groups = 0;
function test(name: string, run: () => void) { run(); groups++; console.log('PASS local session: ' + name); }
function harness(players: 3 | 4 = 4, mode: 'cooperative' | 'normal' = 'cooperative',
  hands?: string[], draws = '') {
  let raw = 1000, seed = 56789;
  const settings = changeLocalPlayers({ ...DEFAULT_LOCAL_SETTINGS, botMode: mode }, players);
  const session = new LocalVirtualSession(settings, { now: () => raw,
    random: () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0),
    ...(hands ? { makeWall: rules => fixtureWall(rules, hands, draws) } : {}) }, 'local-test');
  return { session, elapse: (ms: number) => { raw += ms; }, time: () => raw };
}
function humanDiscard(session: LocalVirtualSession, type?: number) {
  const view = session.view(), own = view.players[0];
  const id = type === undefined ? own.drawnTileId! : own.hand!.find(tile => tile.type === type)!.id;
  assert.equal(session.send({ kind: 'DISCARD', tileId: id }).ok, true);
}
function advanceUntil(h: ReturnType<typeof harness>, predicate: () => boolean, limit = 400): void {
  for (let i = 0; i < limit && !predicate(); i++) { h.elapse(250); h.session.tick(); }
  assert.ok(predicate(), 'expected state must be reached');
}

test('defaults, preferences and switching player count keep user points', () => {
  assert.equal(readLocalSettings(null).botMode, 'cooperative');
  assert.deepEqual(readLocalSettings('{"players":99}'), DEFAULT_LOCAL_SETTINGS);
  assert.equal(changeLocalPlayers(DEFAULT_LOCAL_SETTINGS, 3).startingPoints, 35000);
  assert.equal(changeLocalPlayers({ ...DEFAULT_LOCAL_SETTINGS, startingPoints: 70000 }, 3).startingPoints, 70000);
  const saved = { players: 3 as const, startingPoints: 60000, botMode: 'normal' as const, bankruptcy: false };
  const restored = readLocalSettings(JSON.stringify(saved));
  assert.deepEqual(restored, { ...saved, zenithHand: false });
  assert.deepEqual(readLocalSettings(JSON.stringify({ ...saved, zenithHand: 'yes' })), restored);
  assert.equal(readLocalSettings(JSON.stringify({ ...saved, zenithHand: true })).zenithHand, true);
  const rules = localRules(restored);
  assert.equal(rules.match.bankruptcy, false); assert.equal(rules.startingPoints, 60000);
  assert.equal(rules.returnPoints, 40000);
});
test('logical clock freezes nested reasons and resumes with original remaining time', () => {
  let raw = 100;
  const clock = new LocalGameClock(() => raw);
  raw += 300; assert.equal(clock.now(), 400);
  clock.pause('settings'); raw += 90000; clock.pause('character');
  clock.resume('settings'); assert.equal(clock.now(), 400);
  raw += 5000; assert.equal(clock.now(), 400); clock.resume('character');
  raw += 650; assert.equal(clock.now(), 1050);
  raw -= 400; assert.equal(clock.now(), 1050, 'wall clock changes cannot reverse logical time');
});
test('settings freeze Host tick, manual/automatic sends and advancement', () => {
  const h = harness();
  h.elapse(4000); h.session.tick();
  const before = h.session.hostSnapshot();
  const time = h.session.clock.now();
  h.session.pause('settings'); h.elapse(120000);
  assert.equal(h.session.tick(), false);
  assert.equal(h.session.send({ kind: 'DISCARD', tileId: before.players[0].drawnTileId! }).ok, false);
  assert.equal(h.session.advance().ok, false);
  assert.deepEqual(h.session.hostSnapshot(), before);
  assert.equal(h.session.clock.now(), time);
  h.session.resume('settings'); assert.equal(h.session.clock.now(), time);
  humanDiscard(h.session); conserved(h.session.hostSnapshot());
});
test('supplier never wins or calls; ordinary bot takes a legal tsumo', () => {
  const hands = ['123456789p123s5z1m', '123456789s123p5z', '147m147p147s1234z', '147m147p147s1234z'];
  for (const mode of ['cooperative', 'normal'] as const) {
    const h = harness(4, mode, hands, '5z');
    humanDiscard(h.session, 0);
    advanceUntil(h, () => h.session.hostSnapshot().players[1].river.length > 0 || Boolean(h.session.view().result));
    if (mode === 'cooperative') {
      assert.equal(h.session.view().result, undefined);
      const bot = h.session.hostSnapshot().players[1];
      assert.equal(bot.riichi, 'none'); assert.equal(bot.melds.length, 0);
    } else assert.equal(h.session.view().result!.reason, 'tsumo');
  }
});
test('supplier skips legal ron; ordinary bot accepts it', () => {
  const hands = ['123456789p123s5z1m', '123456789s123p5z', '147m147p147s1234z', '147m147p147s1234z'];
  for (const mode of ['cooperative', 'normal'] as const) {
    const h = harness(4, mode, hands);
    humanDiscard(h.session, 31);
    advanceUntil(h, () => h.session.view().phase.kind !== 'WAITING_CALL_RESPONSE' || Boolean(h.session.view().result));
    if (mode === 'cooperative') assert.equal(h.session.view().result, undefined);
    else assert.equal(h.session.view().result!.reason, 'ron');
  }
});
test('new instructions replace old ones, override keep, cancel cleanly and pause bot delay', () => {
  const h = harness();
  const [first, second] = h.session.controls().availableTypes;
  assert.equal(h.session.setKeepTypes([first]).ok, true);
  assert.equal(h.session.requestSupply(first).ok, true);
  assert.deepEqual(h.session.controls().keepTypes, []);
  assert.equal(h.session.requestSupply(second).ok, true);
  assert.equal(h.session.controls().supply!.type, second);
  h.session.cancelSupply(); assert.equal(h.session.controls().supply, null);
  h.session.requestSupply(first);
  humanDiscard(h.session);
  advanceUntil(h, () => h.session.view().phase.playerId === 'b');
  h.session.tick(); h.elapse(300); h.session.tick();
  h.session.pause('supply'); h.elapse(90000);
  assert.equal(h.session.tick(), false); assert.equal(h.session.hostSnapshot().players[1].river.length, 0);
  h.session.resume('supply'); h.elapse(399); h.session.tick();
  assert.equal(h.session.hostSnapshot().players[1].river.length, 0);
  h.elapse(2); h.session.tick();
  assert.equal(h.session.hostSnapshot().players[1].river.at(-1)!.tile.type, first);
  assert.equal(h.session.controls().supply, null);
});
test('reject all-kept, invalid targets and unavailable faces without losing controls', () => {
  const h = harness(3);
  const before = h.session.controls();
  assert.equal(h.session.setKeepTypes(tileTypes(3)).ok, false);
  assert.equal(h.session.requestSupply(1).ok, false);
  assert.equal(h.session.requestSupply(before.availableTypes[0], 'd').ok, false);
  assert.deepEqual(h.session.controls(), before);
  const normal = harness(3, 'normal');
  assert.equal(normal.session.requestSupply(31).ok, false);
  assert.equal(normal.session.setKeepTypes([31]).ok, false);
  assert.equal(normal.session.controls().availableTypes.length, 0);
});
test('targeting later seat reserves the tile and supplies exactly once on that seat', () => {
  const h = harness();
  const target = h.session.controls().availableTypes.at(-1)!;
  assert.equal(h.session.requestSupply(target, 'd').ok, true);
  humanDiscard(h.session);
  advanceUntil(h, () => h.session.hostSnapshot().players[3].river.length > 0);
  const state = h.session.hostSnapshot();
  assert.equal(state.players[3].river[0].tile.type, target);
  assert.ok(state.players.slice(1, 3).every(player => player.river.every(item => item.tile.type !== target)));
  assert.equal(h.session.controls().supply, null); conserved(state);
});
test('retargeting while paused invalidates the queued earlier-seat supply', () => {
  const h = harness();
  const type = h.session.controls().availableTypes.at(-1)!;
  assert.equal(h.session.requestSupply(type, 'b').ok, true);
  humanDiscard(h.session);
  advanceUntil(h, () => h.session.view().phase.playerId === 'b');
  h.session.tick(); h.elapse(699);
  h.session.pause('supply');
  assert.equal(h.session.requestSupply(type, 'd').ok, true);
  h.elapse(90000); h.session.tick();
  assert.equal(h.session.hostSnapshot().players[1].river.length, 0);
  h.session.resume('supply');
  advanceUntil(h, () => h.session.hostSnapshot().players[3].river.length > 0);
  const after = h.session.hostSnapshot();
  assert.ok(after.players.slice(1, 3).every(player => player.river.every(discard => discard.tile.type !== type)));
  assert.equal(after.players[3].river[0].tile.type, type);
  assert.equal(h.session.controls().supply, null);
  conserved(after);
});
test('response deadlines survive supply panel pause and human can choose chi', () => {
  const h = harness(4, 'cooperative', ['1245m1468p1468s12z']);
  h.session.requestSupply(2, 'd');
  humanDiscard(h.session, 28);
  advanceUntil(h, () => h.session.view().availableActions.callOptions.some(option => option.kind === 'chi'));
  const before = h.session.view(), now = h.session.clock.now();
  h.session.pause('supply'); h.elapse(100000);
  h.session.tick(); assert.deepEqual(h.session.view(), before);
  const phase = h.session.hostSnapshot().phase;
  assert.equal(phase.kind, 'WAITING_CALL_RESPONSE');
  if (phase.kind === 'WAITING_CALL_RESPONSE') {
    assert.equal(phase.window.sourcePlayerId, 'd');
    assert.equal(phase.window.tile.type, 2);
  }
  h.session.resume('supply'); assert.equal(h.session.clock.now(), now);
  const option = h.session.view().availableActions.callOptions.find(item => item.kind === 'chi')!;
  assert.equal(h.session.send({ kind: 'RESPOND', optionId: option.id }).ok, true);
  advanceUntil(h, () => h.session.view().players[0].melds.length > 0);
  assert.equal(h.session.view().players[0].melds[0].kind, 'chi');
  assert.equal(h.session.view().players[0].melds[0].sourcePlayerId, 'd');
  conserved(h.session.hostSnapshot());
});
for (const players of [3, 4] as const) test(players + '-seat full cooperative round, repeated supplies and cleanup', () => {
  const h = harness(players);
  let supplies = 0;
  for (let step = 0; step < 6000 && !h.session.view().result; step++) {
    const view = h.session.view();
    if (view.availableActions.canPass) h.session.send({ kind: 'RESPOND', optionId: 'pass' });
    else if (view.phase.playerId === 'a' && view.availableActions.discardableTileIds.length) {
      const available = h.session.controls().availableTypes;
      if (available.length && h.session.requestSupply(available[(step + 7) % available.length]).ok) supplies++;
      humanDiscard(h.session);
    }
    h.elapse(250); h.session.tick();
    if (step % 40 === 0) conserved(h.session.hostSnapshot());
  }
  assert.ok(h.session.view().result, 'must finish round');
  assert.ok(supplies > 5); conserved(h.session.hostSnapshot());
  const round = h.session.view().roundId;
  if (h.session.advance().ok) {
    assert.notEqual(h.session.view().roundId, round);
    assert.deepEqual(h.session.controls().keepTypes, []); assert.equal(h.session.controls().supply, null);
  }
});
for (const players of [3, 4] as const) test(players + '-seat normal mode completes without supply or stalled actions', () => {
  const h = harness(players, 'normal');
  for (let step = 0; step < 6000 && !h.session.view().result; step++) {
    const intent = simpleBotIntent(h.session.view());
    if (intent) assert.equal(h.session.send(intent).ok, true);
    h.elapse(250); h.session.tick();
    assert.equal(h.session.controls().error, '');
  }
  assert.ok(h.session.view().result);
  assert.equal(h.session.controls().paused, false);
  conserved(h.session.hostSnapshot());
});
test('ordinary bot survives a large clock jump without an expired-action stall', () => {
  const h = harness(4, 'normal');
  humanDiscard(h.session);
  advanceUntil(h, () => h.session.view().phase.playerId === 'b');
  h.session.tick(); h.elapse(120000); h.session.tick();
  assert.equal(h.session.controls().paused, false);
  assert.equal(h.session.controls().error, '');
  conserved(h.session.hostSnapshot());
});
console.log(groups + ' local session groups passed');
