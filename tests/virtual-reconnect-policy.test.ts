import assert from 'node:assert/strict';
import { ReconnectController, RECONNECT_DELAYS_MS, type ReconnectStatus } from '../lib/virtual-mahjong/reconnect-policy';

class FakeClock {
  now = 0;
  next = 1;
  tasks = new Map<number, { at: number; run: () => void }>();
  later = ((run: () => void, delay = 0) => {
    const id = this.next++; this.tasks.set(id, { at: this.now + delay, run });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  clear = ((handle: ReturnType<typeof setTimeout>) => { this.tasks.delete(handle as unknown as number); }) as typeof clearTimeout;
  async advance(ms: number) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].run();
      await Promise.resolve(); await Promise.resolve();
    }
    this.now = end;
  }
}

{
  const clock = new FakeClock(), states: ReconnectStatus[] = [];
  let calls = 0;
  const reconnect = new ReconnectController(async () => { calls++; throw new Error('Host offline'); }, state => states.push(state), clock.later, clock.clear);
  reconnect.start(); reconnect.start();
  assert.equal(clock.tasks.size, 1, 'duplicate disconnects must not launch parallel retries');
  for (const delay of RECONNECT_DELAYS_MS) await clock.advance(delay);
  assert.equal(calls, RECONNECT_DELAYS_MS.length);
  assert.equal(states.at(-1)?.kind, 'exhausted');
  assert.equal(clock.tasks.size, 0, 'bounded retries stop scheduling native connections');
  reconnect.disconnected(); assert.equal(clock.tasks.size, 0, 'further disconnects cannot restart an exhausted controller');
}

{
  const clock = new FakeClock(), states: ReconnectStatus[] = [];
  let calls = 0;
  const reconnect = new ReconnectController(async () => { calls++; }, state => states.push(state), clock.later, clock.clear);
  reconnect.start(); reconnect.pause(); await clock.advance(60_000);
  assert.equal(calls, 0, 'background pause must not spend attempts');
  reconnect.resume(); await clock.advance(2000);
  assert.equal(calls, 1); reconnect.connected(); reconnect.success();
  await clock.advance(60_000);
  assert.equal(calls, 1, 'personal Snapshot success cancels the handshake watchdog');
  reconnect.start(); reconnect.cancel(); await clock.advance(60_000);
  assert.equal(calls, 1, 'explicit cancel prevents later attempts');
  assert.equal(states.at(-1)?.kind, 'cancelled');
}

console.log('PASS bounded native reconnect: backoff, exhaustion, pause/resume, Snapshot success and cancel');
