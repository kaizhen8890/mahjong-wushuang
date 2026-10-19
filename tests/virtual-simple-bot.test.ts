import assert from 'node:assert/strict';
import { botShanten, simpleBotIntent } from '../lib/virtual-mahjong/simple-bot';
import { countsOf } from '../lib/virtual-mahjong/tiles';
import { createTableScenario } from './helpers/virtual-table-scenarios';
import { MahjongRoundEngine } from '../lib/virtual-mahjong/round-engine';
import { defaultRules } from '../lib/virtual-mahjong/rules';
import { fixtureWall } from './helpers/local-virtual-fixtures';

const complete = createTableScenario('ankan');
complete.act({ kind: 'KAN', optionId: complete.view().availableActions.selfKanOptions[0].id });
assert.deepEqual(simpleBotIntent(complete.view()), { kind: 'TSUMO' });
complete.act(simpleBotIntent(complete.view())!);
assert.equal(complete.view().result!.reason, 'tsumo');

const ron = createTableScenario('ron');
assert.equal(simpleBotIntent(ron.view())!.kind, 'RESPOND');
ron.act(simpleBotIntent(ron.view())!);
assert.equal(ron.view().result!.reason, 'ron');

const ready = createTableScenario('riichi', '123456789m123p5s1z');
const intent = simpleBotIntent(ready.view())!;
assert.equal(intent.kind, 'RIICHI');
ready.act(intent);
assert.notEqual(ready.view().players.find(player => player.id === ready.viewerId)!.riichi, 'none');

const forbidden = createTableScenario('riichi', '147m147p147s12345z');
assert.equal(simpleBotIntent(forbidden.view())!.kind, 'DISCARD');

const counts = Array<number>(34).fill(0);
counts[0] = 4; counts[27] = 4; counts[28] = 3; counts[29] = 2;
assert.equal(botShanten(counts, 3), 2, 'sanma cannot complete an imaginary manzu sequence');
counts[1] = 1;
assert.throws(() => botShanten(counts, 3), /SANMA_EXCLUDED_TILE/);

const rules = defaultRules(3); rules.redFives = false;
const engine = new MahjongRoundEngine({ gameId: 'bot-three', roundId: 'r', rules, dealerSeat: 0,
  players: ['a', 'b', 'c'].map(id => ({ id, name: id })) }, { now: () => 0,
  makeWall: () => fixtureWall(rules, ['123456789p123s5z1m']) });
const view = engine.view({ role: 'player', playerId: 'a' });
const before = botShanten(countsOf(view.players[0].hand!), 3);
const start = performance.now();
const choice = simpleBotIntent(view)!;
const elapsed = performance.now() - start;
assert.ok(choice.kind === 'RIICHI' || choice.kind === 'DISCARD');
if (choice.kind === 'DISCARD' || choice.kind === 'RIICHI') {
  const reduced = view.players[0].hand!.filter(tile => tile.id !== choice.tileId);
  assert.ok(botShanten(countsOf(reduced), 3) <= Math.max(0, before));
  assert.ok(view.availableActions.discardableTileIds.includes(choice.tileId));
}
console.log('PASS simple bot: legal tsumo, ron, riichi, ordinary discard and sanma reachable tiles (' + Math.round(elapsed) + 'ms fixture decision)');
