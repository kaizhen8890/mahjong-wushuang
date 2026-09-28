import assert from 'node:assert/strict';
import { readRoomSnapshot } from '../lib/virtual-mahjong/room-wire';
import { createTableScenario } from './helpers/virtual-table-scenarios';
for (const name of ['chi', 'ankan', 'ron', 'draw'] as const) {
  const h = createTableScenario(name);
  if (name === 'ankan') { h.act({ kind: 'KAN', optionId: h.view().availableActions.selfKanOptions[0].id }); h.act({ kind: 'TSUMO' }); }
  if (name === 'ron') h.act({ kind: 'RESPOND', optionId: 'ron' });
  if (name === 'draw') h.act({ kind: 'ABORT_NINE_TERMINALS' });
  const game = h.view();
  const snapshot = { revision: 1, configurationRevision: 1, hostPlayerId: 'a', serverNow: h.now, rules: game.rules,
    seats: game.players.map(player => ({ playerId: player.id, name: player.name, seat: player.seat, connected: true, ready: true })), game };
  assert.deepEqual(readRoomSnapshot(snapshot, h.viewerId), snapshot);
  const badTile = structuredClone(snapshot); Object.assign(badTile.game.doraIndicators[0], { type: 100 });
  assert.throws(() => readRoomSnapshot(badTile, h.viewerId), /INVALID_TILE/);
  const wrongActor = structuredClone(snapshot); wrongActor.game.viewerId = 'stranger';
  assert.throws(() => readRoomSnapshot(wrongActor, h.viewerId), /WRONG_VIEWER/);
  if (game.result) {
    const early = structuredClone(snapshot); early.game.phase.kind = 'AFTER_DRAW';
    assert.throws(() => readRoomSnapshot(early, h.viewerId), /EARLY_RESULT/);
  }
}
console.log('PASS room wire: call, rinshan/ron/draw results, invalid tile/identity and early-result rejection');
