import assert from 'node:assert/strict';
import { createGameState, calculateTurnClock, setTimerPaused } from '../lib/mahjong';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createCommandRequest, parseClientMessage, parseServerMessage, serializeWireMessage, LAN_PROTOCOL_VERSION } from '../lib/lan-protocol';

const realNow = Date.now;
let now = 1_000;
Date.now = () => now;
try {
  let game = createGameState();
  const snapshotFor = (index = 0) => createControllerSnapshot(game, [], {
    roomId: 'room', handId: 'hand', matchId: 'match', revision: 1, playerId: game.players[index].id,
  });
  const command = (index: number, kind: 'draw.confirm' | 'discard.confirm') => {
    const request = createCommandRequest(snapshotFor(index), { kind, turnStartedAt: game.turnStartedAt });
    const decoded = parseClientMessage(serializeWireMessage(request));
    assert.ok(decoded.ok);
    if (!decoded.ok || decoded.value.type !== 'command.request') throw Error('No command');
    return decoded.value.command;
  };
  assert.equal(snapshotFor().controls.canDiscard, false);
  assert.equal(snapshotFor().table.clock?.enabled, false);
  now = 2_000;
  const draw = command(0, 'draw.confirm');
  game = applyRemoteControllerCommand(game, [], game.players[0].id, draw).nextGame;
  assert.equal(game.wallCount, 77);
  assert.equal(snapshotFor().controls.canDraw, false);
  assert.equal(snapshotFor().controls.canDiscard, true);
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[0].id, draw));
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[0].id, command(0, 'draw.confirm')));
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[1].id, command(1, 'discard.confirm')));
  now = 22_000;
  const discard = command(0, 'discard.confirm');
  game = applyRemoteControllerCommand(game, [], game.players[0].id, discard).nextGame;
  assert.equal(game.wallCount, 77, '出牌不扣牌山');
  assert.equal(game.players[0].turnExtraSeconds, 25);
  assert.equal(snapshotFor().controls.canDraw, true);
  assert.equal(snapshotFor().controls.canDiscard, false);
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[0].id, discard));
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[0].id, draw), '旧摸牌包不能在出牌后重新生效');
  now = 122_000;
  assert.equal(calculateTurnClock(game).enabled, false);
  assert.equal(game.players[1].turnExtraSeconds, 30);
  const staleDraw = command(2, 'draw.confirm');
  game = setTimerPaused(game, true);
  assert.equal(snapshotFor(2).controls.canDraw, false);
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[2].id, command(2, 'draw.confirm')));
  now += 50_000;
  game = setTimerPaused(game, false);
  assert.equal(game.turnState, 'waiting', '等待状态恢复后仍不自动计时');
  assert.throws(() => applyRemoteControllerCommand(game, [], game.players[2].id, staleDraw));
  game = applyRemoteControllerCommand(game, [], game.players[2].id, command(2, 'draw.confirm')).nextGame;
  assert.equal(game.turnIndex, 2);
  assert.equal(game.wallCount, 76);
  now += 8_250;
  game = setTimerPaused(game, true);
  const clock = snapshotFor(2).table.clock;
  now += 60_000;
  assert.deepEqual(snapshotFor(2).table.clock, clock);
  const wire = parseServerMessage(serializeWireMessage({
    protocol: LAN_PROTOCOL_VERSION, type: 'state.snapshot', roomId: 'room', sentAt: now, snapshot: snapshotFor(2),
  }));
  assert.ok(wire.ok);
  if (wire.ok && wire.value.type === 'state.snapshot') {
    assert.equal(wire.value.snapshot.table.timerPaused, true);
    assert.equal(wire.value.snapshot.table.turnState, 'thinking');
    assert.equal(wire.value.snapshot.controls.canDiscard, true);
    assert.deepEqual(wire.value.snapshot.table.clock, clock);
  }
  // Paused player may mark an already completed discard; resuming must not start a new turn.
  game = applyRemoteControllerCommand(game, [], game.players[2].id, command(2, 'discard.confirm')).nextGame;
  assert.equal(game.timerPaused, true);
  game = setTimerPaused(game, false, now + 1_000);
  assert.equal(game.turnState, 'waiting');
  assert.equal(game.players[2].turnExtraSeconds, 30);
  // Forgotten discard: actual next draw hands over and settles previous budget once.
  game = applyRemoteControllerCommand(game, [], game.players[1].id, command(1, 'draw.confirm')).nextGame;
  now += 25_000;
  game = applyRemoteControllerCommand(game, [], game.players[3].id, command(3, 'draw.confirm')).nextGame;
  assert.equal(game.players[1].turnExtraSeconds, 21);
  assert.equal(game.turnIndex, 3);
  assert.equal(game.wallCount, 74);
  const ended = { ...game, handEnded: true };
  assert.equal(calculateTurnClock(ended).enabled, false);
  assert.throws(() => applyRemoteControllerCommand(ended, [], ended.players[3].id, command(3, 'discard.confirm')));
  console.log('Draw/discard wire flow, pause/resume, stale packets and skipped seats passed.');
} finally {
  Date.now = realNow;
}
