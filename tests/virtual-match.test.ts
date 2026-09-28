import assert from 'node:assert/strict';
import { MahjongMatchEngine } from '../lib/virtual-mahjong/match-engine';
import { progression, rankMatch } from '../lib/virtual-mahjong/match-progression';
import { MahjongRoundEngine, type RoundIntent, type HostDependencies } from '../lib/virtual-mahjong/round-engine';
import { defaultRules, validateRules } from '../lib/virtual-mahjong/rules';
import { createTiles, tileCode, type Tile } from '../lib/virtual-mahjong/tiles';
import { createWall } from '../lib/virtual-mahjong/wall';
import { projectForViewer } from '../lib/virtual-mahjong/projection';
import type { AuthoritativeGameState, Rules, RoundResult, WinScore } from '../lib/virtual-mahjong/model';

let groups = 0;
function test(name: string, run: () => void) { run(); groups++; console.log(`PASS virtual match: ${name}`); }
const ids = ['a', 'b', 'c', 'd'];
const players = ids.map(id => ({ id, name: id }));
function rng(seed = 20260910) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }; }

/** Fixtures specify relative seats, so dealing remains correct after every rotation. */
function wall(rules: Rules, dealerSeat: number, requested: string[]) {
  const pool = createTiles(rules.players, rules.redFives);
  const relative = Array.from({ length: rules.players }, (_, index) => [...(requested[index] ?? '').matchAll(/([0-9]+)([mpsz])/g)]
    .flatMap(match => match[1].split('').map(digit => {
      const at = pool.findIndex(tile => tileCode(tile) === digit + match[2]);
      assert.ok(at >= 0, `Missing fixture tile ${digit}${match[2]}`);
      return pool.splice(at, 1)[0];
    })));
  relative.forEach((hand, seat) => {
    assert.ok(hand.length <= (seat === 0 ? 14 : 13));
    while (hand.length < (seat === 0 ? 14 : 13)) hand.push(pool.shift()!);
  });
  const dealt: Tile[] = [];
  for (let packet = 0; packet < 3; packet++) for (const hand of relative) dealt.push(...hand.slice(packet * 4, packet * 4 + 4));
  for (const hand of relative) dealt.push(hand[12]);
  dealt.push(relative[0][13]);
  // dealHands assigns this dealer-first packet sequence to actual seats.
  assert.ok(dealerSeat >= 0 && dealerSeat < rules.players);
  return { live: [...dealt, ...pool.slice(0, -14)], dead: pool.slice(-14), rinshanUsed: 0, indicatorsRevealed: 1 };
}
function harness(configure?: (rules: Rules) => void, makeWall?: HostDependencies['makeWall'], dealerSeat = 0) {
  const rules = defaultRules(); rules.redFives = false; configure?.(rules);
  let now = 0; let sequence = 0;
  const host = { now: () => now, random: rng(), makeWall };
  let engine = new MahjongMatchEngine({ gameId: 'match', rules, players: players.slice(0, rules.players), dealerSeat }, host);
  function request(intent: RoundIntent, actionId = `action:${++sequence}`) {
    const state = engine.hostSnapshot();
    return { ...intent, actionId, gameId: state.gameId, roundId: state.roundId, turnId: state.turnId };
  }
  function send(actor: string, intent: RoundIntent, actionId?: string) {
    const response = engine.dispatch(actor, request(intent, actionId)); assert.ok(response.ok, JSON.stringify(response));
  }
  function passAll() {
    const state = engine.hostSnapshot();
    if (state.phase.kind !== 'WAITING_CALL_RESPONSE') return;
    for (const id of Object.keys(state.phase.window.eligible)) if (!Object.hasOwn(state.phase.window.responses, id)) {
      send(id, { kind: 'RESPOND', optionId: 'pass' });
    }
  }
  function discard(actor: string, code?: string, actionId?: string) {
    const state = engine.hostSnapshot(); const player = state.players.find(item => item.id === actor)!;
    const tileId = code ? player.hand.find(tile => tileCode(tile) === code)!.id
      : state.actions[actor].discardableTileIds.includes(player.drawnTileId ?? -1) ? player.drawnTileId! : state.actions[actor].discardableTileIds[0];
    send(actor, { kind: 'DISCARD', tileId }, actionId);
  }
  function next() { const state = engine.hostSnapshot(); assert.ok(engine.advanceRound(state).ok); }
  function restore() {
    const before = engine.hostSnapshot(); const view = engine.view({ role: 'player', playerId: 'a' });
    engine = MahjongMatchEngine.restoreCheckpoint(JSON.parse(JSON.stringify(engine.exportCheckpoint())), host);
    assert.deepEqual(engine.hostSnapshot(), before);
    assert.deepEqual(engine.view({ role: 'player', playerId: 'a' }), view);
  }
  return { get engine() { return engine; }, rules, request, send, passAll, discard, next, restore, time: (time: number) => { now = time; } };
}
function conserved(state: AuthoritativeGameState) {
  assert.equal(state.players.reduce((sum, player) => sum + player.points, state.riichiSticks * 1000),
    state.rules.startingPoints * state.rules.players);
  const tiles = [...state.wall!.live, ...state.wall!.dead, ...state.players.flatMap(player => [...player.hand,
    ...player.melds.flatMap(meld => meld.tiles), ...player.river.filter(item => !item.calledBy).map(item => item.tile)])];
  assert.equal(tiles.length, state.rules.players === 4 ? 136 : 108);
  assert.equal(new Set(tiles.map(tile => tile.id)).size, tiles.length);
}
/** Pure policy tests use already-settled states; integration tests below use actual actions. */
function resultState(reason: RoundResult['reason'] = 'exhaustive') {
  const state = harness().engine.hostSnapshot();
  state.phase = { kind: 'ROUND_RESULT' };
  state.result = { reason, wins: [], tenpaiPlayerIds: [], deltas: { a: 0, b: 0, c: 0, d: 0 } };
  state.honba = 2; state.riichiSticks = 1;
  state.players[0].points -= 1000;
  return state;
}
function setWins(state: AuthoritativeGameState, winners: string[]) {
  state.result!.reason = 'ron';
  state.result!.wins = winners.map(playerId => ({ playerId } as WinScore));
  state.riichiSticks = 0; state.players[0].points += 1000;
}
test('match rule validation rejects malformed switches and non-zero-sum uma', () => {
  for (const count of [3, 4] as const) validateRules(defaultRules(count));
  const rules = defaultRules(); rules.match.uma = [20, 10, -10, -10]; assert.throws(() => validateRules(rules));
  rules.match.uma = [20, 10, -10, -20]; validateRules(rules);
  rules.match.extension = 'forever' as 'none'; assert.throws(() => validateRules(rules));
});
test('dealer win or multi-ron repeat, nondealer win rotates and clears honba', () => {
  for (const winners of [['a'], ['b', 'a'], ['b']]) {
    const state = resultState(); setWins(state, winners);
    const next = progression(state, 0); assert.equal(next.kind, 'next');
    if (next.kind !== 'next') return;
    assert.equal(next.dealerSeat, winners.includes('a') ? 0 : 1);
    assert.equal(next.carry.honba, winners.includes('a') ? 3 : 0);
    assert.equal(next.carry.handNumber, winners.includes('a') ? 1 : 2);
  }
});
test('exhaustive draws always add honba; only tenpai dealer repeats; all aborts repeat', () => {
  for (const tenpai of [[], ['b'], ['a'], ids]) {
    const state = resultState(); state.result!.tenpaiPlayerIds = tenpai;
    const next = progression(state, 0); assert.equal(next.kind, 'next');
    if (next.kind !== 'next') return;
    assert.equal(next.dealerSeat, tenpai.includes('a') ? 0 : 1);
    assert.equal(next.carry.honba, 3); assert.equal(next.carry.riichiSticks, 1);
  }
  for (const reason of ['nine-terminals', 'four-winds', 'four-kans', 'four-riichi', 'triple-ron'] as const) {
    const state = resultState(reason); state.roundWind = 'south'; state.handNumber = 4;
    state.players[0].points = 40000;
    const next = progression(state, 0); assert.equal(next.kind, 'next');
    if (next.kind === 'next') { assert.equal(next.dealerSeat, 0); assert.equal(next.carry.honba, 3); }
  }
});
test('nagashi mangan follows exhaustive-draw dealer tenpai and carries deposits', () => {
  for (const tenpai of [[], ['a'], ['b']]) {
    const state = resultState('nagashi');
    state.result!.nagashiPlayerIds = ['a'];
    state.result!.tenpaiPlayerIds = tenpai;
    const next = progression(state, 0);
    assert.equal(next.kind, 'next');
    if (next.kind !== 'next') continue;
    assert.equal(next.dealerSeat, tenpai.includes('a') ? 0 : 1);
    assert.equal(next.carry.honba, 3);
    assert.equal(next.carry.riichiSticks, 1);
  }
});
test('nominal rounds, south/west extension, target and hard extension limit are distinct', () => {
  for (const length of ['east', 'hanchan'] as const) {
    const state = resultState(); state.rules.length = length; state.roundWind = length === 'east' ? 'east' : 'south'; state.handNumber = 4;
    const next = progression(state, 0); assert.equal(next.kind, 'next');
    if (next.kind !== 'next') return;
    assert.equal(next.carry.roundWind, length === 'east' ? 'south' : 'west'); assert.equal(next.carry.handNumber, 1);
    state.rules.match.extension = 'none'; assert.deepEqual(progression(state, 0), { kind: 'end', reason: 'scheduled-end' });
    state.rules.match.extension = 'one-wind'; state.players[1].points = 30000;
    assert.deepEqual(progression(state, 0), { kind: 'end', reason: 'scheduled-end' });
    state.roundWind = next.carry.roundWind; state.handNumber = 1;
    assert.deepEqual(progression(state, 0), { kind: 'end', reason: 'extension-target' });
    state.players[1].points = 25000; state.handNumber = 4; state.result!.tenpaiPlayerIds = ['a'];
    assert.deepEqual(progression(state, 0), { kind: 'end', reason: 'extension-limit' });
  }
});
test('last dealer top can end on win/tenpai only with the corresponding switch and target', () => {
  for (const win of [true, false]) {
    const state = resultState(); state.roundWind = 'south'; state.handNumber = 4;
    if (win) setWins(state, ['a']); else state.result!.tenpaiPlayerIds = ['a'];
    state.players[0].points = 30000;
    assert.deepEqual(progression(state, 0), { kind: 'end', reason: 'dealer-end' });
    state.rules.match[win ? 'dealerWinEnd' : 'dealerTenpaiEnd'] = false;
    assert.equal(progression(state, 0).kind, 'next');
    state.rules.match[win ? 'dealerWinEnd' : 'dealerTenpaiEnd'] = true;
    state.players[1].points = 31000; assert.equal(progression(state, 0).kind, 'next');
    state.players[1].points = 25000; state.players[0].points = 29900; assert.equal(progression(state, 0).kind, 'next');
  }
});
test('negative points trigger bankruptcy, exact zero does not, and switch may disable it', () => {
  const state = resultState(); state.players[1].points = -100;
  assert.deepEqual(progression(state, 0), { kind: 'end', reason: 'bankruptcy' });
  state.rules.match.bankruptcy = false; assert.equal(progression(state, 0).kind, 'next');
  state.rules.match.bankruptcy = true; state.players[1].points = 0; assert.equal(progression(state, 0).kind, 'next');
});
test('rank ties use initial East, remaining deposits go to top once, return/oka/uma sum to zero', () => {
  const state = resultState(); state.riichiSticks = 2;
  state.players.forEach(player => { player.points = 25000; }); state.players[0].points = 23000;
  state.rules.match.uma = [20, 10, -10, -20];
  const result = rankMatch(state, 2, 'scheduled-end');
  assert.deepEqual(result.rankings.map(rank => rank.playerId), ['c', 'd', 'b', 'a']);
  assert.deepEqual(result.depositAward, { playerId: 'c', points: 2000 });
  assert.equal(result.rankings[0].points, 27000); assert.equal(result.rankings[0].oka, 20000);
  assert.equal(result.rankings.reduce((sum, rank) => sum + rank.score, 0), 0);
  assert.equal(state.riichiSticks, 2); // Pure policy must not pay anything itself.
});
test('actual riichi then abort carries points/deposit/honba and resets clocks, hands and dedup', () => {
  const h = harness(rules => { rules.match.bankruptcy = false; },
    (rules, context) => wall(rules, context.dealerSeat, ['123456789m123p55s', '19m19p19s1234567z']));
  const before = h.engine.hostSnapshot(); h.time(20000);
  const tileId = before.players[0].hand.find(tile => tileCode(tile) === '5s')!.id;
  const old = h.request({ kind: 'RIICHI', tileId }, 'reused');
  assert.ok(h.engine.dispatch('a', old).ok); h.passAll();
  assert.equal(h.engine.hostSnapshot().players[0].bankMs, 25000);
  h.send('b', { kind: 'ABORT_NINE_TERMINALS' });
  const ended = h.engine.hostSnapshot(); assert.equal(ended.phase.kind, 'ROUND_RESULT');
  h.next(); const next = h.engine.hostSnapshot();
  assert.equal(next.honba, 1); assert.equal(next.riichiSticks, 1); assert.equal(next.players[0].points, 24000);
  assert.equal(next.players[0].bankMs, 30000); assert.equal(next.players[0].riichi, 'none');
  assert.ok(next.players.every(player => !player.river.length && !player.melds.length && !player.furiten.temporary && !player.furiten.riichi));
  assert.equal(next.clock!.startedAt, 20000); assert.equal(next.wall!.rinshanUsed, 0);
  assert.equal(h.engine.dispatch('a', old).ok, false);
  assert.equal(h.engine.advanceRound(ended).ok, false);
  h.send('a', { kind: 'TSUMO' }, 'reused');
  const won = h.engine.hostSnapshot(); const score = won.result!.wins[0];
  assert.equal(score.winnerGain - Object.values(score.payments).reduce((sum, value) => sum + value, 0), 1000);
  assert.ok(Object.values(score.payments).every(value => value % 1000 === 100));
  assert.equal(won.riichiSticks, 0); conserved(won);
});
test('failed next wall and backwards clock preserve completed round and allow retry', () => {
  let fail = false;
  const h = harness(undefined, (rules, context) => {
    if (fail) throw new Error('fixture wall unavailable');
    return wall(rules, context.dealerSeat, ['19m19p19s1234567z1m']);
  });
  assert.equal(h.engine.advanceRound(h.engine.hostSnapshot()).ok, false);
  h.time(100); h.send('a', { kind: 'ABORT_NINE_TERMINALS' });
  const before = h.engine.hostSnapshot(); fail = true;
  assert.equal(h.engine.advanceRound(before).ok, false); assert.deepEqual(h.engine.hostSnapshot(), before);
  fail = false; h.time(99); assert.equal(h.engine.advanceRound(before).ok, false);
  assert.deepEqual(h.engine.hostSnapshot(), before);
  h.time(101); h.next(); assert.equal(h.engine.hostSnapshot().roundId, 'match:round:2');
});
test('full scripted hanchan uses real ron, rotates every seat, preserves privacy and ends exactly once', () => {
  for (const count of [3, 4] as const) {
    const h = harness(rules => { Object.assign(rules, defaultRules(count)); rules.redFives = false;
      rules.startingPoints = 100000; rules.returnPoints = 100000; },
    (rules, context) => wall(rules, context.dealerSeat, ['5s', '123456789p123s5s']), count - 1);
    const seen: string[] = []; let previousRevision = 0;
    for (let round = 0; round < count * 2; round++) {
      const state = h.engine.hostSnapshot(); const dealer = state.players.find(player => player.id === state.dealerId)!;
      seen.push(`${state.roundWind}:${state.handNumber}`);
      assert.equal(dealer.seat, (count - 1 + round) % count);
      assert.equal(state.players.filter(player => player.hand.length === 14)[0].id, dealer.id);
      assert.ok(state.revision > previousRevision);
      h.discard(dealer.id, '5s', 'same-id-each-round');
      h.restore(); // Real pending response, including all previous rounds, survives a restart.
      const winner = state.players[(dealer.seat + 1) % count];
      h.send(winner.id, { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
      const ended = h.engine.hostSnapshot(); previousRevision = ended.revision; conserved(ended);
      h.restore();
      const view = h.engine.view({ role: 'player', playerId: dealer.id });
      assert.ok(view.players.filter(player => player.id !== dealer.id).every(player => !player.hand && player.drawnTileId === undefined));
      if (round + 1 < count * 2) { assert.equal(ended.phase.kind, 'ROUND_RESULT'); h.next(); }
    }
    const final = h.engine.hostSnapshot(); assert.equal(final.phase.kind, 'MATCH_RESULT');
    assert.deepEqual(seen, ['east', 'south'].flatMap(wind => Array.from({ length: count }, (_, i) => `${wind}:${i + 1}`)));
    assert.equal(final.events.filter(event => event.type === 'GAME_START').length, 1);
    assert.equal(final.events.filter(event => event.type === 'ROUND_START').length, count * 2);
    assert.equal(final.events.filter(event => event.type === 'MATCH_END').length, 1);
    assert.deepEqual(final.events.map(event => event.sequenceId), final.events.map((_, i) => i + 1));
    assert.equal(h.engine.advanceRound(final).ok, false); assert.equal(h.engine.tick(), false);
    assert.equal(h.engine.dispatch('a', h.request({ kind: 'TSUMO' })).ok, false);
    assert.deepEqual(h.engine.hostSnapshot(), final);
    assert.equal(final.matchResult!.rankings.reduce((sum, rank) => sum + rank.score, 0), 0);
    assert.deepEqual(h.engine.view({ role: 'spectator' }).matchResult, final.matchResult);
  }
});
test('configured east-only matches end after one dealer rotation in three- and four-player rooms', () => {
  for (const count of [3, 4] as const) {
    const h = harness(rules => {
      Object.assign(rules, defaultRules(count));
      rules.redFives = false;
      rules.length = 'east';
      rules.match.extension = 'none';
      rules.startingPoints = 100000;
      rules.returnPoints = 100000;
    }, (rules, context) => wall(rules, context.dealerSeat, ['5s', '123456789p123s5s']));
    for (let hand = 1; hand <= count; hand++) {
      const before = h.engine.hostSnapshot();
      assert.equal(before.roundWind, 'east');
      assert.equal(before.handNumber, hand);
      const dealer = before.players.find(player => player.id === before.dealerId)!;
      h.discard(dealer.id, '5s');
      const winner = before.players[(dealer.seat + 1) % count];
      h.send(winner.id, { kind: 'RESPOND', optionId: 'ron' }); h.passAll();
      const after = h.engine.hostSnapshot(); conserved(after);
      if (hand < count) h.next();
    }
    const final = h.engine.hostSnapshot();
    assert.equal(final.phase.kind, 'MATCH_RESULT');
    assert.equal(final.matchResult!.reason, 'scheduled-end');
    assert.equal(final.events.filter(event => event.type === 'ROUND_START').length, count);
    assert.equal(final.events.filter(event => event.type === 'MATCH_END').length, 1);
    assert.equal(final.matchResult!.rankings.reduce((sum, rank) => sum + rank.score, 0), 0);
    h.restore(); assert.deepEqual(h.engine.hostSnapshot(), final);
  }
});
test('seeded draw-only hanchan reaches its extension limit through actual exhausted rounds', () => {
  let first = true; const random = rng();
  const h = harness(rules => { rules.returnPoints = 100000; rules.abortiveDraws.fourWinds = false; }, (rules, context) => {
    if (first) { first = false; return wall(rules, context.dealerSeat, ['123456789m123p55s']); }
    return createWall(rules.players, rules.redFives, random);
  });
  const tileId = h.engine.hostSnapshot().players[0].hand.find(tile => tileCode(tile) === '5s')!.id;
  h.send('a', { kind: 'RIICHI', tileId }); h.passAll();
  let rounds = 0; let steps = 0;
  while (steps++ < 2500) {
    const state = h.engine.hostSnapshot();
    if (state.phase.kind === 'MATCH_RESULT') break;
    if (state.phase.kind === 'ROUND_RESULT') {
      if (!rounds) assert.ok(state.result!.tenpaiPlayerIds.includes('a'));
      rounds++; conserved(state); h.next();
      const next = h.engine.hostSnapshot();
      assert.deepEqual(next.players.map(player => player.points), state.players.map(player => player.points));
      assert.equal(next.riichiSticks, 1);
      if (rounds === 1) { assert.equal(next.dealerId, 'a'); assert.equal(next.handNumber, 1); assert.equal(next.honba, 1); }
      continue;
    }
    if (state.phase.kind === 'WAITING_CALL_RESPONSE') {
      h.time(state.phase.window.deadline); assert.ok(h.engine.tick());
    } else if (state.phase.kind === 'AFTER_DRAW' || state.phase.kind === 'WAITING_DISCARD') {
      if (!state.wall!.live.length) {
        h.time(state.clock!.startedAt + state.clock!.fixedMs + state.clock!.bankMs); assert.ok(h.engine.tick());
      } else h.discard(state.phase.playerId);
    }
    else assert.fail(`Unexpected phase ${state.phase.kind}`);
  }
  assert.ok(steps < 2500);
  const final = h.engine.hostSnapshot(); conserved(final);
  assert.ok(rounds >= 11); assert.equal(final.roundWind, 'west'); assert.equal(final.handNumber, 4);
  assert.equal(final.matchResult!.reason, 'extension-limit');
  assert.equal(final.matchResult!.depositAward.points, 1000);
  assert.equal(final.riichiSticks, 0);
  assert.equal(final.events.filter(event => event.data.reason === 'remaining-deposits').length, 1);
  h.restore(); h.restore(); // Reconstruct terminal payout without paying it twice.
  assert.equal(h.engine.tick(), false); assert.deepEqual(h.engine.hostSnapshot(), final);
  assert.ok(Math.abs(final.matchResult!.rankings.reduce((sum, rank) => sum + rank.score, 0)) < 1e-9);
});
test('actual bankrupting tsumo ends immediately with public winner result and frozen actions', () => {
  const h = harness(rules => { rules.startingPoints = 1000; },
    (rules, context) => wall(rules, context.dealerSeat, ['123456789m123p55s']));
  h.send('a', { kind: 'TSUMO' });
  const state = h.engine.hostSnapshot();
  assert.equal(state.phase.kind, 'MATCH_RESULT'); assert.equal(state.matchResult!.reason, 'bankruptcy');
  const view = h.engine.view({ role: 'player', playerId: 'b' });
  assert.equal(view.result!.wins[0].playerId, 'a');
  assert.equal(view.result!.wins[0].concealed.length, 14);
  assert.equal(view.players[2].hand, undefined);
  assert.equal(view.availableActions.canTsumo, false); assert.equal(view.clock, null); conserved(state);
});
test('terminal projection excludes injected private fields and does not leak previous hands', () => {
  const state = resultState(); state.phase = { kind: 'MATCH_RESULT' }; state.matchResult = rankMatch(state, 0, 'scheduled-end');
  Object.assign(state.matchResult, { secret: 'private-canary' });
  Object.assign(state.matchResult.rankings[0], { hand: 'private-canary' });
  Object.assign(state.rules.match, { seed: 'private-canary' });
  const view = projectForViewer(state, { role: 'spectator' });
  assert.ok(!JSON.stringify(view).includes('private-canary')); assert.ok(!JSON.stringify(view).includes('events'));
  view.matchResult!.rankings[0].points = -1; assert.notEqual(state.matchResult.rankings[0].points, -1);
  state.phase = { kind: 'AFTER_DRAW', playerId: 'a' };
  assert.equal(projectForViewer(state, { role: 'spectator' }).matchResult, undefined);
});
test('trusted round carry rejects invalid scores, counters, wind and broken conservation', () => {
  const rules = defaultRules();
  const options = { gameId: 'g', roundId: 'r', rules, players, dealerSeat: 1 };
  const carry = { roundWind: 'south' as const, handNumber: 2, honba: 3, riichiSticks: 0,
    points: { a: 25000, b: 25000, c: 25000, d: 25000 } };
  const host = { now: () => 0, makeWall: () => createWall(4, true, rng()) };
  const valid = new MahjongRoundEngine({ ...options, carry }, host).hostSnapshot();
  assert.equal(valid.roundWind, 'south'); assert.equal(valid.dealerId, 'b');
  for (const change of [{ honba: -1 }, { handNumber: 5 }, { riichiSticks: 1 }, { points: { ...carry.points, a: NaN } }]) {
    assert.throws(() => new MahjongRoundEngine({ ...options, carry: { ...carry, ...change } }, host));
  }
});
test('match checkpoint rejects missing history, mismatched rules, revision and terminal flags', () => {
  const h = harness(undefined, (rules, context) => wall(rules, context.dealerSeat, ['19m19p19s1234567z1m']));
  h.send('a', { kind: 'ABORT_NINE_TERMINALS' }); h.next();
  const before = h.engine.exportCheckpoint();
  const changes: ((saved: typeof before) => void)[] = [
    saved => { saved.history = []; }, saved => { saved.roundNumber++; },
    saved => { saved.revision = 0; }, saved => { saved.options.rules.startingPoints++; },
    saved => { saved.options.dealerSeat = 4; }, saved => { saved.finished = true; },
    saved => { saved.lastNow = -1; }, saved => { saved.history[0].sequenceId = 2; },
  ];
  for (const change of changes) {
    const saved = structuredClone(before); change(saved);
    assert.throws(() => MahjongMatchEngine.restoreCheckpoint(saved, { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
  }
  h.restore(); assert.deepEqual(h.engine.exportCheckpoint(), before);
});
test('checkpoint isolation and player snapshots remain separate after restore', () => {
  const h = harness(); const saved = h.engine.exportCheckpoint();
  const restored = MahjongMatchEngine.restoreCheckpoint(saved, { now: () => 9999 });
  saved.round.state.players[0].hand[0] = { ...saved.round.state.players[0].hand[0], type: 33 }; saved.history.push({} as never);
  assert.deepEqual(restored.hostSnapshot(), h.engine.hostSnapshot());
  for (const viewer of [{ role: 'spectator' }, { role: 'player', playerId: 'b' }] as const) {
    const view = restored.view(viewer);
    assert.equal(view.players[0].hand, undefined);
    for (const key of ['history', 'runtime', 'wall', 'events', 'committedActions', 'savedAt']) assert.ok(!(key in view));
    assert.throws(() => MahjongMatchEngine.restoreCheckpoint(view, { now: () => 0 }), /INVALID_HOST_CHECKPOINT/);
  }
});
test('legacy match checkpoint accepts a small enclosing timestamp skew', () => {
  const h = harness();
  const saved = h.engine.exportCheckpoint();
  saved.lastNow = saved.round.savedAt + 1;
  const restored = MahjongMatchEngine.restoreCheckpoint(saved, { now: () => 900000 });
  assert.deepEqual(restored.hostSnapshot(), h.engine.hostSnapshot());
  saved.lastNow = saved.round.savedAt + 1001;
  assert.throws(() => MahjongMatchEngine.restoreCheckpoint(saved, { now: () => 900000 }), /INVALID_HOST_CHECKPOINT/);
});
console.log(`Virtual match: ${groups} groups passed. UI, persistence wiring and LAN remain pending.`);
