import assert from 'node:assert/strict';
import { calculateTurnClock, createGameState, startTurnClock, stopTurnClock, setTimerPaused } from '../lib/mahjong.ts';

const game = createGameState();
game.turnStartedAt = 1_000;
assert.equal(calculateTurnClock(game, 60_000).enabled, false, '开局必须等待摸牌');
game.turnState = 'thinking';
game.players[0].turnFixedSeconds = 15;
game.players[0].turnExtraSeconds = 30;

assert.deepEqual(calculateTurnClock(game, 1_000), {
  enabled: true,
  playerId: 'player-1',
  fixedRemaining: 15,
  extraRemaining: 30,
  totalRemaining: 45,
  usingExtra: false,
  expired: false,
});
assert.equal(calculateTurnClock(game, 16_000).totalRemaining, 30);
assert.equal(calculateTurnClock(game, 21_000).extraRemaining, 25);

const next = startTurnClock(game, 1, 21_000);
assert.equal(next.players[0].turnExtraSeconds, 25);
assert.equal(next.turnIndex, 1);
assert.equal(next.turnStartedAt, 21_000);
assert.equal(calculateTurnClock(next, 22_000).totalRemaining, 44);

assert.equal(startTurnClock(game, 0, 21_000), game, '同一巡重复启动不得重置时间');
const stopped = stopTurnClock(game, 21_000);
assert.equal(stopped.turnState, 'waiting');
assert.equal(stopped.players[0].turnExtraSeconds, 25);
assert.equal(stopped.turnIndex, 0, '出牌不会自动切下一家');
assert.equal(calculateTurnClock(stopped, 999_000).enabled, false);
assert.equal(stopTurnClock(stopped, 999_000), stopped, '重复结束不得重复扣额外时间');
const afterCall = startTurnClock(stopped, 2, 999_000);
assert.equal(afterCall.turnIndex, 2, '实际下一位可跳过顺位开始');
assert.equal(calculateTurnClock(afterCall, 1_000_000).totalRemaining, 44);
assert.equal(afterCall.players[1].turnExtraSeconds, 30, '被吃碰杠跳过的人不耗时间');

const paused = setTimerPaused(game, true, 21_250);
assert.equal(paused.turnElapsedMs, 20_250);
assert.equal(calculateTurnClock(paused, 90_000).totalRemaining, 25);
assert.equal(calculateTurnClock(paused, 90_000).enabled, false);
assert.equal(startTurnClock(paused, 1, 90_000), paused);
assert.equal(setTimerPaused(paused, true, 90_000), paused);
const resumed = setTimerPaused(paused, false, 100_000);
assert.equal(calculateTurnClock(resumed, 100_750).totalRemaining, 24);
const pausedAgain = setTimerPaused(resumed, true, 100_750);
const resumedAgain = setTimerPaused(pausedAgain, false, 200_000);
assert.equal(calculateTurnClock(resumedAgain, 201_000).extraRemaining, 23);
assert.equal(stopTurnClock(resumedAgain, 201_000).players[0].turnExtraSeconds, 23);
assert.equal(setTimerPaused(stopped, true, 60_000).turnState, 'waiting');
assert.equal(setTimerPaused(setTimerPaused(stopped, true, 60_000), false, 90_000).turnState, 'waiting');

const disabled = { ...game, settings: { ...game.settings, turnTimerEnabled: false } };
assert.equal(calculateTurnClock(disabled, 300_000).enabled, false);
assert.equal(stopTurnClock(disabled, 300_000).players[0].turnExtraSeconds, 30);
const threeSeconds = { ...game, players: game.players.map((p, i) => i === 0 ? { ...p, turnFixedSeconds: 3 } : p) };
assert.equal(calculateTurnClock(threeSeconds, 6_000).extraRemaining, 28);
assert.equal(calculateTurnClock(threeSeconds, 40_000).expired, true);

console.log('Turn timer regressions passed.');
