/** Native LAN reconnection is bounded; a lost Host never silently creates a new room. */
export const RECONNECT_DELAYS_MS = [2000, 5000, 10000, 20000, 30000] as const;
export const RECONNECT_HANDSHAKE_MS = 10000;

export type ReconnectStatus =
  | { kind: 'idle' | 'cancelled' | 'paused' | 'exhausted'; attempt: number }
  | { kind: 'waiting' | 'trying'; attempt: number; delayMs?: number };

export class ReconnectController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private paused = false;
  private attempts = 0;
  private generation = 0;

  constructor(private readonly connect: () => Promise<void>, private readonly changed: (status: ReconnectStatus) => void,
    private readonly later: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = (callback, delay) => setTimeout(callback, delay),
    private readonly cancelTimer: (handle: ReturnType<typeof setTimeout>) => void = handle => clearTimeout(handle)) {}

  start() { if (this.active) return; this.active = true; this.paused = false; this.attempts = 0; this.plan(); }
  awaitSnapshot() {
    if (this.active) return;
    this.active = true; this.attempts = 0;
    this.changed({ kind: 'trying', attempt: 0 });
    this.timer = this.later(() => { this.timer = null; this.plan(); }, RECONNECT_HANDSHAKE_MS);
  }
  connected() {
    if (this.paused) return;
    if (!this.active) { this.awaitSnapshot(); return; }
    this.clear();
    this.changed({ kind: 'trying', attempt: this.attempts });
    const generation = this.generation;
    this.timer = this.later(() => { this.timer = null; if (generation === this.generation) this.plan(); }, RECONNECT_HANDSHAKE_MS);
  }
  disconnected() { if (!this.active) return; this.clear(); this.plan(); }
  success() { this.stop('idle'); }
  cancel() { this.stop('cancelled'); }
  pause() { if (!this.active) return; this.paused = true; this.clear(); this.changed({ kind: 'paused', attempt: this.attempts }); }
  resume() { if (!this.active || !this.paused) return; this.paused = false; this.plan(); }
  get enabled() { return this.active; }

  private clear() { if (this.timer !== null) this.cancelTimer(this.timer); this.timer = null; this.generation++; }
  private stop(kind: 'idle' | 'cancelled') { this.active = false; this.paused = false; this.clear(); this.changed({ kind, attempt: this.attempts }); }
  private plan() {
    if (!this.active || this.paused || this.timer !== null) return;
    if (this.attempts >= RECONNECT_DELAYS_MS.length) {
      this.active = false; this.changed({ kind: 'exhausted', attempt: this.attempts }); return;
    }
    const delayMs = RECONNECT_DELAYS_MS[this.attempts];
    this.changed({ kind: 'waiting', attempt: this.attempts + 1, delayMs });
    const generation = this.generation;
    this.timer = this.later(() => {
      this.timer = null;
      if (!this.active || this.paused || generation !== this.generation) return;
      this.attempts++;
      this.changed({ kind: 'trying', attempt: this.attempts });
      void this.connect().then(() => {
        if (!this.active || this.paused || generation !== this.generation) return;
        // A socket connection is not enough: wait for the personal Snapshot.
        this.timer = this.later(() => { this.timer = null; if (generation === this.generation) this.plan(); }, RECONNECT_HANDSHAKE_MS);
      }).catch(() => { if (generation === this.generation) this.plan(); });
    }, delayMs);
  }
}
