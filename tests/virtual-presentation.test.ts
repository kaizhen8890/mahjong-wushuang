import assert from 'node:assert/strict';
import { virtualPresentations } from '../lib/virtual-mahjong/presentation';
import { createTableScenario } from './helpers/virtual-table-scenarios';
const riichi = createTableScenario('riichi');
const beforeRiichi = riichi.view();
riichi.act({ kind: 'RIICHI', tileId: beforeRiichi.availableActions.riichiDiscardTileIds[0] });
const afterRiichi = riichi.view();
assert.equal(virtualPresentations(beforeRiichi, afterRiichi, 1000)[0]?.kind, 'riichi');
assert.deepEqual(virtualPresentations(null, afterRiichi, 1000), []);
assert.deepEqual(virtualPresentations(afterRiichi, afterRiichi, 1000), []);
assert.deepEqual(virtualPresentations(afterRiichi, beforeRiichi, 1000), []);
assert.deepEqual(virtualPresentations(beforeRiichi, { ...afterRiichi, roundId: 'next-round' }, 1000), []);
for (const name of ['ron', 'ankan', 'draw'] as const) {
  const scenario = createTableScenario(name);
  if (name === 'ankan') scenario.act({ kind: 'KAN', optionId: scenario.view().availableActions.selfKanOptions[0].id });
  const before = scenario.view();
  if (name === 'ron') scenario.act({ kind: 'RESPOND', optionId: before.availableActions.callOptions.find(option => option.kind === 'ron')!.id });
  else if (name === 'ankan') scenario.act({ kind: 'TSUMO' });
  else scenario.act({ kind: 'ABORT_NINE_TERMINALS' });
  const after = scenario.view();
  const events = virtualPresentations(before, after, 1000);
  assert.deepEqual(virtualPresentations(null, after, 1000), []);
  assert.deepEqual(virtualPresentations(after, { ...after, revision: after.revision + 1 }, 1000), []);
  if (name === 'draw') { assert.equal(events.length, 0); continue; }
  assert.equal(events.length, 1); assert.equal(events[0].winType, name === 'ron' ? 'ron' : 'tsumo');
  assert.equal(events[0].tiles.length, after.result!.wins[0].concealed.length, 'Winning tile must appear once');
  assert.equal(events[0].points, after.result!.wins[0].winnerGain);
  assert.equal(events[0].createdAt, 1000);
  assert.deepEqual(events[0].scores.map(score => score.after), after.players.map(player => player.points));
  if (name === 'ankan') assert.equal(events[0].loserId, undefined);
  const multi = structuredClone(after); multi.result!.wins.push({ ...multi.result!.wins[0], playerId: after.players[1].id });
  const multiple = virtualPresentations(before, multi, 1000);
  assert.equal(multiple.length, 2); assert.equal(multiple[1].scores.length, 0);
}
console.log('PASS virtual presentation: live riichi/ron/tsumo, no reconnect replay, no duplicate winning tile, multi-win settlement once, draw stays result-only');
