import type { PlayerVisibleGameState } from './projection';

/** Display only; expiration and spending remain Host decisions. */
export function tableClock(view: PlayerVisibleGameState, now: number) {
  const clock = view.phase.kind === 'WAITING_CALL_RESPONSE' ? view.phase.responseClock : view.clock;
  if (clock) {
    const at = 'pausedAt' in clock && typeof clock.pausedAt === 'number' ? clock.pausedAt : now;
    const elapsed = Math.max(0, at - clock.startedAt);
    const fixed = Math.max(0, clock.fixedMs - elapsed);
    const extra = Math.max(0, clock.bankMs - Math.max(0, elapsed - clock.fixedMs));
    return { total: Math.ceil((fixed + extra) / 1000), fixed: Math.ceil(fixed / 1000), extra: Math.ceil(extra / 1000) };
  }
  return view.phase.responseDeadline === undefined ? null
    : { total: Math.max(0, Math.ceil((view.phase.responseDeadline - now) / 1000)), fixed: null, extra: null };
}
