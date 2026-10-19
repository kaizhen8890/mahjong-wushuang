import assert from 'node:assert/strict';
import { analyzeHand } from '../lib/hand-analysis';
import { generateZenithOpening, perturbZenithHand, prepareZenithWall, zenithRandomBelow, ZENITH_TEMPLATES } from '../lib/virtual-mahjong/local-zenith-hand';
import { DEFAULT_LOCAL_SETTINGS } from '../lib/virtual-mahjong/local-settings';
import { LocalVirtualSession } from '../lib/virtual-mahjong/local-session';
import { MahjongMatchEngine } from '../lib/virtual-mahjong/match-engine';
import { MahjongRoundEngine } from '../lib/virtual-mahjong/round-engine';
import { defaultRules } from '../lib/virtual-mahjong/rules';
import { createTiles, tileCode, tileTypes, countsOf, type Tile } from '../lib/virtual-mahjong/tiles';
import { createWall, dealHands, type RandomUint32 } from '../lib/virtual-mahjong/wall';
import { conserved } from './helpers/local-virtual-fixtures';

let groups = 0;
function test(name: string, run: () => void) { run(); groups++; console.log('PASS zenith: ' + name); }
function seeded(seed: number) {
  let calls = 0;
  return { word: () => { calls++; return seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; }, calls: () => calls };
}
function noPerturb(template = 0): RandomUint32 { let first = true; return () => { if (first) { first = false; return template; } return 99; }; }
const sort = (tiles: readonly Tile[]) => [...tiles].sort((a, b) => a.id - b.id);
function inventory(tiles: readonly Tile[], players: 3 | 4, red = true) {
  assert.deepEqual(sort(tiles), createTiles(players, red));
  assert.equal(new Set(tiles.map(tile => tile.id)).size, players === 3 ? 108 : 136);
}

test('uniform integer rejection and invalid random words', () => {
  const values = [0xffffffff, 0xfffffffe, 6];
  assert.equal(zenithRandomBelow(7, () => values.shift()!), 6);
  assert.equal(values.length, 0);
  for (const value of [-1, 0x100000000, NaN, .5]) assert.throws(() => zenithRandomBelow(7, () => value), /INVALID_ZENITH_RANDOM/);
  assert.throws(() => zenithRandomBelow(0, () => 0), /INVALID_ZENITH_BOUND/);
});

for (const players of [3, 4] as const) for (const [index, template] of ZENITH_TEMPLATES.entries()) {
  test(players + '-player zero-perturb ' + template + ' is a real yakuman hand', () => {
    const rules = defaultRules(players);
    const opening = generateZenithOpening(rules, true, noPerturb(index));
    assert.equal(opening.template, template); assert.equal(opening.hand.length, 14);
    assert.deepEqual(opening.replacedIndices, []); assert.equal(opening.removedIndex, null);
    assert.ok(opening.templateTypes.every(type => tileTypes(players).includes(type)));
    countsOf(opening.hand);
    inventory([...opening.hand, ...opening.stock], players);
    const result = analyzeHand({ tiles: opening.hand.map(tileCode), winningTile: tileCode(opening.hand.at(-1)!),
      melds: [], closed: true, winType: 'tsumo', seatWind: '东', roundWind: '东', selected: [], bonusHan: 0 });
    assert.equal(result.complete, true, result.error);
    const alternatives: Record<string, string[]> = { kokushi: ['kokushi', 'kokushi-13'],
      chuuren: ['chuuren', 'junsei-chuuren'], suuankou: ['suuankou', 'suuankou-tanki'] };
    assert.ok((alternatives[template] ?? [template]).some(id => result.best?.yaku.includes(id)), JSON.stringify(result.best));
    const base = createWall(players, true, seeded(91).word);
    const wall = prepareZenithWall(base, rules, 0, 0, noPerturb(index));
    const engine = new MahjongRoundEngine({ gameId: 'zenith-win', roundId: template, rules, dealerSeat: 0,
      players: ['a', 'b', 'c', 'd'].slice(0, players).map(id => ({ id, name: id })) }, { now: () => 0, makeWall: () => wall });
    assert.equal(engine.view({ role: 'player', playerId: 'a' }).availableActions.canTsumo, true);
    assert.equal(engine.dispatch('a', { gameId: 'zenith-win', roundId: template, turnId: 1, actionId: 'win', kind: 'TSUMO' }).ok, true);
    assert.equal(engine.hostSnapshot().result!.reason, 'tsumo'); conserved(engine.hostSnapshot());
  });
}

test('exact twelve percent boundary, one roll per position, including zero hits', () => {
  const all = createTiles(4, true), hand = all.slice(0, 14), stock = all.slice(14);
  for (let roll = 0; roll < 100; roll++) {
    let calls = 0;
    const result = perturbZenithHand(hand, stock, () => { calls++; return roll; });
    assert.equal(result.replacedIndices.length, roll < 12 ? 14 : 0);
    assert.equal(calls, roll < 12 ? 28 : 14);
    inventory([...result.hand, ...result.stock], 4);
  }
});
test('independent partial replacements leave untouched positions and input stock unchanged', () => {
  const all = createTiles(3, true), hand = all.slice(0, 13), stock = all.slice(13);
  const sequence = [99, 0, 99, 11, 12, 99, 99, 99, 99, 99, 99, 99, 99, 0, 0];
  const before = structuredClone({ hand, stock });
  const result = perturbZenithHand(hand, stock, () => sequence.shift()!);
  assert.deepEqual(result.replacedIndices, [1, 3]); assert.equal(sequence.length, 0);
  for (let i = 0; i < hand.length; i++) if (i !== 1 && i !== 3) assert.deepEqual(result.hand[i], hand[i]);
  assert.deepEqual({ hand, stock }, before); inventory([...result.hand, ...result.stock], 3);
});
test('a triggered replacement may draw the same physical tile back', () => {
  const all = createTiles(4, true), hand = all.slice(0, 14), stock = all.slice(14);
  const words = [0, ...Array<number>(13).fill(99), stock.length];
  const result = perturbZenithHand(hand, stock, () => words.shift()!);
  assert.deepEqual(result.replacedIndices, [0]); assert.deepEqual(result.hand, hand);
  inventory([...result.hand, ...result.stock], 4);
});
test('seeded variants and nondealer removal preserve 13 positions and a full deck', () => {
  for (const players of [3, 4] as const) {
    const removed = new Set<number>(), categories = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const rules = defaultRules(players); rules.redFives = seed % 2 === 0;
      const opening = generateZenithOpening(rules, false, seeded(seed).word);
      assert.equal(opening.hand.length, 13); assert.ok(opening.removedIndex !== null);
      removed.add(opening.removedIndex!); categories.add(opening.template);
      assert.deepEqual(opening.originalHand.map(tile => tile.type), opening.templateTypes.filter((_, i) => i !== opening.removedIndex));
      assert.ok(opening.replacedIndices.every(i => i >= 0 && i < 13));
      inventory([...opening.hand, ...opening.stock], players, rules.redFives);
    }
    assert.equal(removed.size, 14); assert.equal(categories.size, 7);
  }
});
for (const players of [3, 4] as const) test(players + ' players, every human/dealer seat uses actual deal order', () => {
  for (let human = 0; human < players; human++) for (let dealer = 0; dealer < players; dealer++) {
    const rules = defaultRules(players), base = createWall(players, true, seeded(173).word), before = structuredClone(base);
    const expected = generateZenithOpening(rules, human === dealer, noPerturb(2));
    const prepared = prepareZenithWall(base, rules, human, dealer, noPerturb(2));
    assert.deepEqual(base, before); inventory([...prepared.live, ...prepared.dead], players);
    assert.equal(prepared.dead.length, 14); assert.equal(prepared.rinshanUsed, 0); assert.equal(prepared.indicatorsRevealed, 1);
    const hands = dealHands(prepared, players, dealer);
    assert.deepEqual(sort(hands[human]), sort(expected.hand));
    hands.forEach((hand, seat) => assert.equal(hand.length, seat === dealer ? 14 : 13));
    inventory([...hands.flat(), ...prepared.live, ...prepared.dead], players);
  }
});
test('invalid unpublished walls and seats fail without changing the caller wall', () => {
  const rules = defaultRules(4), base = createWall(4, true, seeded(98).word);
  assert.throws(() => prepareZenithWall(base, rules, 4, 0), /INVALID_ZENITH_SEAT/);
  base.live[0] = base.live[1]; const before = structuredClone(base);
  assert.throws(() => prepareZenithWall(base, rules, 0, 0), /INVALID_ZENITH_WALL/);
  assert.deepEqual(base, before);
});
test('disabled session preserves the pre-feature wall, events and random consumption', () => {
  const left = seeded(123456), right = seeded(123456);
  const session = new LocalVirtualSession({ ...DEFAULT_LOCAL_SETTINGS, botMode: 'normal' }, { now: () => 0, random: left.word }, 'off');
  const original = new MahjongMatchEngine({ gameId: 'off', rules: defaultRules(4), dealerSeat: 0,
    players: ['我', '下家', '对家', '上家'].map((name, i) => ({ id: 'abcd'[i], name })) }, { now: () => 0, random: right.word });
  assert.deepEqual(session.hostSnapshot(), original.hostSnapshot()); assert.equal(left.calls(), right.calls());
});
for (const players of [3, 4] as const) for (const botMode of ['cooperative', 'normal'] as const) {
  test(players + '-player ' + botMode + ' session regenerates each round, not each draw', () => {
    let walls = 0, words = 0;
    const session = new LocalVirtualSession({ ...DEFAULT_LOCAL_SETTINGS, players, zenithHand: true, bankruptcy: false, botMode },
      { now: () => 0, random: () => { words++; return 99; }, makeWall: rules => { walls++; return createWall(rules.players, rules.redFives, seeded(7).word); } });
    assert.equal(walls, 1); assert.equal(session.view().availableActions.canTsumo, true);
    assert.equal(session.controls().availableTypes.length > 0, botMode === 'cooperative');
    assert.equal(JSON.stringify(session.view()).includes('zenith'), false);
    assert.equal(session.send({ kind: 'TSUMO' }).ok, true); conserved(session.hostSnapshot());
    const beforeWords = words, firstRound = session.view().roundId;
    assert.equal(session.advance().ok, true);
    assert.equal(walls, 2); assert.ok(words > beforeWords); assert.notEqual(session.view().roundId, firstRound);
    assert.equal(session.settings.zenithHand, true); assert.equal(session.view().availableActions.canTsumo, true);
    conserved(session.hostSnapshot());
  });
}
test('cooperative supply remains usable after zenith opening, without regenerating on draws', () => {
  let raw = 0, walls = 0;
  const random = seeded(574);
  const session = new LocalVirtualSession({ ...DEFAULT_LOCAL_SETTINGS, zenithHand: true },
    { now: () => raw, random: random.word, makeWall: rules => { walls++; return createWall(rules.players, rules.redFives, seeded(93).word); } });
  const type = session.controls().availableTypes[0];
  assert.equal(session.requestSupply(type).ok, true);
  assert.equal(session.send({ kind: 'DISCARD', tileId: session.view().players[0].drawnTileId! }).ok, true);
  for (let i = 0; i < 100 && !session.hostSnapshot().players[1].river.length; i++) { raw += 250; session.tick(); }
  assert.equal(session.hostSnapshot().players[1].river[0].tile.type, type);
  assert.equal(session.controls().supply, null); assert.equal(walls, 1); conserved(session.hostSnapshot());
});
test('restoring a checkpoint restores actual cards without rerolling', () => {
  const rules = defaultRules(3);
  const engine = new MahjongRoundEngine({ gameId: 'restore-zenith', roundId: 'r', rules, dealerSeat: 1,
    players: ['a', 'b', 'c'].map(id => ({ id, name: id })) }, { now: () => 0,
    makeWall: () => prepareZenithWall(createWall(3, true, seeded(8).word), rules, 0, 1, noPerturb(4)) });
  const restored = MahjongRoundEngine.restoreCheckpoint(engine.exportCheckpoint(), { now: () => 0,
    makeWall: () => { throw new Error('must not re-deal'); } });
  assert.deepEqual(restored.hostSnapshot(), engine.hostSnapshot());
});
console.log(groups + ' zenith groups passed');
