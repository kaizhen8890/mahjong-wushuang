/** One logical clock for the local Host, UI deadlines and bot scheduler. */
export class LocalGameClock {
  private lastRaw: number;
  private logical: number;
  private readonly reasons = new Set<string>();
  constructor(private readonly rawNow: () => number = () => performance.now()) {
    this.lastRaw = rawNow();
    if (!Number.isFinite(this.lastRaw) || this.lastRaw < 0) throw new Error('INVALID_LOCAL_CLOCK');
    this.logical = this.lastRaw;
  }
  now = (): number => {
    const raw = this.rawNow();
    if (!Number.isFinite(raw)) throw new Error('INVALID_LOCAL_CLOCK');
    const delta = Math.max(0, raw - this.lastRaw);
    this.lastRaw = Math.max(raw, this.lastRaw);
    if (!this.paused) this.logical += delta;
    return this.logical;
  };
  get paused(): boolean { return this.reasons.size > 0; }
  pause(reason: string): void { this.now(); this.reasons.add(reason); }
  resume(reason: string): void { this.now(); this.reasons.delete(reason); }
}
