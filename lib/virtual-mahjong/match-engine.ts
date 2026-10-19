import type { AuthoritativeGameState, PrivateEvent } from './model';
import { progression, rankMatch } from './match-progression';
import { projectForViewer, type Viewer } from './projection';
import { MahjongRoundEngine, type HostDependencies, type RoundOptions } from './round-engine';
import { cloneCheckpoint, readRoundCheckpoint, requireCheckpoint, resumeClock, validateEvents, type RoundCheckpoint } from './checkpoint';
import type { LocalSupplyRequest } from './local-supply';

export type MatchOptions = Omit<RoundOptions, 'roundId' | 'carry'>;
export interface MatchCheckpoint {
  format: 'musou.host.match'; version: 1; options: MatchOptions;
  roundNumber: number; revision: number; lastNow: number; finished: boolean;
  history: PrivateEvent[]; round: RoundCheckpoint;
}

/** Owns match lifecycle; all in-round validation/scoring stays in MahjongRoundEngine. */
export class MahjongMatchEngine {
  private round: MahjongRoundEngine;
  private readonly options: MatchOptions;
  private readonly dependencies: HostDependencies;
  private roundNumber = 1;
  private revision = 1;
  private history: PrivateEvent[] = [];
  private terminal: AuthoritativeGameState | null = null;
  private lastNow = 0;

  constructor(options: MatchOptions, host: HostDependencies) {
    this.options = structuredClone(options);
    this.dependencies = this.bindHost(host);
    this.round = new MahjongRoundEngine({ ...this.options, roundId: this.roundId(1) }, this.dependencies);
  }
  private bindHost(host: HostDependencies): HostDependencies {
    return { ...host, now: () => {
      const now = host.now();
      if (!Number.isFinite(now) || now < this.lastNow) throw new Error('Invalid Host clock');
      this.lastNow = now;
      return now;
    } };
  }

  exportCheckpoint(): MatchCheckpoint {
    const round = this.round.exportCheckpoint();
    return { format: 'musou.host.match', version: 1, options: structuredClone(this.options), roundNumber: this.roundNumber,
      revision: this.revision, lastNow: this.lastNow, finished: this.terminal !== null, history: structuredClone(this.history), round };
  }

  static restoreCheckpoint(input: unknown, host: HostDependencies): MahjongMatchEngine {
    let saved: MatchCheckpoint;
    try {
      saved = cloneCheckpoint<MatchCheckpoint>(input);
      requireCheckpoint(saved.format === 'musou.host.match' && saved.version === 1
        && Number.isSafeInteger(saved.roundNumber) && saved.roundNumber >= 1
        && Number.isSafeInteger(saved.revision) && saved.revision >= 1 && typeof saved.finished === 'boolean');
      saved.round = readRoundCheckpoint(saved.round);
      const state = saved.round.state;
      // Older Host saves can stamp the enclosing match a few milliseconds after
      // the round snapshot. No action occurred between these two timestamps.
      requireCheckpoint(Number.isFinite(saved.lastNow) && saved.lastNow >= saved.round.savedAt
        && saved.lastNow - saved.round.savedAt <= 1000 && saved.revision >= state.revision
        && saved.options.gameId === state.gameId && state.roundId === `${state.gameId}:round:${saved.roundNumber}`
        && Number.isInteger(saved.options.dealerSeat) && saved.options.dealerSeat >= 0 && saved.options.dealerSeat < state.players.length
        && JSON.stringify(saved.options.rules) === JSON.stringify(state.rules)
        && JSON.stringify(saved.options.players) === JSON.stringify(state.players.map(player => ({ id: player.id, name: player.name }))));
      validateEvents(saved.history, saved.lastNow);
      requireCheckpoint(saved.history.filter(event => event.type === 'ROUND_START').length === saved.roundNumber - 1
        && saved.history.filter(event => event.type === 'ROUND_END').length === saved.roundNumber - 1
        && (saved.roundNumber === 1 ? saved.history.length === 0 : saved.history.at(-1)?.type === 'ROUND_END')
        && !saved.history.some(event => event.type === 'MATCH_END')
        && [...saved.history, ...state.events].filter(event => event.type === 'GAME_START').length === 1);
      if (saved.history.length) requireCheckpoint(saved.history.at(-1)!.timestamp <= state.events[0].timestamp);
      const ended = state.phase.kind === 'ROUND_RESULT'
        && progression({ ...state, actions: {} }, saved.options.dealerSeat).kind === 'end';
      requireCheckpoint(saved.finished === ended);
    } catch { throw new Error('INVALID_HOST_CHECKPOINT'); }
    const engine = Object.create(MahjongMatchEngine.prototype) as MahjongMatchEngine;
    Object.assign(engine, { options: saved.options, roundNumber: saved.roundNumber, revision: saved.revision,
      history: saved.history, terminal: null, lastNow: saved.lastNow });
    const dependencies = engine.bindHost({ ...host, now: resumeClock(host.now, saved.lastNow) });
    const round = MahjongRoundEngine.restoreCheckpoint(saved.round, dependencies);
    Object.assign(engine, { dependencies, round });
    // Reconstruct final payout from the pre-payout round; never award on top of a saved terminal total.
    engine.finishIfNeeded();
    return engine;
  }

  private roundId(number: number): string { return `${this.options.gameId}:round:${number}`; }

  /** Host-private debug/export only. Not a complete recoverable checkpoint. */
  hostSnapshot(): AuthoritativeGameState {
    if (this.terminal) return structuredClone(this.terminal);
    const state = this.round.hostSnapshot();
    state.revision = this.revision;
    state.events = [...structuredClone(this.history), ...state.events]
      .map((event, index) => ({ ...event, sequenceId: index + 1 }));
    return state;
  }
  view(viewer: Viewer) {
    // Prior rounds' private logs are irrelevant to a visible snapshot; avoid copying them per viewer.
    const state = this.terminal ?? this.round.hostSnapshot();
    const visible = projectForViewer({ ...state, revision: this.revision }, viewer);
    if (state.result && !this.terminal) {
      const next = progression(state, this.options.dealerSeat);
      if (next.kind === 'next') visible.roundContinuation = { dealerId: state.players.find(p => p.seat === next.dealerSeat)!.id,
        roundWind: next.carry.roundWind, handNumber: next.carry.handNumber, honba: next.carry.honba, riichiSticks: next.carry.riichiSticks };
    }
    return visible;
  }

  dispatch(actorId: string, request: unknown) {
    if (this.terminal) return { ok: false as const, error: 'MATCH_ENDED' };
    const response = this.round.dispatch(actorId, request);
    if (!response.ok) return response;
    this.revision++;
    this.finishIfNeeded();
    return { ok: true as const, revision: this.revision };
  }
  localSupplyTypes(): number[] {
    if (this.terminal) return [];
    return this.round.localSupplyTypes();
  }
  /** This method is never exposed by the LAN room command dispatcher. */
  localSupplyDiscard(actorId: string, request: LocalSupplyRequest) {
    if (this.terminal) return { ok: false as const, error: 'MATCH_ENDED' };
    const response = this.round.localSupplyDiscard(actorId, request);
    if (!response.ok) return response;
    this.revision++;
    this.finishIfNeeded();
    return { ok: true as const, revision: this.revision };
  }
  tick(): boolean {
    if (this.terminal || !this.round.tick()) return false;
    this.revision++;
    this.finishIfNeeded();
    return true;
  }

  /** Host orchestration after result presentation. Never map an unauthenticated client to this call. */
  advanceRound(expected: { gameId: string; roundId: string }): { ok: true; revision: number } | { ok: false; error: string } {
    if (this.terminal) return { ok: false, error: 'MATCH_ENDED' };
    const current = this.round.hostSnapshot();
    if (!expected || expected.gameId !== current.gameId || expected.roundId !== current.roundId) {
      return { ok: false, error: 'STALE_ROUND' };
    }
    if (current.phase.kind !== 'ROUND_RESULT') return { ok: false, error: 'ROUND_NOT_FINISHED' };
    try {
      const next = progression(current, this.options.dealerSeat);
      if (next.kind !== 'next') throw new Error('MATCH_ENDED');
      // Construct/validate before replacing anything: a failed wall/clock leaves the result retryable.
      const candidate = new MahjongRoundEngine({ ...this.options, dealerSeat: next.dealerSeat,
        roundId: this.roundId(this.roundNumber + 1), carry: next.carry }, this.dependencies);
      this.history = this.hostSnapshot().events;
      this.round = candidate;
      this.roundNumber++;
      this.revision++;
      return { ok: true, revision: this.revision };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'INVALID_NEXT_ROUND' }; }
  }

  private finishIfNeeded(): void {
    const current = this.round.hostSnapshot();
    if (current.phase.kind !== 'ROUND_RESULT') return;
    const decision = progression(current, this.options.dealerSeat);
    if (decision.kind !== 'end') return;
    const state = this.hostSnapshot();
    const result = rankMatch(state, this.options.dealerSeat, decision.reason);
    const award = result.depositAward;
    state.players.find(player => player.id === award.playerId)!.points += award.points;
    state.riichiSticks = 0;
    state.phase = { kind: 'MATCH_RESULT' };
    state.matchResult = result;
    const timestamp = state.events[state.events.length - 1].timestamp;
    if (award.points) state.events.push({ sequenceId: state.events.length + 1, timestamp, type: 'SCORE_CHANGE',
      playerId: award.playerId, data: { reason: 'remaining-deposits', deltas: { [award.playerId]: award.points } } });
    state.events.push({ sequenceId: state.events.length + 1, timestamp, type: 'MATCH_END', playerId: null, data: { result } });
    this.terminal = state;
  }
}
