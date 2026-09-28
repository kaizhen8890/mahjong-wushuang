import assert from 'node:assert/strict';
import { MahjongRoundEngine, type RoundIntent } from '../lib/virtual-mahjong/round-engine';
import { defaultRules, validateRules } from '../lib/virtual-mahjong/rules';
import { createTiles, tileCode, type Tile } from '../lib/virtual-mahjong/tiles';
import type { Wall } from '../lib/virtual-mahjong/wall';
import type { Rules } from '../lib/virtual-mahjong/model';
import { evaluateWin, isFuriten, nagashiPlayerIds, nagashiSettlement } from '../lib/virtual-mahjong/scoring';
import { preservesRiichiStructure } from '../lib/virtual-mahjong/kan';
import { tableEffects } from '../lib/virtual-mahjong/table-effects';
import { layoutTable } from '../app/components/virtual-mahjong/three/table-layout';

let groups = 0;
function test(name: string, run: () => void) { run(); groups++; console.log(`PASS virtual round: ${name}`); }
function codes(text: string): string[] {
  return [...text.matchAll(/([0-9]+)([mpsz])/g)].flatMap(match => match[1].split('').map(digit => digit + match[2]));
}
function take(pool: Tile[], code: string): Tile {
  const index = pool.findIndex(tile => tileCode(tile) === code);
  assert.ok(index >= 0, `Fixture exhausted ${code}`);
  return pool.splice(index, 1)[0];
}
function rigWall(rules: Rules, requested: string[], nextDraws = '', replacements = ''): Wall {
  const pool = createTiles(rules.players, rules.redFives);
  const hands = Array.from({ length: rules.players }, (_, i) => codes(requested[i] ?? '').map(code => take(pool, code)));
  const draws = codes(nextDraws).map(code => take(pool, code));
  const rinshan = codes(replacements).map(code => take(pool, code));
  assert.ok(rinshan.length <= 4);
  hands.forEach((hand, i) => {
    assert.ok(hand.length <= (i === 0 ? 14 : 13));
    while (hand.length < (i === 0 ? 14 : 13)) hand.push(pool.shift()!);
  });
  const deal: Tile[] = [];
  for (let packet = 0; packet < 3; packet++) for (let player = 0; player < rules.players; player++) {
    deal.push(...hands[player].slice(packet * 4, packet * 4 + 4));
  }
  for (const hand of hands) deal.push(hand[12]);
  deal.push(hands[0][13]);
  const dead = [...rinshan, ...pool.splice(-(14 - rinshan.length))];
  return { live: [...deal, ...draws, ...pool], dead, rinshanUsed: 0, indicatorsRevealed: 1 };
}
function harness(hands: string[] = [], draws = '', configure?: (rules: Rules) => void, replacements = '', arrangeWall?: (wall: Wall) => Wall) {
  let now = 0;
  let sequence = 0;
  const rules = defaultRules(); rules.redFives = false;
  configure?.(rules);
  const ids = ['a', 'b', 'c', 'd'].slice(0, rules.players);
  let engine = new MahjongRoundEngine({ gameId: 'game', roundId: 'round', rules, dealerSeat: 0,
    players: ids.map(id => ({ id, name: id })) }, { now: () => now, makeWall: rule => {
      const wall = rigWall(rule, hands, draws, replacements);
      return arrangeWall ? arrangeWall(wall) : wall;
    } });
  function request(intent: RoundIntent) {
    const state = engine.hostSnapshot();
    return { ...intent, gameId: state.gameId, roundId: state.roundId, turnId: state.turnId, actionId: `action-${++sequence}` };
  }
  function send(actor: string, intent: RoundIntent) {
    const result = engine.dispatch(actor, request(intent));
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  function discard(actor: string, code?: string) {
    const state = engine.hostSnapshot();
    const player = state.players.find(item => item.id === actor)!;
    const tileId = code ? player.hand.find(tile => tileCode(tile) === code)!.id
      : state.actions[actor].discardableTileIds.includes(player.drawnTileId ?? -1) ? player.drawnTileId! : state.actions[actor].discardableTileIds[0];
    send(actor, { kind: 'DISCARD', tileId });
  }
  function passAll() {
    const phase = engine.hostSnapshot().phase;
    if (phase.kind !== 'WAITING_CALL_RESPONSE') return;
    for (const id of Object.keys(phase.window.eligible)) {
      if (!Object.hasOwn(phase.window.responses, id)) send(id, { kind: 'RESPOND', optionId: 'pass' });
    }
  }
  function restore() {
    const before = engine.hostSnapshot();
    engine = MahjongRoundEngine.restoreCheckpoint(JSON.parse(JSON.stringify(engine.exportCheckpoint())),
      { now: () => now, makeWall: () => { throw new Error('Restore must never generate a wall'); } });
    assert.deepEqual(engine.hostSnapshot(), before);
  }
  return { get engine() { return engine; }, request, send, discard, passAll, restore, time: (value: number) => { now = value; } };
}

test('configuration validation and malformed walls fail before starting', () => {
  validateRules(defaultRules(3));
  assert.throws(() => validateRules({ ...defaultRules(), startingPoints: NaN }));
  assert.throws(() => validateRules({ ...defaultRules(), timer: { fixedMs: 0, bankMs: 0, responseMs: 0 } }));
  const rules = defaultRules();
  assert.throws(() => new MahjongRoundEngine({ gameId: 'g', roundId: 'r', rules, dealerSeat: 0,
    players: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id })) }, { now: () => 0,
    makeWall: () => ({ live: [], dead: [], rinshanUsed: 0, indicatorsRevealed: 1 }) }));
});
test('atomic rejection, automatic draw, clock bank consumption and private snapshot isolation', () => {
  const h = harness();
  const before = h.engine.hostSnapshot();
  assert.equal(before.players[0].hand.length, 14);
  assert.equal(before.wall!.live.length, 69);
  assert.equal(h.engine.dispatch('b', h.request({ kind: 'DISCARD', tileId: before.players[0].hand[0].id })).ok, false);
  assert.equal(h.engine.dispatch('a', h.request({ kind: 'DISCARD', tileId: 999 })).ok, false);
  assert.deepEqual(h.engine.hostSnapshot(), before);
  const detached = h.engine.hostSnapshot(); detached.players[0].points = 0;
  assert.equal(h.engine.hostSnapshot().players[0].points, 25000);
  h.time(20000); h.discard('a'); h.passAll();
  const after = h.engine.hostSnapshot();
  assert.equal(after.players[0].bankMs, 25000);
  assert.equal(after.players[1].hand.length, 14);
  assert.equal(after.wall!.live.length, 68);
  assert.deepEqual(after.phase, { kind: 'AFTER_DRAW', playerId: 'b' });
  assert.equal(after.clock!.startedAt, 20000);
  assert.equal(after.players[0].river[0].tsumogiri, true);
  assert.equal(h.engine.dispatch('b', { ...h.request({ kind: 'TSUMO' }), turnId: 1 }).ok, false);
});
test('timeout discards exactly once and rejects a late player action', () => {
  const h = harness(); const tileId = h.engine.hostSnapshot().players[0].drawnTileId!;
  h.time(45000);
  assert.equal(h.engine.dispatch('a', h.request({ kind: 'DISCARD', tileId })).ok, false);
  assert.equal(h.engine.tick(), true);
  assert.equal(h.engine.hostSnapshot().players[0].river[0].tile.id, tileId);
  assert.equal(h.engine.tick(), false);
  assert.equal(h.engine.hostSnapshot().players[0].bankMs, 0);
});
test('Pon beats Chi after all responses; no draw on a call; kuikae is forbidden', () => {
  const h = harness(['3m', '12m1468p1468s123z', '333m1246p1468s12z']);
  h.discard('a', '3m');
  let state = h.engine.hostSnapshot();
  assert.equal(state.phase.kind, 'WAITING_CALL_RESPONSE');
  const chi = state.actions.b.callOptions.find(option => option.kind === 'chi')!;
  const pon = state.actions.c.callOptions.find(option => option.kind === 'pon')!;
  assert.ok(chi); assert.ok(pon);
  const remaining = state.wall!.live.length;
  h.send('b', { kind: 'RESPOND', optionId: chi.id });
  assert.equal(h.engine.hostSnapshot().phase.kind, 'WAITING_CALL_RESPONSE');
  h.send('c', { kind: 'RESPOND', optionId: pon.id }); h.passAll();
  state = h.engine.hostSnapshot();
  assert.deepEqual(state.phase, { kind: 'WAITING_DISCARD', playerId: 'c' });
  assert.equal(state.players[2].melds[0].kind, 'pon');
  assert.equal(state.players[2].hand.length, 11);
  assert.equal(state.players[0].river[0].calledBy, 'c');
  assert.equal(state.wall!.live.length, remaining);
  const lastThree = state.players[2].hand.find(tile => tileCode(tile) === '3m')!;
  assert.ok(lastThree);
  assert.ok(!state.actions.c.discardableTileIds.includes(lastThree.id));
  assert.equal(h.engine.dispatch('c', h.request({ kind: 'DISCARD', tileId: lastThree.id })).ok, false);
  h.discard('c'); h.passAll();
  assert.equal(h.engine.hostSnapshot().wall!.live.length, remaining - 1);
});
test('Chi combinations are separate physical choices and restricted to next player', () => {
  const h = harness(['3m', '1245m1468p1468s1z']); h.discard('a', '3m');
  const state = h.engine.hostSnapshot();
  assert.equal(state.actions.b.callOptions.filter(option => option.kind === 'chi').length, 3);
  assert.ok(state.actions.c.callOptions.every(option => option.kind !== 'chi'));
  assert.ok(state.actions.d.callOptions.every(option => option.kind !== 'chi'));
  const chi = state.actions.b.callOptions.find(option => option.kind === 'chi')!;
  h.send('b', { kind: 'RESPOND', optionId: chi.id }); h.passAll();
  assert.equal(h.engine.hostSnapshot().players[1].melds[0].kind, 'chi');
});
const multiHands = ['5s', '123456789m123p5s', '123456789p123s5s', '1122m3344p6677z5s'];
test('real three-player Ron arbitration and score conservation', () => {
  for (const rule of ['all', 'head-bump', 'triple-abort'] as const) {
    const h = harness(multiHands, '', rules => { rules.multiRon = rule; }); h.discard('a', '5s');
    for (const id of ['d', 'c']) h.send(id, { kind: 'RESPOND', optionId: 'ron' });
    assert.equal(h.engine.hostSnapshot().phase.kind, 'WAITING_CALL_RESPONSE');
    h.send('b', { kind: 'RESPOND', optionId: 'ron' });
    const state = h.engine.hostSnapshot();
    assert.equal(state.phase.kind, 'ROUND_RESULT');
    assert.equal(state.result!.wins.length, rule === 'all' ? 3 : rule === 'head-bump' ? 1 : 0);
    assert.equal(state.players.reduce((sum, player) => sum + player.points, 0), 100000);
    if (rule === 'head-bump') assert.equal(state.result!.wins[0].playerId, 'b');
    if (rule === 'triple-abort') assert.equal(state.result!.reason, 'triple-ron');
    assert.equal(h.engine.dispatch('b', h.request({ kind: 'TSUMO' })).ok, false);
    const view = h.engine.view({ role: 'player', playerId: 'd' });
    assert.equal(view.players[0].hand, undefined);
    assert.deepEqual(view.result, state.result);
  }
});
test('Ron on declaration tile cancels pending riichi without taking a deposit', () => {
  const h = harness(['123456789m123p55s', '123456789p123s5s']);
  const state = h.engine.hostSnapshot();
  const tile = state.players[0].hand.find(item => tileCode(item) === '5s')!;
  assert.ok(state.actions.a.riichiDiscardTileIds.includes(tile.id));
  h.send('a', { kind: 'RIICHI', tileId: tile.id });
  assert.equal(h.engine.hostSnapshot().players[0].points, 25000);
  h.send('b', { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
  const result = h.engine.hostSnapshot();
  assert.equal(result.riichiSticks, 0);
  assert.equal(result.players[0].riichi, 'none');
  assert.ok(!result.events.some(event => event.type === 'RIICHI'));
});
test('double riichi, ippatsu, forced drawn-tile discard and tsumo deposit award', () => {
  const h = harness(['123456789m123p5s1z'], '2z3z4z5s');
  const tileId = h.engine.hostSnapshot().players[0].hand.find(tile => tileCode(tile) === '1z')!.id;
  h.send('a', { kind: 'RIICHI', tileId }); h.passAll();
  assert.equal(h.engine.hostSnapshot().players[0].points, 24000);
  assert.equal(h.engine.hostSnapshot().riichiSticks, 1);
  for (const id of ['b', 'c', 'd']) { h.discard(id); h.passAll(); }
  const state = h.engine.hostSnapshot();
  assert.deepEqual(state.actions.a.discardableTileIds, [state.players[0].drawnTileId]);
  assert.equal(state.actions.a.canTsumo, true);
  h.send('a', { kind: 'TSUMO' });
  const result = h.engine.hostSnapshot();
  assert.ok(result.result!.wins[0].yaku.includes('double-riichi'));
  assert.ok(result.result!.wins[0].yaku.includes('ippatsu'));
  assert.ok(result.result!.wins[0].yaku.includes('menzen-tsumo'));
  assert.equal(result.players.reduce((sum, player) => sum + player.points, 0), 100000);
  assert.equal(result.riichiSticks, 0);
  assert.equal(result.result!.wins[0].uraIndicators.length, 1);
});
test('missed Ron creates temporary furiten until own draw', () => {
  const h = harness(['5s', '', '123456789m123p5s'], '5s');
  h.discard('a', '5s'); assert.ok(h.engine.hostSnapshot().actions.c.callOptions.some(option => option.kind === 'ron'));
  h.passAll(); assert.equal(h.engine.hostSnapshot().players[2].furiten.temporary, true);
  assert.equal(h.engine.view({role:'player',playerId:'c'}).players[2].furiten,true);
  h.discard('b', '5s');
  assert.ok(h.engine.hostSnapshot().actions.c.callOptions.every(option => option.kind !== 'ron'));
  h.passAll(); assert.equal(h.engine.hostSnapshot().players[2].furiten.temporary, false);
  assert.equal(h.engine.view({role:'player',playerId:'c'}).players[2].furiten,false);
});
test('missed Ron after riichi persists through own draw but does not block tsumo', () => {
  const h = harness(['', '', '123456789m123p5s'], '7z1z5s5s6z5s');
  h.discard('a'); h.passAll(); h.discard('b'); h.passAll();
  const tileId = h.engine.hostSnapshot().players[2].hand.find(tile => tileCode(tile) === '1z')!.id;
  h.send('c', { kind: 'RIICHI', tileId }); h.passAll();
  h.discard('d', '5s'); assert.ok(h.engine.hostSnapshot().actions.c.callOptions.some(option => option.kind === 'ron'));
  h.passAll(); assert.equal(h.engine.hostSnapshot().players[2].furiten.riichi, true);
  h.discard('a', '5s'); h.passAll(); h.discard('b'); h.passAll();
  const state = h.engine.hostSnapshot();
  assert.equal(state.players[2].furiten.riichi, true);
  assert.equal(state.actions.c.canTsumo, true);
  h.send('c', { kind: 'TSUMO' });
});
test('nine terminals and four identical first winds produce abortive results', () => {
  const h = harness(['19m19p19s1234567z1m']);
  assert.equal(h.engine.hostSnapshot().actions.a.canAbortNineTerminals, true);
  h.send('a', { kind: 'ABORT_NINE_TERMINALS' });
  assert.equal(h.engine.hostSnapshot().result!.reason, 'nine-terminals');
  const winds = harness(['1z', '1z', '1z', '1z']);
  for (const id of ['a', 'b', 'c', 'd']) { winds.discard(id, '1z'); winds.passAll(); }
  assert.equal(winds.engine.hostSnapshot().result!.reason, 'four-winds');
});
test('no-yaku Ron is rejected even with bonus tiles', () => {
  const h = harness(['5m', '123m456p789s22p46m']);
  const state = h.engine.hostSnapshot();
  const tile = state.players[0].hand.find(item => tileCode(item) === '5m')!;
  state.wall!.dead[4] = { id: 12, type: 3, red: false }; // 4m indicator → 5m bonus.
  assert.equal(evaluateWin(state, 'b', tile, { method: 'ron', loserId: 'a', source: 'normal', awardDeposits: false }), null);
});
test('discard furiten blocks all waits, while tsumo remains legal', () => {
  const h = harness(['6s', '123m123p123s45s22z']);
  const state = h.engine.hostSnapshot();
  const player = state.players[1];
  player.river.push({ tile: { id: 83, type: 20, red: false }, turnId: 0, riichi: false, tsumogiri: false, calledBy: 'c' });
  assert.equal(isFuriten(player, 4), true);
  const tile = state.players[0].hand.find(item => tileCode(item) === '6s')!;
  assert.equal(evaluateWin(state, 'b', tile, { method: 'ron', loserId: 'a', source: 'normal', awardDeposits: false }), null);
  player.hand.push(tile); player.drawnTileId = tile.id;
  assert.ok(evaluateWin(state, 'b', tile, { method: 'tsumo', source: 'normal', awardDeposits: false }));
});
test('double yakuman switch changes score without disabling yakuman stacking', () => {
  const h = harness(['1m', '19m19p19s1234567z']);
  const state = h.engine.hostSnapshot();
  const tile = state.players[0].hand.find(item => tileCode(item) === '1m')!;
  const facts = { method: 'ron', loserId: 'a', source: 'normal', awardDeposits: false } as const;
  assert.equal(evaluateWin(state, 'b', tile, facts)!.yakuman, 2);
  assert.equal(evaluateWin(state, 'b', tile, facts)!.winnerGain, 64000);
  state.rules.doubleYakuman = false;
  assert.equal(evaluateWin(state, 'b', tile, facts)!.winnerGain, 32000);
});
test('dora/ura, honba and deposits are derived from Host state; ura needs riichi', () => {
  const h = harness(['1m', '123456789m123p1m']);
  const state = h.engine.hostSnapshot();
  const tile = state.players[0].hand.find(item => tileCode(item) === '1m')!;
  state.wall!.dead[4] = { id: 32, type: 8, red: false };
  state.wall!.dead[5] = { id: 33, type: 8, red: false };
  state.honba = 2; state.riichiSticks = 3;
  const facts = { method: 'ron', loserId: 'a', source: 'normal', awardDeposits: true } as const;
  assert.equal(evaluateWin(state, 'b', tile, facts)!.bonus.ura, 0);
  assert.equal(evaluateWin(state, 'b', tile, facts)!.uraIndicators.length, 0);
  state.players[1].riichi = 'riichi';
  const score = evaluateWin(state, 'b', tile, facts)!;
  assert.deepEqual(score.bonus, { dora: 3, ura: 3, aka: 0, nuki: 0 });
  assert.equal(score.payments.a, 16600);
  assert.equal(score.winnerGain, 19600);
  assert.equal(evaluateWin(state, 'b', tile, { ...facts, awardDeposits: false })!.winnerGain, 16600);
});
test('sanma tsumo-loss toggle reuses the existing payment engine', () => {
  const h = harness(['5s', '123456789p123s5s'], '', rules => { Object.assign(rules, defaultRules(3)); rules.redFives = false; });
  const state = h.engine.hostSnapshot();
  const tile = state.players[0].hand.find(item => tileCode(item) === '5s')!;
  state.players[1].hand.push(tile); state.players[1].drawnTileId = tile.id;
  const facts = { method: 'tsumo', source: 'normal', awardDeposits: false } as const;
  const loss = evaluateWin(state, 'b', tile, facts)!;
  assert.deepEqual(Object.keys(loss.payments).sort(), ['a', 'c']);
  state.rules.sanmaTsumoLoss = false;
  const compensated = evaluateWin(state, 'b', tile, facts)!;
  assert.ok(compensated.winnerGain > loss.winnerGain);
});
test('three-player hands and exhausted rounds terminate with conserved scores and tiles', () => {
  for (const count of [3, 4] as const) {
    const h = harness([], '', rules => { Object.assign(rules, defaultRules(count)); rules.redFives = false;
      rules.abortiveDraws.fourWinds = false; rules.abortiveDraws.fourRiichi = false; });
    let steps = 0;
    while (h.engine.hostSnapshot().phase.kind !== 'ROUND_RESULT' && steps++ < 400) {
      const state = h.engine.hostSnapshot();
      if (state.phase.kind === 'WAITING_CALL_RESPONSE') h.passAll();
      else if (state.phase.kind === 'AFTER_DRAW' || state.phase.kind === 'WAITING_DISCARD') h.discard(state.phase.playerId);
      else assert.fail(`Unexpected phase ${state.phase.kind}`);
    }
    const final = h.engine.hostSnapshot();
    assert.ok(steps < 400);
    assert.equal(final.result!.reason, 'exhaustive');
    assert.equal(final.wall!.live.length, 0);
    assert.equal(final.players.reduce((sum, player) => sum + player.points, 0), final.rules.startingPoints * count);
    const physical = [...final.wall!.dead, ...final.players.flatMap(player => [...player.hand, ...player.nuki,
      ...player.river.filter(discard => !discard.calledBy).map(discard => discard.tile), ...player.melds.flatMap(meld => meld.tiles)])];
    assert.equal(new Set(physical.map(tile => tile.id)).size, count === 4 ? 136 : 108);
    assert.equal(physical.length, count === 4 ? 136 : 108);
    assert.deepEqual(final.events.map(event => event.sequenceId), Array.from({ length: final.events.length }, (_, i) => i + 1));
  }
});
function kan(h: ReturnType<typeof harness>, actor: string, kind: 'ankan' | 'kakan' = 'ankan') {
  const option = h.engine.hostSnapshot().actions[actor].selfKanOptions.find(item => item.kind === kind);
  assert.ok(option, `Missing ${kind} for ${actor}`);
  h.send(actor, { kind: 'KAN', optionId: option.id });
}
function conserved(h: ReturnType<typeof harness>) {
  const state = h.engine.hostSnapshot();
  const physical = [...state.wall!.live, ...state.wall!.dead, ...state.players.flatMap(player => [...player.hand, ...player.nuki,
    ...player.melds.flatMap(meld => meld.tiles), ...player.river.filter(item => !item.calledBy).map(item => item.tile)])];
  assert.equal(physical.length, state.rules.players === 4 ? 136 : 108);
  assert.equal(new Set(physical.map(tile => tile.id)).size, physical.length);
  assert.equal(state.players.reduce((sum, player) => sum + player.points, 1000 * state.riichiSticks),
    state.rules.startingPoints * state.rules.players);
}
test('sanma nuki exposes North, keeps the hand closed and draws from dead wall without kan dora', () => {
  const h = harness(['4z'], '', rules => { Object.assign(rules, defaultRules(3)); rules.redFives = false; }, '7z');
  const viewerBefore = h.engine.view({ role: 'player', playerId: 'b' });
  const before = h.engine.hostSnapshot();
  const northId = before.actions.a.nukiTileIds[0];
  assert.ok(Number.isInteger(northId));
  assert.equal(h.engine.dispatch('a', h.request({ kind: 'NUKI', tileId: 999 })).ok, false);
  h.send('a', { kind: 'NUKI', tileId: northId });
  h.passAll();
  const after = h.engine.hostSnapshot();
  assert.equal(after.players[0].nuki.length, 1);
  assert.equal(after.players[0].nuki[0].id, northId);
  assert.equal(after.players[0].hand.length, 14);
  assert.equal(after.players[0].drawnTileId, before.wall!.dead[0].id);
  assert.equal(after.players[0].melds.length, 0);
  assert.equal(after.wall!.rinshanUsed, 0);
  assert.equal(after.wall!.indicatorsRevealed, 1);
  assert.equal(after.wall!.live.length, before.wall!.live.length - 1);
  assert.equal(h.engine.view({ role: 'player', playerId: 'b' }).players[0].nuki[0].id, northId);
  const viewerAfter = h.engine.view({ role: 'player', playerId: 'b' });
  assert.ok(tableEffects(viewerBefore, viewerAfter).some(e => e.kind === 'nuki' && e.tileId === northId));
  assert.deepEqual(tableEffects(null, viewerAfter), []);
  assert.deepEqual(tableEffects(viewerAfter, viewerAfter), []);
  assert.deepEqual(tableEffects(viewerBefore, { ...viewerAfter, revision: viewerBefore.revision + 3 }), []);
  const northMesh = layoutTable(viewerAfter, { selected: null, legal: [], riichi: false, highlight: null }).find(t => t.key === `nuki:a:${northId}`);
  assert.ok(northMesh?.flat && northMesh.motion === 'nuki' && northMesh.face?.column === 3 && northMesh.face.row === 3);
  conserved(h);
  h.restore();
});

test('nagashi mangan qualifies only an uncalled terminal/honor river and settles a real exhaustive round', () => {
  const h = harness(['1199m1199p1199s12z'], '', rules => {
    rules.abortiveDraws.fourWinds = false; rules.abortiveDraws.fourRiichi = false;
  }, '', wall => {
    // The dealer needs four extra terminal/honor draws beyond the initial fourteen tiles.
    const firstDraw = 53;
    for (let turn = 0; turn < 4; turn++) {
      const target = firstDraw + 3 + turn * 4;
      const source = wall.live.findIndex((tile, index) => index > target
        && (tile.type >= 27 || tile.type % 9 === 0 || tile.type % 9 === 8));
      assert.ok(source > target);
      [wall.live[target], wall.live[source]] = [wall.live[source], wall.live[target]];
    }
    return wall;
  });
  let steps = 0;
  while (h.engine.hostSnapshot().phase.kind !== 'ROUND_RESULT' && steps++ < 400) {
    const state = h.engine.hostSnapshot();
    if (state.phase.kind === 'WAITING_CALL_RESPONSE') { h.passAll(); continue; }
    if (state.phase.kind !== 'AFTER_DRAW' && state.phase.kind !== 'WAITING_DISCARD') assert.fail('Unexpected phase');
    if (state.phase.playerId !== 'a') { h.discard(state.phase.playerId); continue; }
    const actor = state.players[0];
    const allowed = new Set(state.actions.a.discardableTileIds);
    const tile = actor.hand.find(item => allowed.has(item.id)
      && (item.type >= 27 || item.type % 9 === 0 || item.type % 9 === 8));
    assert.ok(tile, `Dealer ran out of qualifying tiles after ${actor.river.length} discards`);
    h.send('a', { kind: 'DISCARD', tileId: tile.id });
  }
  const final = h.engine.hostSnapshot();
  assert.ok(steps < 400);
  assert.equal(final.result!.reason, 'nagashi');
  assert.deepEqual(final.result!.nagashiPlayerIds, ['a']);
  assert.deepEqual(final.result!.deltas, { a: 12000, b: -4000, c: -4000, d: -4000 });
  assert.equal(final.players.reduce((sum, player) => sum + player.points, 0), 100000);
  h.restore();
  assert.deepEqual(h.engine.view({ role: 'player', playerId: 'b' }).result!.nagashiPlayerIds, ['a']);
  const corrupt = h.engine.exportCheckpoint();
  corrupt.state.result!.deltas.a += 1000;
  corrupt.state.events.at(-1)!.data.result = structuredClone(corrupt.state.result);
  assert.throws(() => MahjongRoundEngine.restoreCheckpoint(corrupt, { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
});

test('nagashi rejects called or simple discards, supports multiple winners, and ignores honba/deposits', () => {
  const state = harness().engine.hostSnapshot();
  const terminal = state.players[0].hand.find(tile => tile.type % 9 === 0)!;
  const simple = state.players[0].hand.find(tile => tile.type < 27 && tile.type % 9 !== 0 && tile.type % 9 !== 8)!;
  state.players[0].river = [{ tile: terminal, turnId: 1, riichi: false, tsumogiri: false, calledBy: null }];
  state.players[1].river = [{ tile: terminal, turnId: 2, riichi: false, tsumogiri: false, calledBy: null }];
  assert.deepEqual(nagashiPlayerIds(state), ['a', 'b']);
  state.honba = 2; state.riichiSticks = 1;
  const a = nagashiSettlement(state, 'a');
  const b = nagashiSettlement(state, 'b');
  assert.deepEqual(a.payments, { b: 4000, c: 4000, d: 4000 });
  assert.deepEqual(b.payments, { a: 4000, c: 2000, d: 2000 });
  assert.equal(a.winnerGain, 12000);
  assert.equal(b.winnerGain, 8000);
  state.players[0].river[0].calledBy = 'c';
  assert.deepEqual(nagashiPlayerIds(state), ['b']);
  state.players[1].river.push({ tile: simple, turnId: 3, riichi: false, tsumogiri: false, calledBy: null });
  assert.deepEqual(nagashiPlayerIds(state), []);
});

test('sanma nagashi mangan respects the configured tsumo-loss rule', () => {
  const h = harness([], '', rules => { Object.assign(rules, defaultRules(3)); rules.redFives = false; });
  const state = h.engine.hostSnapshot();
  assert.deepEqual(nagashiSettlement(state, 'a').payments, { b: 4000, c: 4000 });
  state.rules.sanmaTsumoLoss = false;
  assert.deepEqual(nagashiSettlement(state, 'a').payments, { b: 6000, c: 6000 });
});

test('two real nagashi mangan winners settle independently at the same exhaustive draw', () => {
  const h = harness(['1199m1199p1199s12z', '1199m1199p1199s3z', '2345678m234567p', '2345678m234567p'], '', rules => {
    rules.abortiveDraws.fourWinds = false; rules.abortiveDraws.fourRiichi = false;
  }, '', wall => {
    for (let turn = 0; turn < 5; turn++) for (const offset of [0, 3]) {
      if (turn === 4 && offset === 3) continue;
      const target = 53 + turn * 4 + offset;
      const source = wall.live.findIndex((tile, index) => index > target && tile.type >= 27);
      assert.ok(source > target);
      [wall.live[target], wall.live[source]] = [wall.live[source], wall.live[target]];
    }
    return wall;
  });
  let steps = 0;
  while (h.engine.hostSnapshot().phase.kind !== 'ROUND_RESULT' && steps++ < 400) {
    const state = h.engine.hostSnapshot();
    if (state.phase.kind === 'WAITING_CALL_RESPONSE') { h.passAll(); continue; }
    if (state.phase.kind !== 'AFTER_DRAW' && state.phase.kind !== 'WAITING_DISCARD') assert.fail('Unexpected phase');
    const actor = state.phase.playerId;
    if (actor !== 'a' && actor !== 'b') { h.discard(actor); continue; }
    const allowed = new Set(state.actions[actor].discardableTileIds);
    const tile = state.players.find(player => player.id === actor)!.hand.find(item => allowed.has(item.id)
      && (item.type >= 27 || item.type % 9 === 0 || item.type % 9 === 8));
    assert.ok(tile, `${actor} ran out of qualifying tiles`);
    h.send(actor, { kind: 'DISCARD', tileId: tile.id });
  }
  const final = h.engine.hostSnapshot();
  assert.ok(steps < 400);
  assert.equal(final.result!.reason, 'nagashi');
  assert.deepEqual(final.result!.nagashiPlayerIds, ['a', 'b']);
  assert.deepEqual(final.result!.deltas, { a: 8000, b: 4000, c: -6000, d: -6000 });
  h.restore();
});
test('four live riichi declarations abort only after the fourth unclaimed discard', () => {
  const h = harness(['123456789m123p55s', '123456789p123s5m', '123456789s123m5p', '1122334455667z']);
  for (const id of ['a', 'b', 'c', 'd']) {
    const before = h.engine.hostSnapshot();
    const action = before.actions[id];
    assert.ok(action.riichiDiscardTileIds.length, `${id} can declare riichi`);
    const tileId = id === 'a'
      ? before.players[0].hand.find(tile => tileCode(tile) === '5s')!.id
      : action.riichiDiscardTileIds.includes(before.players.find(player => player.id === id)!.drawnTileId!)
        ? before.players.find(player => player.id === id)!.drawnTileId!
        : action.riichiDiscardTileIds[0];
    h.send(id, { kind: 'RIICHI', tileId }); h.passAll();
    const after = h.engine.hostSnapshot();
    assert.equal(after.players.find(player => player.id === id)!.riichi, 'double-riichi');
    assert.equal(after.riichiSticks, ['a', 'b', 'c', 'd'].indexOf(id) + 1);
    if (id === 'd') {
      assert.equal(after.result?.reason, 'four-riichi');
      assert.deepEqual(Object.values(after.result!.deltas), [0, 0, 0, 0]);
    } else assert.equal(after.result, undefined);
    conserved(h);
  }
});
test('last live draw and its discard award Haitei or Houtei through real actions', () => {
  const arrangeLastFive = (wall: Wall) => {
    const last = wall.live.length - 1;
    const chosen = wall.live.findIndex((tile, index) => index >= 53 && tileCode(tile) === '5s');
    assert.ok(chosen >= 53);
    [wall.live[chosen], wall.live[last]] = [wall.live[last], wall.live[chosen]];
    let spare = 12;
    for (let index = 53; index < last; index++) if (tileCode(wall.live[index]) === '5s') {
      [wall.live[index], wall.dead[spare]] = [wall.dead[spare], wall.live[index]];
      spare++;
    }
    return wall;
  };
  for (const method of ['tsumo', 'ron'] as const) {
    const hands = method === 'tsumo' ? ['', '123456789p123s5s'] : ['', '', '123456789p123s5s'];
    const h = harness(hands, '', rules => {
      rules.abortiveDraws.fourWinds = false; rules.abortiveDraws.fourRiichi = false;
    }, '', arrangeLastFive);
    let steps = 0;
    while (h.engine.hostSnapshot().wall!.live.length > 0 && steps++ < 300) {
      const state = h.engine.hostSnapshot();
      if (state.phase.kind === 'WAITING_CALL_RESPONSE') h.passAll();
      else if (state.phase.kind === 'AFTER_DRAW' || state.phase.kind === 'WAITING_DISCARD') h.discard(state.phase.playerId);
      else assert.fail(`Unexpected phase ${state.phase.kind}`);
    }
    assert.ok(steps < 300);
    const last = h.engine.hostSnapshot();
    assert.equal(last.phase.kind, 'AFTER_DRAW');
    assert.equal(last.phase.playerId, 'b');
    assert.equal(last.wall!.live.length, 0);
    if (method === 'tsumo') {
      assert.equal(last.actions.b.canTsumo, true);
      h.send('b', { kind: 'TSUMO' });
    } else {
      h.discard('b');
      assert.ok(h.engine.hostSnapshot().actions.c.callOptions.some(option => option.kind === 'ron'));
      h.send('c', { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
    }
    const win = h.engine.hostSnapshot().result!.wins[0];
    assert.ok(win.yaku.includes(method === 'tsumo' ? 'haitei' : 'houtei'));
    conserved(h);
  }
});
test('sanma nuki gives one bonus han on a legal replacement win', () => {
  const h = harness(['123p123s111z555p7z4z'], '', rules => {
    Object.assign(rules, defaultRules(3)); rules.redFives = false;
  }, '7z');
  const tileId = h.engine.hostSnapshot().actions.a.nukiTileIds[0];
  h.send('a', { kind: 'NUKI', tileId }); h.passAll();
  assert.equal(h.engine.hostSnapshot().actions.a.canTsumo, true);
  h.send('a', { kind: 'TSUMO' });
  const win = h.engine.hostSnapshot().result!.wins[0];
  assert.equal(win.bonus.nuki, 1);
  assert.ok(win.yaku.includes('rinshan'));
  conserved(h);
});
test('sanma North robbery restores its response window and scores Ron without chankan', () => {
  const setup = () => harness(['4z', '111z222z333z444p4z'], '', rules => {
    Object.assign(rules, defaultRules(3)); rules.redFives = false;
  }, '7z');
  const h = setup();
  const northId = h.engine.hostSnapshot().actions.a.nukiTileIds[0];
  h.send('a', { kind: 'NUKI', tileId: northId });
  const pending = h.engine.hostSnapshot();
  assert.equal(pending.phase.kind, 'WAITING_CALL_RESPONSE');
  assert.ok(pending.actions.b.callOptions.some(option => option.kind === 'ron'));
  h.restore();
  h.send('b', { kind: 'RESPOND', optionId: 'ron' });
  const result = h.engine.hostSnapshot().result!;
  assert.equal(result.reason, 'ron');
  assert.ok(!result.wins[0].yaku.includes('chankan'));
  assert.equal(h.engine.hostSnapshot().players[0].nuki.length, 0);
  conserved(h);
});
test('pre-nuki winning checkpoint restores without losing its result', () => {
  const h = harness(['123456789m123p55s']);
  h.send('a', { kind: 'TSUMO' });
  const saved = h.engine.exportCheckpoint();
  for (const player of saved.state.players) delete (player as Partial<typeof player>).nuki;
  delete (saved.runtime as Partial<typeof saved.runtime>).pendingNuki;
  for (const win of saved.state.result!.wins) delete (win.bonus as Partial<typeof win.bonus>).nuki;
  const final = saved.state.events.at(-1)!;
  for (const win of (final.data.result as typeof saved.state.result)!.wins) {
    delete (win.bonus as Partial<typeof win.bonus>).nuki;
  }
  const restored = MahjongRoundEngine.restoreCheckpoint(saved, { now: () => 0 });
  assert.equal(restored.hostSnapshot().result!.wins[0].bonus.nuki, 0);
});
test('ankan draws exactly one rinshan, reveals dora, preserves tiles and rejects duplicate/stale actions', () => {
  const h = harness(['1111m234567p789s5z'], '', undefined, '5z');
  const before = h.engine.hostSnapshot();
  const option = before.actions.a.selfKanOptions[0]; assert.ok(option);
  const request = h.request({ kind: 'KAN', optionId: option.id });
  assert.ok(h.engine.dispatch('a', request).ok);
  const state = h.engine.hostSnapshot();
  assert.equal(state.wall!.live.length, before.wall!.live.length - 1);
  assert.equal(state.wall!.dead.length, 14);
  assert.equal(state.wall!.rinshanUsed, 1);
  assert.equal(state.wall!.indicatorsRevealed, 2);
  assert.equal(state.players[0].hand.length, 11);
  assert.equal(state.players[0].melds[0].kind, 'ankan');
  assert.equal(state.players[0].drawnTileId, before.wall!.dead[0].id);
  assert.equal(h.engine.dispatch('a', request).ok, false);
  assert.equal(h.engine.dispatch('a', h.request({ kind: 'KAN', optionId: option.id })).ok, false);
  assert.deepEqual(h.engine.hostSnapshot(), state);
  assert.equal(h.engine.view({ role: 'player', playerId: 'b' }).players[0].hand, undefined);
  assert.ok(state.actions.a.canTsumo);
  h.send('a', { kind: 'TSUMO' });
  const win = h.engine.hostSnapshot().result!.wins[0];
  assert.ok(win.yaku.includes('rinshan'));
  assert.ok(!win.yaku.includes('tenhou') && !win.yaku.includes('haitei'));
  conserved(h);
});
test('daiminkan competes with chi, consumes three physical tiles and keeps source attribution', () => {
  const h = harness(['3m', '12m1468p1468s123z', '333m1246p1468s12z']);
  h.discard('a', '3m');
  const before = h.engine.hostSnapshot();
  const chi = before.actions.b.callOptions.find(option => option.kind === 'chi')!;
  const call = before.actions.c.callOptions.find(option => option.kind === 'daiminkan')!;
  assert.ok(call);
  h.send('b', { kind: 'RESPOND', optionId: chi.id });
  h.send('c', { kind: 'RESPOND', optionId: call.id }); h.passAll();
  const state = h.engine.hostSnapshot();
  assert.deepEqual(state.phase, { kind: 'AFTER_DRAW', playerId: 'c' });
  assert.equal(state.players[2].melds[0].kind, 'daiminkan');
  assert.equal(state.players[2].melds[0].sourcePlayerId, 'a');
  assert.equal(state.players[2].melds[0].calledTileId, state.players[0].river[0].tile.id);
  assert.equal(state.players[2].hand.length, 11);
  assert.equal(state.wall!.rinshanUsed, 1);
  conserved(h);
});
function kakanHarness(secondWinner = false) {
  const h = harness(['4s', '44s123p456m789s12z', '123m456789p23s66m',
    ...(secondWinner ? ['789m123p23s55666z'] : [])], '777z4s');
  h.discard('a', '4s');
  const pon = h.engine.hostSnapshot().actions.b.callOptions.find(option => option.kind === 'pon')!;
  h.send('b', { kind: 'RESPOND', optionId: pon.id }); h.passAll();
  // Self kan is forbidden immediately after a pon; a real draw must precede it.
  assert.deepEqual(h.engine.hostSnapshot().actions.b.selfKanOptions, []);
  h.discard('b', '1z'); h.passAll();
  for (const id of ['c', 'd', 'a']) { h.discard(id); h.passAll(); }
  return h;
}
test('kakan robbery freezes tiles and dora, scores chankan, and never upgrades the pon', () => {
  const h = kakanHarness(); const before = h.engine.hostSnapshot();
  kan(h, 'b', 'kakan');
  const pending = h.engine.hostSnapshot();
  assert.equal(pending.phase.kind, 'WAITING_CALL_RESPONSE');
  assert.deepEqual(pending.wall, before.wall);
  assert.deepEqual(pending.players[1].hand, before.players[1].hand);
  assert.deepEqual(pending.players[1].melds, before.players[1].melds);
  assert.ok(pending.actions.c.callOptions.some(option => option.kind === 'ron'));
  assert.equal(pending.clock, null);
  const visible = h.engine.view({ role: 'player', playerId: 'c' });
  assert.equal(visible.phase.call!.trigger, 'kakan');
  assert.equal(tileCode(visible.phase.call!.tile), '4s');
  assert.equal(visible.players[1].hand, undefined);
  assert.equal(visible.players[1].drawnTileId, undefined);
  h.send('c', { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
  const state = h.engine.hostSnapshot();
  assert.equal(state.result!.reason, 'ron');
  assert.ok(state.result!.wins[0].yaku.includes('chankan'));
  assert.equal(state.players[1].melds[0].kind, 'pon');
  assert.deepEqual(state.wall, before.wall);
  assert.ok(!state.events.some(event => event.type === 'DORA_REVEAL'));
  conserved(h);
});
test('kakan response timeout commits once, marks missed-win furiten and retains pon source', () => {
  const h = kakanHarness(); const before = h.engine.hostSnapshot();
  kan(h, 'b', 'kakan'); h.time(35000); assert.equal(h.engine.tick(), true);
  const state = h.engine.hostSnapshot();
  const meld = state.players[1].melds[0];
  assert.equal(meld.kind, 'kakan'); assert.equal(meld.tiles.length, 4);
  assert.equal(meld.sourcePlayerId, 'a');
  assert.equal(meld.calledTileId, before.players[1].melds[0].calledTileId);
  assert.ok(meld.addedTileId !== null);
  assert.equal(state.players[2].furiten.temporary, true);
  assert.equal(state.wall!.rinshanUsed, 1);
  assert.equal(state.clock!.startedAt, 35000);
  assert.equal(h.engine.tick(), false);
  conserved(h);
});
test('only kokushi can rob ankan; robbery does not consume tiles or reveal dora', () => {
  const h = harness(['1111m234567p789s5z', '99m19p19s1234567z']);
  const before = h.engine.hostSnapshot(); kan(h, 'a');
  const state = h.engine.hostSnapshot();
  assert.equal(state.phase.kind, 'WAITING_CALL_RESPONSE');
  assert.deepEqual(state.wall, before.wall);
  h.send('b', { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
  assert.ok(h.engine.hostSnapshot().result!.wins[0].yaku.includes('kokushi'));
  assert.equal(h.engine.hostSnapshot().players[0].melds.length, 0);
  conserved(h);
  const ordinary = harness(['4444s123456p789m1z', '123m789p23s55666z']);
  kan(ordinary, 'a');
  assert.equal(ordinary.engine.hostSnapshot().phase.kind, 'AFTER_DRAW');
  assert.equal(ordinary.engine.hostSnapshot().players[1].furiten.temporary, false);
});
test('riichi ankan requires the drawn fourth tile and every original winning interpretation', () => {
  for (const [hand, legal] of [['111m234567p789s5z2z', true], ['111222333m456p7s2z', false]] as const) {
    const h = harness([hand], '444z1m');
    const initial = h.engine.hostSnapshot();
    const tileId = initial.players[0].hand.find(tile => tileCode(tile) === '2z')!.id;
    h.send('a', { kind: 'RIICHI', tileId }); h.passAll();
    for (const id of ['b', 'c', 'd']) { h.discard(id); h.passAll(); }
    const state = h.engine.hostSnapshot();
    assert.equal(state.players[0].riichi, 'double-riichi');
    assert.equal(state.players[0].ippatsu, true);
    assert.equal(state.actions.a.selfKanOptions.length, legal ? 1 : 0);
    const ids = state.players[0].hand.filter(tile => tileCode(tile) === '1m').map(tile => tile.id);
    assert.equal(preservesRiichiStructure(state.players[0], ids, 4), legal);
    assert.equal(preservesRiichiStructure({ ...state.players[0], drawnTileId:
      state.players[0].hand.find(tile => tile.type !== 0)!.id }, ids, 4), false);
    if (legal) {
      kan(h, 'a'); h.passAll();
      const after = h.engine.hostSnapshot();
      assert.equal(after.players[0].ippatsu, false);
      assert.deepEqual(after.actions.a.discardableTileIds, [after.players[0].drawnTileId]);
      conserved(h);
    }
  }
});
test('four kans by different players abort after the discard; one player may keep four kans', () => {
  for (const enabled of [true, false]) {
    const h = harness(['111122223333m4z5z', '4444p123s789s123z'], '', rules => { rules.abortiveDraws.fourKans = enabled; }, '567z5s');
    for (let i = 0; i < 3; i++) { kan(h, 'a'); h.passAll(); conserved(h); }
    h.discard('a', '4z'); h.passAll();
    kan(h, 'b'); h.passAll();
    assert.equal(h.engine.hostSnapshot().phase.kind, 'AFTER_DRAW');
    assert.equal(h.engine.hostSnapshot().wall!.indicatorsRevealed, 5);
    assert.deepEqual(h.engine.hostSnapshot().actions.b.selfKanOptions, []);
    h.discard('b'); h.passAll();
    assert.equal(h.engine.hostSnapshot().result?.reason, enabled ? 'four-kans' : undefined);
    conserved(h);
  }
  const solo = harness(['111122223333m4p5z'], '', undefined, '444p6z');
  for (let i = 0; i < 4; i++) { kan(solo, 'a'); solo.passAll(); conserved(solo); }
  assert.equal(solo.engine.hostSnapshot().wall!.rinshanUsed, 4);
  solo.discard('a'); solo.passAll();
  assert.equal(solo.engine.hostSnapshot().result, undefined);
});
test('simultaneous kakan ron waits for both eligible players and settles both winners once', () => {
  const h = kakanHarness(true); kan(h, 'b', 'kakan');
  h.send('d', { kind: 'RESPOND', optionId: 'ron' });
  assert.equal(h.engine.hostSnapshot().phase.kind, 'WAITING_CALL_RESPONSE');
  assert.equal(h.engine.hostSnapshot().wall!.rinshanUsed, 0);
  h.send('c', { kind: 'RESPOND', optionId: 'ron' });
  assert.deepEqual(h.engine.hostSnapshot().result!.wins.map(win => win.playerId), ['c', 'd']);
  conserved(h);
});
test('ron takes priority over four-kan abort after the fourth replacement draw', () => {
  const h = harness(['111122223333m4z5z', '4444p123s789s123z', '123456789s123p5s'], '', undefined, '567z5s');
  for (let i = 0; i < 3; i++) { kan(h, 'a'); h.passAll(); }
  h.discard('a', '4z'); h.passAll(); kan(h, 'b'); h.passAll();
  h.discard('b');
  h.send('c', { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
  assert.equal(h.engine.hostSnapshot().result!.reason, 'ron'); conserved(h);
});
test('another player ankan cancels an established riichi ippatsu', () => {
  const h = harness(['123456789m123p5s5z', '1111s2468p2468s1z'], '4z');
  const tileId = h.engine.hostSnapshot().players[0].hand.find(tile => tileCode(tile) === '5z')!.id;
  h.send('a', { kind: 'RIICHI', tileId }); h.passAll();
  assert.equal(h.engine.hostSnapshot().players[0].ippatsu, true);
  kan(h, 'b'); h.passAll();
  assert.equal(h.engine.hostSnapshot().players[0].ippatsu, false);
  conserved(h);
});
test('sanma kan and final-live-tile kan restriction preserve wall and points', () => {
  const sanma = harness(['1111m234567p789s5z'], '', rules => {
    Object.assign(rules, defaultRules(3)); rules.redFives = false;
  }, '5z');
  kan(sanma, 'a'); sanma.passAll(); conserved(sanma);
  assert.equal(sanma.engine.hostSnapshot().wall!.rinshanUsed, 1);
  const h = harness(['', '1111m2468p2468s1z'], '', rules => { rules.abortiveDraws.fourWinds = false; });
  let steps = 0;
  while (steps++ < 300) {
    const state = h.engine.hostSnapshot();
    if (state.phase.kind === 'WAITING_CALL_RESPONSE') { h.passAll(); continue; }
    assert.equal(state.phase.kind, 'AFTER_DRAW');
    if (state.phase.kind !== 'AFTER_DRAW') assert.fail('Expected turn');
    if (!state.wall!.live.length) {
      assert.equal(state.phase.playerId, 'b');
      assert.equal(state.players[1].hand.filter(tile => tile.type === 0).length, 4);
      assert.deepEqual(state.actions[state.phase.playerId].selfKanOptions, []);
      assert.equal(h.engine.dispatch(state.phase.playerId, h.request({ kind: 'KAN', optionId: 'ankan:invalid' })).ok, false);
      break;
    }
    h.discard(state.phase.playerId);
  }
  assert.ok(steps < 300); conserved(h);
});
test('checkpoint restores waiting draw actions and pauses downtime without resetting time bank', () => {
  const h = harness(); h.time(20000);
  const saved = JSON.parse(JSON.stringify(h.engine.exportCheckpoint()));
  let clock = 10;
  const restored = MahjongRoundEngine.restoreCheckpoint(saved, { now: () => clock, random: () => { throw new Error('No RNG on restore'); } });
  assert.deepEqual(restored.hostSnapshot(), h.engine.hostSnapshot());
  clock = 25009; assert.equal(restored.tick(), false);
  clock = 25010; assert.equal(restored.tick(), true);
  assert.equal(restored.hostSnapshot().players[0].bankMs, 0);
  assert.equal(restored.hostSnapshot().players[0].river.length, 1);
  assert.equal(restored.tick(), false);
});
test('checkpoint restores partially answered multi-ron window and committed action IDs', () => {
  const h = harness(multiHands); h.discard('a', '5s');
  const request = h.request({ kind: 'RESPOND', optionId: 'ron' });
  assert.ok(h.engine.dispatch('d', request).ok);
  h.restore();
  assert.deepEqual(h.engine.dispatch('d', request), { ok: false, error: 'DUPLICATE' });
  h.send('b', { kind: 'RESPOND', optionId: 'ron' });
  h.restore(); h.send('c', { kind: 'RESPOND', optionId: 'ron' });
  assert.deepEqual(h.engine.hostSnapshot().result!.wins.map(win => win.playerId), ['b', 'c', 'd']);
  h.restore(); assert.equal(h.engine.dispatch('a', h.request({ kind: 'TSUMO' })).ok, false); conserved(h);
});
test('checkpoint pending riichi resumes once; ron still cancels its deposit', () => {
  for (const ron of [true, false]) {
    const h = harness(['123456789m123p55s', '123456789p123s5s']);
    const tileId = h.engine.hostSnapshot().players[0].hand.find(tile => tileCode(tile) === '5s')!.id;
    h.send('a', { kind: 'RIICHI', tileId }); h.restore();
    if (ron) h.send('b', { kind: 'RESPOND', optionId: 'ron' });
    h.passAll();
    const state = h.engine.hostSnapshot();
    assert.equal(state.riichiSticks, ron ? 0 : 1);
    assert.equal(state.players[0].riichi, ron ? 'none' : 'double-riichi');
    h.restore(); conserved(h);
  }
});
test('checkpoint preserves pon kuikae and rejects changed forbidden discards', () => {
  const h = harness(['3m', '333m1246p1468s12z']); h.discard('a', '3m');
  const pon = h.engine.hostSnapshot().actions.b.callOptions.find(option => option.kind === 'pon')!;
  h.send('b', { kind: 'RESPOND', optionId: pon.id }); h.passAll(); h.restore();
  const state = h.engine.hostSnapshot(); const third = state.players[1].hand.find(tile => tileCode(tile) === '3m')!;
  assert.equal(h.engine.dispatch('b', h.request({ kind: 'DISCARD', tileId: third.id })).ok, false);
  const saved = h.engine.exportCheckpoint(); saved.runtime.forbiddenDiscardTypes = [];
  assert.throws(() => MahjongRoundEngine.restoreCheckpoint(saved, { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
  h.discard('b'); h.passAll(); h.restore(); conserved(h);
});
test('checkpoint preserves robbery before kakan commit, timeout and rinshan after commit', () => {
  for (const ron of [false, true]) {
    const h = kakanHarness(); kan(h, 'b', 'kakan'); h.restore();
    assert.equal(h.engine.hostSnapshot().players[1].melds[0].kind, 'pon');
    assert.equal(h.engine.hostSnapshot().wall!.rinshanUsed, 0);
    if (ron) { h.send('c', { kind: 'RESPOND', optionId: 'ron' }); h.passAll(); }
    else { h.time(35000); assert.ok(h.engine.tick()); }
    h.restore();
    assert.equal(h.engine.hostSnapshot().wall!.rinshanUsed, ron ? 0 : 1);
    if (!ron) assert.equal(h.engine.hostSnapshot().players[2].furiten.temporary, true);
    conserved(h);
  }
  const h = harness(['1111m234567p789s5z'], '', undefined, '5z'); kan(h, 'a'); h.restore();
  h.send('a', { kind: 'TSUMO' }); assert.ok(h.engine.hostSnapshot().result!.wins[0].yaku.includes('rinshan'));
});
test('checkpoint rejects malformed versions, tiles, totals, timers, prompts, dedup and metadata', () => {
  const h = harness(); const original = h.engine.exportCheckpoint();
  const corruptions: ((saved: typeof original) => void)[] = [
    saved => { saved.version = 2 as 1; },
    saved => { saved.state.wall!.live[0] = saved.state.wall!.live[1]; },
    saved => { saved.state.players[0].points++; },
    saved => { saved.state.clock!.playerId = 'b'; },
    saved => { saved.runtime.lastNow = Infinity; },
    saved => { saved.runtime.pendingRiichi = 'missing'; },
    saved => { saved.runtime.committedActions = ['["missing","action"]']; },
    saved => { saved.runtime.firstCycleInterrupted = true; },
    saved => { saved.state.events[0].sequenceId = 100; },
  ];
  for (const corrupt of corruptions) {
    const saved = structuredClone(original); corrupt(saved);
    assert.throws(() => MahjongRoundEngine.restoreCheckpoint(saved, { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
  }
  const call = kakanHarness(); kan(call, 'b', 'kakan'); const saved = call.engine.exportCheckpoint();
  if (saved.state.phase.kind !== 'WAITING_CALL_RESPONSE') assert.fail();
  saved.state.phase.window.eligible.c[0].consumeTileIds = [999];
  assert.throws(() => MahjongRoundEngine.restoreCheckpoint(saved, { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
  assert.deepEqual(h.engine.exportCheckpoint(), original);
});
test('expired response checkpoint stays expired after restart and resolves only once', () => {
  const h = kakanHarness(); kan(h, 'b', 'kakan'); h.time(36000);
  const saved = JSON.parse(JSON.stringify(h.engine.exportCheckpoint()));
  const restored = MahjongRoundEngine.restoreCheckpoint(saved, { now: () => 0 });
  assert.equal(restored.dispatch('c', h.request({ kind: 'RESPOND', optionId: 'ron' })).ok, false);
  assert.equal(restored.tick(), true);
  assert.equal(restored.hostSnapshot().wall!.rinshanUsed, 1);
  assert.equal(restored.tick(), false);
  assert.equal(restored.hostSnapshot().players[2].furiten.temporary, true);
});
test('ankan kokushi robbery checkpoint retains its restricted window and no early dora', () => {
  const h = harness(['1111m234567p789s5z', '99m19p19s1234567z']); kan(h, 'a'); h.restore();
  assert.equal(h.engine.hostSnapshot().wall!.indicatorsRevealed, 1);
  h.send('b', { kind: 'RESPOND', optionId: 'ron' }); h.passAll(); h.restore();
  assert.ok(h.engine.hostSnapshot().result!.wins[0].yaku.includes('kokushi')); conserved(h);
});
console.log(`Virtual round: ${groups} groups passed. Match lifecycle is covered separately; LAN remains pending.`);


test('response bank starts after five seconds, stops on response and survives restore', () => {
  const h = harness(['3m', '12m1468p1468s123z', '333m1246p1468s12z']);
  h.discard('a', '3m');
  const initial = h.engine.hostSnapshot();
  assert.equal(h.engine.view({role:'player',playerId:'b'}).phase.responseDeadline,35000);
  h.time(6000); h.send('b',{kind:'RESPOND',optionId:'pass'});
  assert.equal(h.engine.hostSnapshot().players[1].bankMs,29000);
  assert.equal(h.engine.view({role:'player',playerId:'b'}).phase.responseClock,undefined);
  h.restore();
  h.time(9000); h.send('c',{kind:'RESPOND',optionId:initial.actions.c.callOptions.find(o=>o.kind==='pon')!.id}); h.passAll();
  assert.equal(h.engine.hostSnapshot().players[1].bankMs,29000);
  assert.equal(h.engine.hostSnapshot().players[2].bankMs,26000);
  assert.equal(h.engine.hostSnapshot().clock!.bankMs,26000);
});

test('individual response expiration and corrupted timing checkpoints', () => {
  const h = harness(['3m', '12m1468p1468s123z', '333m1246p1468s12z']);
  const saved=h.engine.exportCheckpoint(); saved.state.players[1].bankMs=1000;
  let now=0; const e=MahjongRoundEngine.restoreCheckpoint(saved,{now:()=>now});
  assert(e.dispatch('a',h.request({kind:'DISCARD',tileId:saved.state.players[0].hand.find(t=>tileCode(t)==='3m')!.id})).ok);
  assert.equal(e.view({role:'player',playerId:'b'}).phase.responseDeadline,6000);
  assert.equal(e.view({role:'player',playerId:'c'}).phase.responseDeadline,35000);
  now=6000;
  const st=e.hostSnapshot();
  assert.equal(e.dispatch('b',{kind:'RESPOND',optionId:'pass',gameId:st.gameId,roundId:st.roundId,turnId:st.turnId,actionId:'late'}).ok,false);
  assert(e.tick()); assert.equal(e.tick(),false);
  assert.equal(e.hostSnapshot().players[1].bankMs,0);
  assert.equal(e.view({role:'player',playerId:'b'}).availableActions.canPass,false);
  assert.equal(e.view({role:'player',playerId:'c'}).availableActions.canPass,true);
  const checkpoint=e.exportCheckpoint();
  MahjongRoundEngine.restoreCheckpoint(checkpoint,{now:()=>999999});
  for(const mutate of [
    (v:typeof checkpoint)=>{if(v.state.phase.kind==='WAITING_CALL_RESPONSE')v.state.phase.window.timing!.banks.b++;},
    (v:typeof checkpoint)=>{if(v.state.phase.kind==='WAITING_CALL_RESPONSE')v.state.phase.window.timing!.respondedAt.b++;},
    (v:typeof checkpoint)=>{if(v.state.phase.kind==='WAITING_CALL_RESPONSE')v.state.phase.window.deadline++;},
    (v:typeof checkpoint)=>v.state.players[1].bankMs++,
  ]) { const bad=structuredClone(checkpoint);mutate(bad);assert.throws(()=>MahjongRoundEngine.restoreCheckpoint(bad,{now:()=>0}),/INVALID_HOST_CHECKPOINT/); }
  now=35000;assert(e.tick());assert.equal(e.hostSnapshot().players[2].bankMs,0);
});

test('legacy response save retains fixed-only deadline without spending bank', () => {
  const h=harness(['3m','12m1468p1468s123z','333m1246p1468s12z']);h.discard('a','3m');
  const saved=h.engine.exportCheckpoint();if(saved.state.phase.kind!=='WAITING_CALL_RESPONSE')assert.fail();
  delete saved.state.phase.window.timing;saved.state.phase.window.deadline=5000;
  let now=0;const e=MahjongRoundEngine.restoreCheckpoint(saved,{now:()=>now});now=5000;
  assert(e.tick());assert.equal(e.hostSnapshot().players[1].bankMs,30000);
});
