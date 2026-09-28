import assert from 'node:assert/strict';
import { createTableScenario } from './helpers/virtual-table-scenarios';
import { resultTimeline } from '../lib/virtual-mahjong/result-timeline';
import { readRoomSnapshot } from '../lib/virtual-mahjong/room-wire';
const h = createTableScenario('draw');
assert.equal(h.view().roundContinuation, undefined);
h.act({ kind: 'ABORT_NINE_TERMINALS' });
const view = h.view(), next = view.roundContinuation!;
assert.equal(next.dealerId, view.dealerId); assert.equal(next.honba, view.honba + 1);
const wire = { revision: 1, configurationRevision: 1, hostPlayerId: view.viewerId!, serverNow: h.now, rules: view.rules,
  seats: view.players.map(p => ({ playerId: p.id, name: p.name, seat: p.seat, ready: true, connected: true })), game: view };
assert.deepEqual(readRoomSnapshot(wire, view.viewerId!).game!.roundContinuation, next);
assert.throws(() => readRoomSnapshot({ ...wire, game: { ...view, roundContinuation: { ...next, dealerId: 'unknown' } } }, view.viewerId!), /INVALID_CONTINUATION/);
assert.throws(() => readRoomSnapshot({ ...wire, game: { ...view, roundContinuation: { ...next, honba: -1 } } }, view.viewerId!), /INVALID_CONTINUATION/);
const time = resultTimeline(view);
assert.ok(time.points - time.drawDetails >= 3500); assert.equal(time.wins.length, 0);
assert.ok(time.cues.every(cue => cue.id !== 'ron'));
const nagashiView = structuredClone(view);
nagashiView.result = { ...view.result!, reason: 'nagashi', nagashiPlayerIds: [view.players[0].id],
  deltas: Object.fromEntries(view.players.map(player => [player.id, player.seat === 0 ? 12000 : -4000])) };
assert.deepEqual(readRoomSnapshot({ ...wire, game: nagashiView }, view.viewerId!).game!.result, nagashiView.result);
assert.throws(() => readRoomSnapshot({ ...wire, game: { ...nagashiView,
  result: { ...nagashiView.result, nagashiPlayerIds: ['unknown'] } } }, view.viewerId!), /INVALID_RESULT/);
assert.equal(resultTimeline(nagashiView).wins.length, 0);
console.log('PASS draw presentation: Host continuation, strict public summary, staged detail dwell and no ron cue');
