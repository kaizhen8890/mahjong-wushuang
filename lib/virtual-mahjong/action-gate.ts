export interface ActionEnvelope {
  actionId: string;
  gameId: string;
  roundId: string;
  turnId: number;
}
export type GateError = 'MALFORMED' | 'WRONG_GAME' | 'STALE_ROUND' | 'STALE_TURN' | 'ENDED' | 'DUPLICATE';

/** Host-local guard. Authorization and action legality still belong to the engine.
 * Successful actions must be committed synchronously with the state mutation.
 * Store committed keys in Host saves; never in player snapshots.
 */
export class ActionGate {
  private readonly committed = new Set<string>();

  constructor(private readonly gameId: string, private roundId: string, savedKeys: readonly string[] = []) {
    for (const key of savedKeys) this.committed.add(key);
  }

  check(actorId: string, request: unknown, current: { roundId: string; turnId: number; ended: boolean }): GateError | null {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return 'MALFORMED';
    const value = request as Partial<ActionEnvelope>;
    if (typeof actorId !== 'string' || !actorId.length || actorId.length > 128
      || typeof value.actionId !== 'string' || !value.actionId.length || value.actionId.length > 128
      || typeof value.gameId !== 'string' || typeof value.roundId !== 'string'
      || !Number.isSafeInteger(value.turnId) || value.turnId! < 0) return 'MALFORMED';
    if (value.gameId !== this.gameId) return 'WRONG_GAME';
    if (current.roundId !== this.roundId || value.roundId !== current.roundId) return 'STALE_ROUND';
    if (value.turnId !== current.turnId) return 'STALE_TURN';
    if (current.ended) return 'ENDED';
    return this.committed.has(JSON.stringify([actorId, value.actionId])) ? 'DUPLICATE' : null;
  }

  commit(actorId: string, actionId: string): void {
    this.committed.add(JSON.stringify([actorId, actionId]));
  }

  /** Old round requests remain invalid, so dedup storage need not grow for an entire match. */
  nextRound(roundId: string): void {
    if (roundId === this.roundId) throw new Error('Round ID must change');
    this.roundId = roundId;
    this.committed.clear();
  }

  saveKeys(): string[] { return [...this.committed]; }
}
