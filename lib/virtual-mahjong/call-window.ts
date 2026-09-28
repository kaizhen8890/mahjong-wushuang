import type { CallOption, CallWindow, Rules } from './model';

export type CallResolution = { kind: 'pending' } | { kind: 'none' } | { kind: 'triple-ron-abort' }
  | { kind: 'ron'; playerIds: string[] }
  | { kind: 'meld'; playerId: string; option: CallOption };

export function callDeadline(window: CallWindow, playerId: string): number {
  const timing = window.timing;
  return timing && Object.hasOwn(timing.banks, playerId)
    ? timing.startedAt + timing.fixedMs + timing.banks[playerId] : window.deadline;
}

/** Host serializes access. A pass after a legal ron must also update furiten in the engine. */
export function respondToCall(window: CallWindow, playerId: string, optionId: string, now: number): CallWindow {
  if (!Number.isFinite(now) || now >= callDeadline(window, playerId)) throw new Error('Response window expired');
  if (!Object.hasOwn(window.eligible, playerId)) throw new Error('No call permission');
  if (Object.hasOwn(window.responses, playerId)) throw new Error('Already responded');
  if (optionId !== 'pass' && !window.eligible[playerId].some(option => option.id === optionId)) throw new Error('Invalid option');
  return { ...window, responses: { ...window.responses, [playerId]: optionId },
    ...(window.timing ? { timing: { ...window.timing, respondedAt: { ...window.timing.respondedAt, [playerId]: now } } } : {}) };
}

/** Seats must be provided in East→South→West→North turn order (three seats for sanma). */
export function resolveCalls(window: CallWindow, seatOrder: readonly string[], multiRon: Rules['multiRon'], now: number): CallResolution {
  if (!Number.isFinite(now) || !Number.isFinite(window.deadline)) throw new Error('Invalid clock');
  if (![3, 4].includes(seatOrder.length) || new Set(seatOrder).size !== seatOrder.length
    || !seatOrder.includes(window.sourcePlayerId)
    || Object.keys(window.eligible).some(id => id === window.sourcePlayerId || !seatOrder.includes(id))) throw new Error('Invalid call seats');
  if (Object.keys(window.eligible).some(id => !Object.hasOwn(window.responses, id) && now < callDeadline(window, id))) return { kind: 'pending' };
  const source = seatOrder.indexOf(window.sourcePlayerId);
  const order = [...seatOrder.slice(source + 1), ...seatOrder.slice(0, source)];
  const selected = order.flatMap(playerId => {
    const response = window.responses[playerId];
    if (!response || response === 'pass') return [];
    const option = window.eligible[playerId]?.find(item => item.id === response);
    if (!option) throw new Error('Corrupt call response');
    return [{ playerId, option }];
  });
  const winners = selected.filter(item => item.option.kind === 'ron').map(item => item.playerId);
  if (winners.length) {
    if (multiRon === 'triple-abort' && winners.length === 3) return { kind: 'triple-ron-abort' };
    return { kind: 'ron', playerIds: multiRon === 'head-bump' ? winners.slice(0, 1) : winners };
  }
  const meld = selected.find(item => item.option.kind === 'pon' || item.option.kind === 'daiminkan')
    ?? selected.find(item => item.option.kind === 'chi');
  return meld ? { kind: 'meld', playerId: meld.playerId,
    option: { id: meld.option.id, kind: meld.option.kind, consumeTileIds: [...meld.option.consumeTileIds] } } : { kind: 'none' };
}
