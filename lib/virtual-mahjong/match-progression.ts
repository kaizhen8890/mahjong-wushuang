import type { AuthoritativeGameState, MatchResult, Wind } from './model';

export interface RoundCarry {
  roundWind: Wind; handNumber: number; honba: number; riichiSticks: number;
  points: Record<string, number>;
}
export type MatchProgression = { kind: 'next'; dealerSeat: number; carry: RoundCarry }
  | { kind: 'end'; reason: MatchResult['reason'] };
const winds: Wind[] = ['east', 'south', 'west', 'north'];

/** Fixed tie priority follows the starting East, not the current dealer or player ID. */
export function orderedPlayers(state: AuthoritativeGameState, initialDealerSeat: number) {
  const priority = (seat: number) => (seat - initialDealerSeat + state.players.length) % state.players.length;
  return [...state.players].sort((a, b) => b.points - a.points || priority(a.seat) - priority(b.seat));
}

/** Only completed, Host-scored rounds may determine advancement. No client result input. */
export function progression(state: AuthoritativeGameState, initialDealerSeat: number): MatchProgression {
  if (state.phase.kind !== 'ROUND_RESULT' || !state.result) throw new Error('ROUND_NOT_FINISHED');
  const result = state.result;
  const dealer = state.players.find(player => player.id === state.dealerId)!;
  const win = result.reason === 'ron' || result.reason === 'tsumo';
  const exhaustive = result.reason === 'exhaustive' || result.reason === 'nagashi';
  const abort = !win && !exhaustive;
  const repeat = abort || (win ? result.wins.some(item => item.playerId === dealer.id)
    : result.tenpaiPlayerIds.includes(dealer.id));
  const top = orderedPlayers(state, initialDealerSeat)[0];
  const nominalWind = state.rules.length === 'east' ? 0 : 1;
  const wind = winds.indexOf(state.roundWind);
  const atLast = wind === nominalWind && state.handNumber === state.players.length;
  const extended = wind > nominalWind;
  const target = top.points >= state.rules.returnPoints;
  if (state.rules.match.bankruptcy && state.players.some(player => player.points < 0)) return { kind: 'end', reason: 'bankruptcy' };
  // Abortive draws always replay, except bankruptcy. They never trigger target/agari-yame endings.
  if (!abort) {
    if (extended && target) return { kind: 'end', reason: 'extension-target' };
    // Explicit hard cap: after the final extension hand, even a dealer repeat cannot start another wind.
    if (extended && state.handNumber === state.players.length) return { kind: 'end', reason: 'extension-limit' };
    if (atLast && repeat && top.id === dealer.id && target
      && (win ? state.rules.match.dealerWinEnd : state.rules.match.dealerTenpaiEnd)) {
      return { kind: 'end', reason: 'dealer-end' };
    }
    if (atLast && !repeat && (target || state.rules.match.extension === 'none')) return { kind: 'end', reason: 'scheduled-end' };
  }
  const handNumber = repeat ? state.handNumber : state.handNumber % state.players.length + 1;
  return { kind: 'next', dealerSeat: repeat ? dealer.seat : (dealer.seat + 1) % state.players.length,
    carry: { roundWind: !repeat && handNumber === 1 ? winds[wind + 1] : state.roundWind,
      handNumber, honba: win && !repeat ? 0 : state.honba + 1, riichiSticks: state.riichiSticks,
      points: Object.fromEntries(state.players.map(player => [player.id, player.points])) } };
}

/** Pure final ranking; deposit money is awarded once by the match owner using this result. */
export function rankMatch(state: AuthoritativeGameState, initialDealerSeat: number, reason: MatchResult['reason']): MatchResult {
  const ordered = orderedPlayers(state, initialDealerSeat);
  const topPlayerId = ordered[0].id;
  const depositAward = { playerId: topPlayerId, points: state.riichiSticks * 1000 };
  return { reason, topPlayerId, depositAward, rankings: ordered.map((player, index) => {
    const points = player.points + (index === 0 ? depositAward.points : 0);
    const returnDelta = points - state.rules.returnPoints;
    const oka = index === 0 ? (state.rules.returnPoints - state.rules.startingPoints) * state.players.length : 0;
    const uma = state.rules.match.uma[index];
    return { playerId: player.id, rank: index + 1, points, returnDelta, oka, uma, score: (returnDelta + oka) / 1000 + uma };
  }) };
}
