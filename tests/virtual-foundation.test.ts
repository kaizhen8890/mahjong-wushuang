import assert from 'node:assert/strict';
import { createTiles, countsOf, doraType, tileCode } from '../lib/virtual-mahjong/tiles';
import { createWall, dealHands, drawLive, drawRinshan, revealKanDora, doraIndicators, uraIndicators } from '../lib/virtual-mahjong/wall';
import { shanten, winningTypes } from '../lib/virtual-mahjong/shanten';
import { emptyActions, type AuthoritativeGameState, type CallWindow, type Rules } from '../lib/virtual-mahjong/model';
import { projectForViewer } from '../lib/virtual-mahjong/projection';
import { respondToCall, resolveCalls } from '../lib/virtual-mahjong/call-window';
import { ActionGate } from '../lib/virtual-mahjong/action-gate';

let checks = 0;
function test(name: string, run: () => void) { run(); checks++; console.log(`PASS virtual: ${name}`); }
function rng(seed = 20260910) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }; }
function counts(codes: string): number[] {
  const result = Array<number>(34).fill(0);
  for (const match of codes.matchAll(/([1-9]+)([mpsz])/g)) {
    for (const digit of match[1]) result['mpsz'.indexOf(match[2]) * 9 + Number(digit) - 1]++;
  }
  return result;
}

test('136/108 unique physical tiles; red fives replace rather than add', () => {
  for (const players of [3, 4] as const) for (const red of [false, true]) {
    const tiles = createTiles(players, red);
    assert.equal(tiles.length, players === 4 ? 136 : 108);
    assert.equal(new Set(tiles.map(tile => tile.id)).size, tiles.length);
    assert.equal(tiles.filter(tile => tile.red).length, red ? players === 4 ? 3 : 2 : 0);
    assert.ok(countsOf(tiles).every(n => n === 0 || n === 4));
    if (players === 3) assert.ok(tiles.every(tile => tile.type === 0 || tile.type >= 8));
  }
});
test('scoring/asset codes and all dora cycles', () => {
  assert.equal(tileCode({ type: 4, red: true }), '0m');
  assert.equal(tileCode({ type: 33, red: false }), '7z');
  assert.throws(() => tileCode({ type: 27, red: true }));
  for (const [indicator, expected] of [[8, 0], [17, 9], [26, 18], [30, 27], [33, 31]]) assert.equal(doraType(indicator, 4), expected);
  assert.equal(doraType(0, 3), 8);
  assert.equal(doraType(8, 3), 0);
  assert.throws(() => doraType(4, 3));
});
test('dealer receives 14, others 13; dead wall stays separate', () => {
  for (const players of [3, 4] as const) for (let dealer = 0; dealer < players; dealer++) {
    const wall = createWall(players, true, rng());
    const hands = dealHands(wall, players, dealer);
    assert.deepEqual(hands.map(hand => hand.length), Array.from({ length: players }, (_, i) => i === dealer ? 14 : 13));
    assert.equal(wall.live.length, players === 4 ? 69 : 54);
    const all = [...hands.flat(), ...wall.live, ...wall.dead];
    assert.equal(new Set(all.map(tile => tile.id)).size, players === 4 ? 136 : 108);
    assert.equal(wall.dead.length, 14);
  }
});
test('four rinshan replacements conserve every tile; dora/ura remain paired', () => {
  const wall = createWall(4, true, rng());
  const initial = wall.dead.map(tile => tile.id);
  const drawn: number[] = [];
  assert.throws(() => revealKanDora(wall));
  for (let kan = 0; kan < 4; kan++) {
    drawn.push(drawRinshan(wall).id);
    assert.equal(drawn[kan], initial[kan]);
    assert.equal(wall.dead.length, 14);
    revealKanDora(wall);
    assert.equal(doraIndicators(wall).length, kan + 2);
    assert.deepEqual(uraIndicators(wall).map(tile => tile.id), Array.from({ length: kan + 2 }, (_, i) => initial[5 + i * 2]));
    assert.equal(new Set([...drawn, ...wall.live.map(tile => tile.id), ...wall.dead.map(tile => tile.id)]).size, 136);
  }
  const before = JSON.stringify(wall);
  assert.throws(() => drawRinshan(wall));
  assert.throws(() => revealKanDora(wall));
  assert.equal(JSON.stringify(wall), before);
  while (wall.live.length) drawLive(wall);
  assert.throws(() => drawLive(wall));
});
test('secure production RNG, deterministic test RNG and invalid words', () => {
  assert.deepEqual(createWall(4, true, rng()), createWall(4, true, rng()));
  assert.notDeepEqual(createWall(4, true, rng(123)), createWall(4, true, rng(456)));
  assert.equal(createWall(4, false).dead.length, 14);
  assert.throws(() => createWall(4, true, () => -1));
});
test('regular / chiitoitsu / kokushi shanten and waits', () => {
  assert.equal(shanten(counts('123456789m123p55s')), -1);
  assert.deepEqual(winningTypes(counts('123456789m123p5s')), [22]);
  assert.equal(shanten(counts('1122m3344p5566s77z')), -1);
  assert.deepEqual(winningTypes(counts('1122m3344p5566s7z')), [33]);
  assert.equal(shanten(counts('19m19p19s1234567z')), 0);
  assert.equal(winningTypes(counts('19m19p19s1234567z')).length, 13);
  assert.equal(shanten(counts('119m19p19s1234567z')), -1);
  assert.equal(shanten(counts('11112222333344z')), 1, 'four copies are not two chiitoitsu pairs');
});
test('open hands, sequence boundaries, fifth-copy waits and sanma exclusions', () => {
  assert.equal(shanten(counts('123p123s111z55m'), 1), -1);
  assert.deepEqual(winningTypes(counts('123p123s111z5m'), 1), [4]);
  assert.notEqual(shanten(counts('891m123p123s111z55m')), -1);
  const meldCounts = counts('1111z');
  assert.deepEqual(winningTypes(counts('123p123s22z33z'), 1, 4, meldCounts), [28, 29]);
  assert.deepEqual(winningTypes(counts('11123m123p11z'), 1), [0, 3, 27]);
  assert.deepEqual(winningTypes(counts('11123m123p11z'), 1, 4, counts('123m')), [3, 27]);
  assert.throws(() => winningTypes(counts('123456789m123p5s'), 0, 3));
  assert.throws(() => shanten(Array(34).fill(5)));
  assert.throws(() => winningTypes(counts('123m')));
});

const rules: Rules = { players: 4, length: 'hanchan', startingPoints: 25000, returnPoints: 30000,
  openTanyao: true, redFives: true, kiriageMangan: false, kazoeYakuman: true, doubleYakuman: true,
  sanmaTsumoLoss: true, multiRon: 'all', abortiveDraws: { nineTerminals: true, fourWinds: true, fourKans: true, fourRiichi: true },
  timer: { fixedMs: 15000, bankMs: 30000, responseMs: 5000 },
  match: { bankruptcy: true, dealerWinEnd: true, dealerTenpaiEnd: true, extension: 'one-wind', uma: [0, 0, 0, 0] } };
function fixture(): AuthoritativeGameState {
  const wall = createWall(4, true, rng());
  const hands = dealHands(wall, 4, 0);
  return { schemaVersion: 1, gameId: 'g', roundId: 'r', turnId: 1, revision: 1, mode: 'STANDARD_RIICHI',
    rules: structuredClone(rules), phase: { kind: 'AFTER_DRAW', playerId: 'a' },
    players: ['a', 'b', 'c', 'd'].map((id, seat) => ({ id, name: id, seat, wind: (['east', 'south', 'west', 'north'] as const)[seat],
      points: 25000, connected: true, ready: true, hand: hands[seat], drawnTileId: seat === 0 ? hands[0][13].id : null,
      melds: [], nuki: [], river: [], riichi: 'none', ippatsu: false, furiten: { temporary: false, riichi: false }, bankMs: 30000 })),
    wall, roundWind: 'east', handNumber: 1, dealerId: 'a', honba: 0, riichiSticks: 0, clock: null,
    actions: { a: { ...emptyActions(), discardableTileIds: hands[0].map(tile => tile.id) } },
    events: [{ sequenceId: 1, timestamp: 100, type: 'DEAL', playerId: 'a', data: { secret: 'private-event', wall } }] };
}
test('each viewer only receives own concealed IDs and no wall/ura/private logs', () => {
  const state = fixture();
  for (const id of ['a', 'b', 'c', 'd']) {
    const snapshot = projectForViewer(state, { role: 'player', playerId: id });
    for (const player of snapshot.players) {
      assert.equal(Object.hasOwn(player, 'hand'), player.id === id);
      assert.equal(Object.hasOwn(player, 'drawnTileId'), player.id === id);
      assert.equal(Object.hasOwn(player, 'furiten'), player.id === id);
    }
    const wire = JSON.stringify(snapshot);
    assert.ok(!wire.includes('private-event'));
    for (const key of ['wall', 'dead', 'events', 'uraIndicators', 'actions']) assert.equal(Object.hasOwn(snapshot, key), false);
    assert.equal(snapshot.doraIndicators.length, 1);
    assert.deepEqual(snapshot.players.find(player => player.id === id)!.hand, state.players.find(player => player.id === id)!.hand);
  }
  assert.throws(() => projectForViewer(state, { role: 'player', playerId: 'intruder' }));
});
test('spectator projection has no hands/prompts; modifying snapshots cannot mutate Host', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const view = projectForViewer(state, { role: 'player', playerId: 'a' });
  view.players[0].hand!.pop(); view.rules.timer.bankMs = 1; view.availableActions.discardableTileIds.pop();
  assert.equal(JSON.stringify(state), before);
  const spectator = projectForViewer(state, { role: 'spectator' });
  assert.ok(spectator.players.every(player => !Object.hasOwn(player, 'hand')));
  assert.deepEqual(spectator.availableActions, emptyActions());
});
test('extra Host properties are excluded recursively; hidden IDs cannot be recovered from JSON', () => {
  const state = fixture();
  Object.assign(state, { gameSeed: 'secret-marker' });
  Object.assign(state.rules, { secret: 'secret-marker' });
  Object.assign(state.players[0].hand[0], { secret: 'secret-marker' });
  Object.assign(state.actions.a, { secret: 'secret-marker' });
  const view = projectForViewer(state, { role: 'player', playerId: 'a' });
  assert.ok(!JSON.stringify(view).includes('secret-marker'));
  const ids: number[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if ('type' in value && 'red' in value && 'id' in value) ids.push(value.id as number);
    for (const child of Object.values(value)) visit(child);
  }
  visit(view);
  const allowed = new Set([...state.players[0].hand, ...doraIndicators(state.wall!)].map(tile => tile.id));
  assert.ok(ids.every(id => allowed.has(id)));
});

function windowFixture(): CallWindow {
  return { id: 'w', sourcePlayerId: 'a', tile: createTiles(4, false)[0], trigger: 'discard', deadline: 5000,
    eligible: { b: [{ id: 'chi-b', kind: 'chi', consumeTileIds: [4, 8] }],
      c: [{ id: 'pon-c', kind: 'pon', consumeTileIds: [1, 2] }],
      d: [{ id: 'ron-d', kind: 'ron', consumeTileIds: [] }] }, responses: {} };
}
test('first pass does not advance; all replies / deadline required; Ron beats Pon beats Chi', () => {
  let window = windowFixture();
  window = respondToCall(window, 'b', 'chi-b', 100);
  window = respondToCall(window, 'c', 'pon-c', 200);
  assert.deepEqual(resolveCalls(window, ['a', 'b', 'c', 'd'], 'all', 201), { kind: 'pending' });
  assert.equal(resolveCalls(window, ['a', 'b', 'c', 'd'], 'all', 5000).kind, 'meld');
  const pass = respondToCall(window, 'd', 'pass', 300);
  const resolved = resolveCalls(pass, ['a', 'b', 'c', 'd'], 'all', 301);
  assert.equal(resolved.kind === 'meld' && resolved.playerId, 'c');
  window = respondToCall(window, 'd', 'ron-d', 300);
  assert.deepEqual(resolveCalls(window, ['a', 'b', 'c', 'd'], 'all', 301), { kind: 'ron', playerIds: ['d'] });
  assert.throws(() => respondToCall(window, 'd', 'pass', 400));
  assert.throws(() => respondToCall(window, 'a', 'pass', 400));
  assert.throws(() => respondToCall(windowFixture(), 'b', 'pon-c', 400));
  assert.throws(() => respondToCall(windowFixture(), 'b', 'pass', 5000));
});
test('multi-Ron waits for all and supports head bump / triple abort', () => {
  let window = windowFixture();
  for (const id of ['b', 'c', 'd']) window.eligible[id] = [{ id: `ron-${id}`, kind: 'ron', consumeTileIds: [] }];
  for (const id of ['d', 'c', 'b']) window = respondToCall(window, id, `ron-${id}`, 1);
  assert.deepEqual(resolveCalls(window, ['a', 'b', 'c', 'd'], 'all', 2), { kind: 'ron', playerIds: ['b', 'c', 'd'] });
  assert.deepEqual(resolveCalls(window, ['a', 'b', 'c', 'd'], 'head-bump', 2), { kind: 'ron', playerIds: ['b'] });
  assert.deepEqual(resolveCalls(window, ['a', 'b', 'c', 'd'], 'triple-abort', 2), { kind: 'triple-ron-abort' });
});
test('private response choices and other players prompts never enter snapshots', () => {
  const state = fixture();
  state.phase = { kind: 'WAITING_CALL_RESPONSE', window: windowFixture() };
  const view = projectForViewer(state, { role: 'player', playerId: 'b' });
  assert.deepEqual(view.phase, { kind: 'WAITING_CALL_RESPONSE', responseDeadline: 5000,
    call: { sourcePlayerId: 'a', trigger: 'discard', tile: { id: 0, type: 0, red: false } } });
  assert.ok(!JSON.stringify(view).includes('ron-d'));
  assert.deepEqual(view.availableActions, emptyActions());
});
test('action dedup, stale IDs, ended state, persistence and bounded round lifetime', () => {
  const gate = new ActionGate('g', 'r');
  const current = { roundId: 'r', turnId: 1, ended: false };
  const action = { actionId: 'action', gameId: 'g', roundId: 'r', turnId: 1 };
  assert.equal(gate.check('a', action, current), null);
  gate.commit('a', action.actionId);
  assert.equal(gate.check('a', action, current), 'DUPLICATE');
  assert.equal(gate.check('b', action, current), null);
  assert.equal(new ActionGate('g', 'r', gate.saveKeys()).check('a', action, current), 'DUPLICATE');
  assert.equal(gate.check('a', { ...action, gameId: 'x' }, current), 'WRONG_GAME');
  assert.equal(gate.check('a', { ...action, roundId: 'x' }, current), 'STALE_ROUND');
  assert.equal(gate.check('a', { ...action, turnId: 0 }, current), 'STALE_TURN');
  assert.equal(gate.check('a', { ...action, turnId: NaN }, current), 'MALFORMED');
  assert.equal(gate.check('a', action, { ...current, ended: true }), 'ENDED');
  gate.nextRound('r2');
  assert.equal(gate.saveKeys().length, 0);
  assert.equal(gate.check('a', action, { ...current, roundId: 'r2' }), 'STALE_ROUND');
});
console.log(`Virtual foundation: ${checks} groups passed. This is not a complete playable engine.`);
