import { analyzeHand, type Meld as AnalysisMeld } from '../hand-analysis';
import { calculateSettlement, YAKU, type PlayerState, type Wind as ScoreWind } from '../mahjong';
import type { AuthoritativeGameState, Player, Wind, WinScore } from './model';
import { countsOf, doraType, tileCode, type Tile } from './tiles';
import { winningTypes } from './shanten';
import { doraIndicators, uraIndicators } from './wall';

const winds: Record<Wind, ScoreWind> = { east: '东', south: '南', west: '西', north: '北' };
/** Host-derived facts, never accepted from an action request. */
export interface WinFacts {
  method: 'ron' | 'tsumo';
  loserId?: string;
  source: 'normal' | 'last-live' | 'rinshan' | 'chankan' | 'first-uninterrupted-draw';
  awardDeposits: boolean;
}

export function waits(player: Player, players: 3 | 4): number[] {
  return winningTypes(countsOf(player.hand), player.melds.length, players, countsOf(player.melds.flatMap(meld => meld.tiles)));
}

export function isFuriten(player: Player, players: 3 | 4): boolean {
  if (player.furiten.temporary || player.furiten.riichi) return true;
  const types = waits(player, players);
  return player.river.some(discard => types.includes(discard.tile.type));
}

/** Nagashi mangan replaces noten payments at an exhaustive draw. Own calls do not disqualify it. */
export function nagashiPlayerIds(state: Pick<AuthoritativeGameState, 'players'>): string[] {
  return state.players.filter(player => player.river.length > 0 && player.river.every(discard =>
    (discard.tile.type >= 27 || discard.tile.type % 9 === 0 || discard.tile.type % 9 === 8)
    && discard.calledBy === null)).map(player => player.id);
}

/** Independent mangan-tsumo payments, also when several players qualify. Deposits and honba carry forward. */
export function nagashiSettlement(state: Pick<AuthoritativeGameState, 'players' | 'rules' | 'dealerId'>, playerId: string) {
  return calculateSettlement({ winnerId: playerId, winType: 'tsumo', han: 5, fu: 30, yakuman: 0,
    honba: 0, riichiSticks: 0, dealer: playerId === state.dealerId, playerCount: state.rules.players,
    kiriageMangan: state.rules.kiriageMangan, kazoeYakuman: state.rules.kazoeYakuman,
    sanmaTsumoLoss: state.rules.sanmaTsumoLoss }, scoringPlayers(state));
}

function scoringPlayers(state: Pick<AuthoritativeGameState, 'players' | 'rules'>): PlayerState[] {
  return state.players.map(player => ({ id: player.id, name: player.name, wind: winds[player.wind], score: player.points,
    active: true, participation: 'playing', team: '', riichi: player.riichi !== 'none', flowers: 0, nuki: player.nuki.length,
    kans: player.melds.filter(meld => !['chi', 'pon'].includes(meld.kind)).length, flyingTiles: 0,
    skillHand: [], usedSkillsThisTurn: 0, turnFixedSeconds: state.rules.timer.fixedMs / 1000,
    turnExtraSeconds: player.bankMs / 1000 }));
}

/** Pure scoring adapter. Callers separately validate whose turn / response window this is. */
export function evaluateWin(state: AuthoritativeGameState, playerId: string, tile: Tile, facts: WinFacts): WinScore | null {
  const player = state.players.find(item => item.id === playerId);
  if (!player || !state.wall) throw new Error('Missing scoring state');
  if (facts.method === 'ron' && (!facts.loserId || facts.loserId === playerId
    || !state.players.some(item => item.id === facts.loserId))) return null;
  if (facts.method === 'ron' && isFuriten(player, state.rules.players)) return null;
  if (facts.method === 'tsumo' && (player.drawnTileId !== tile.id || !player.hand.some(item => item.id === tile.id))) return null;
  const concealed = facts.method === 'ron' ? [...player.hand, tile] : [...player.hand];
  const all = [...concealed, ...player.melds.flatMap(meld => meld.tiles)];
  if (new Set(all.map(item => item.id)).size !== all.length) return null;
  const selected: string[] = [];
  if (player.riichi !== 'none') {
    selected.push(player.riichi);
    if (player.ippatsu) selected.push('ippatsu');
  }
  if (facts.source === 'last-live') selected.push(facts.method === 'ron' ? 'houtei' : 'haitei');
  if (facts.source === 'rinshan') selected.push('rinshan');
  if (facts.source === 'chankan') selected.push('chankan');
  if (facts.source === 'first-uninterrupted-draw') selected.push(player.id === state.dealerId ? 'tenhou' : 'chiihou');
  const countDora = (indicators: Tile[]) => indicators.reduce((sum, indicator) =>
    sum + [...all, ...player.nuki].filter(item => item.type === doraType(indicator.type, state.rules.players)).length, 0);
  const ura = player.riichi === 'none' ? [] : uraIndicators(state.wall);
  const bonus = { dora: countDora(doraIndicators(state.wall)), ura: countDora(ura), aka: all.filter(item => item.red).length,
    nuki: player.nuki.length };
  const bonusHan = bonus.dora + bonus.ura + bonus.aka + bonus.nuki;
  const melds: AnalysisMeld[] = player.melds.map(meld => ({
    kind: meld.kind === 'ankan' ? 'ankan' : meld.kind === 'chi' || meld.kind === 'pon' ? meld.kind : 'kan',
    tile: Math.min(...meld.tiles.map(item => item.type)),
  }));
  const analysis = analyzeHand({ tiles: all.map(tileCode), winningTile: tileCode(tile), melds,
    closed: player.melds.every(meld => meld.kind === 'ankan'), winType: facts.method,
    seatWind: winds[player.wind], roundWind: winds[state.roundWind], selected, bonusHan,
    openTanyao: state.rules.openTanyao, kiriage: state.rules.kiriageMangan, kazoe: state.rules.kazoeYakuman });
  if (!analysis.complete || analysis.error) return null;
  const candidates: WinScore[] = [];
  for (const candidate of analysis.candidates) {
    // Dora can add value to a valid hand; it cannot supply the required yaku.
    if (!candidate.han && !candidate.yakuman) continue;
    const yakuman = state.rules.doubleYakuman ? candidate.yakuman : candidate.yaku.reduce((sum, id) =>
      sum + Number(Boolean(YAKU.find(yaku => yaku.id === id)?.yakuman)), 0);
    const han = yakuman ? 0 : candidate.han + bonusHan;
    const settlement = calculateSettlement({ winnerId: playerId, loserId: facts.loserId, winType: facts.method,
      han, fu: candidate.fu, yakuman, honba: state.honba, riichiSticks: facts.awardDeposits ? state.riichiSticks : 0,
      dealer: playerId === state.dealerId, playerCount: state.rules.players, kiriageMangan: state.rules.kiriageMangan,
      kazoeYakuman: state.rules.kazoeYakuman, sanmaTsumoLoss: state.rules.sanmaTsumoLoss }, scoringPlayers(state));
    candidates.push({ playerId, winningTile: { ...tile }, concealed: concealed.map(item => ({ ...item })),
      yaku: [...candidate.yaku], han, fu: candidate.fu, yakuman, bonus: yakuman ? { dora: 0, ura: 0, aka: 0, nuki: 0 } : bonus,
      uraIndicators: ura.map(item => ({ ...item })), label: settlement.label,
      winnerGain: settlement.winnerGain, payments: settlement.payments });
  }
  // Re-rank after virtual rules and sanma payments, not by the analyser's four-player estimate.
  return candidates.sort((a, b) => b.winnerGain - a.winnerGain || b.han - a.han || b.fu - a.fu)[0] ?? null;
}
