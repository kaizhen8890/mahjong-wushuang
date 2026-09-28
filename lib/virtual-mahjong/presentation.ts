import type { TablePresentation } from '../presentation';
import { YAKU } from '../mahjong';
import type { PlayerVisibleGameState } from './projection';
import { tileCode } from './tiles';

/** Only public transitions; an initial/reconnected snapshot is a baseline, never a replay. */
export function virtualPresentations(before: PlayerVisibleGameState | null, after: PlayerVisibleGameState, createdAt: number): TablePresentation[] {
  if (!before || before.gameId !== after.gameId || before.roundId !== after.roundId || before.viewerId !== after.viewerId || after.revision !== before.revision + 1) return [];
  const base = (playerId: string, kind: 'riichi' | 'win'): TablePresentation => ({
    id: `${after.gameId}:${after.roundId}:${kind}:${playerId}`, createdAt, kind, playerId,
    playerName: after.players.find(player => player.id === playerId)?.name ?? '',
    han: 0, fu: 0, yakuman: 0, limit: '', points: 0, yaku: [], tiles: [], scores: [],
  });
  if (after.result && !before.result) {
    if (!['ron', 'tsumo'].includes(after.result.reason)) return [];
    return after.result.wins.map((win, index) => ({ ...base(win.playerId, 'win'),
      winType: after.result!.reason as 'ron' | 'tsumo',
      loserId: after.result!.reason === 'ron' ? before.phase.call?.sourcePlayerId : undefined,
      han: win.han, fu: win.fu, yakuman: win.yakuman, limit: win.label, points: win.winnerGain,
      yaku: win.yaku.map(id => YAKU.find(item => item.id === id)?.name ?? id),
      tiles: [...win.concealed.filter(tile => tile.id !== win.winningTile.id), win.winningTile].map(tileCode),
      // Multi-ron shares one final settlement: never animate cumulative totals once per winner.
      scores: index === 0 ? after.players.map(player => ({ playerId: player.id,
        before: before.players.find(old => old.id === player.id)!.points, after: player.points })) : [],
    }));
  }
  return after.players.filter(player => player.riichi !== 'none' && before.players.find(old => old.id === player.id)?.riichi === 'none')
    .map(player => base(player.id, 'riichi'));
}
