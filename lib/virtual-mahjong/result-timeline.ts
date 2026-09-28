import { YAKU } from '../mahjong';
import type { PlayerVisibleGameState } from './projection';
import type { WinScore } from './model';
import { VIRTUAL_AUDIO } from './audio';
export function resultYaku(view: PlayerVisibleGameState, win: WinScore) {
  const closed = view.players.find(player => player.id === win.playerId)!.melds.every(meld => meld.kind === 'ankan');
  const rows = win.yaku.map(id => {
    const definition = YAKU.find(yaku => yaku.id === id);
    const yakuman = definition?.yakuman ? view.rules.doubleYakuman ? definition.yakuman : 1 : 0;
    const han = closed ? definition?.closedHan ?? 0 : definition?.openHan ?? 0;
    return { id, name: definition?.name ?? id, value: yakuman || han, unit: yakuman ? '倍役满' : '番', weight: yakuman ? 100 * yakuman : han };
  });
  if (!win.yakuman) for (const [id, name, value] of [['dora', '宝牌', win.bonus.dora], ['ura', '里宝牌', win.bonus.ura], ['aka', '赤宝牌', win.bonus.aka], ['nuki', '拔北', win.bonus.nuki]] as const) {
    if (value) rows.push({ id, name, value, unit: '番', weight: value });
  }
  return rows.sort((a, b) => b.weight - a.weight);
}
export function resultRanks(view: PlayerVisibleGameState, before?: PlayerVisibleGameState | null) {
  const players = view.players.map(player => {
    const deposit = view.matchResult?.depositAward.playerId === player.id ? view.matchResult.depositAward.points : 0;
    return { ...player, before: before?.players.find(old => old.id === player.id)?.points ?? player.points - (view.result?.deltas[player.id] ?? 0) - deposit };
  });
  const old = [...players].sort((a, b) => b.before - a.before || a.seat - b.seat);
  return [...players].sort((a, b) => b.points - a.points || a.seat - b.seat).map((player, index) => ({ ...player,
    oldRank: old.findIndex(item => item.id === player.id) + 1,
    rank: view.matchResult?.rankings.find(rank => rank.playerId === player.id)?.rank ?? index + 1,
    delta: player.points - player.before })).sort((a, b) => a.rank - b.rank);
}
export function resultTimeline(view: PlayerVisibleGameState) {
  const cues: { id: string; at: number; sound: string }[] = [];
  let cursor = view.result?.reason === 'ron' ? 800 : 0;
  if (cursor) cues.push({ id: 'ron', at: 0, sound: VIRTUAL_AUDIO.ron });
  const wins = (view.result?.wins ?? []).map((win, index) => {
    const start = cursor, rows = resultYaku(view, win);
    cues.push({ id: `reveal-${index}`, at: start, sound: VIRTUAL_AUDIO.reveal });
    const yakuAt = rows.map((_, row) => start + 850 + row * 550);
    yakuAt.forEach((at, row) => cues.push({ id: `yaku-${index}-${row}`, at, sound: VIRTUAL_AUDIO.yaku }));
    const fu = start + 850 + rows.length * 550;
    if (!win.yakuman) cues.push({ id: `fu-${index}`, at: fu, sound: VIRTUAL_AUDIO.yaku });
    const han = fu + 650, score = han + 650, limit = score + 600;
    cues.push({ id: `score-${index}`, at: score, sound: VIRTUAL_AUDIO.score });
    if (/满/.test(win.label)) cues.push({ id: `limit-${index}`, at: limit, sound: VIRTUAL_AUDIO.limit });
    cursor = (/满/.test(win.label) ? limit + 450 : score + 400) + 3000;
    return { start, end: cursor, rows, yakuAt, fu, han, score, limit };
  });
  const drawDetails = 1200;
  const points = wins.length ? cursor : 5000, roll = points + 850, ranks = roll + 1700;
  cues.push({ id: 'roll', at: roll, sound: VIRTUAL_AUDIO.roll });
  const standings = resultRanks(view);
  const rankStep = 650, summaryStep = 650;
  standings.forEach((player, index) => cues.push({ id: `rank-${player.id}`, at: ranks + index * rankStep, sound: player.rank === 1 ? VIRTUAL_AUDIO.rank1 : VIRTUAL_AUDIO.rankOther }));
  const summary = ranks + Math.max(0, standings.length - 1) * rankStep + 450 + 3000;
  standings.forEach((player, index) => cues.push({ id: `summary-${player.id}`, at: summary + index * summaryStep, sound: player.rank === 1 ? VIRTUAL_AUDIO.rank1 : VIRTUAL_AUDIO.rankOther }));
  return { wins, drawDetails, points, roll, ranks, rankStep, summaryStep, summary, end: summary + Math.max(0, standings.length - 1) * summaryStep + 450 + 3000, cues };
}
