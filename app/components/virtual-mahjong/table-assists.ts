import type { AvailableActions } from '@/lib/virtual-mahjong/model';
import type { RoundIntent } from '@/lib/virtual-mahjong/round-engine';
import type { Tile } from '@/lib/virtual-mahjong/tiles';

export interface TableAssists { sort: boolean; win: boolean; call: boolean; cut: boolean }
export const DEFAULT_TABLE_ASSISTS: TableAssists = { sort: true, win: false, call: false, cut: false };

/** Reorder only the viewer's visible tile IDs. Newly drawn tiles stay at the right. */
export function displayHandOrder(sorted: readonly Tile[], remembered: readonly number[], automatic: boolean): Tile[] {
  if (automatic || remembered.length === 0) return [...sorted];
  const byId = new Map(sorted.map(tile => [tile.id, tile]));
  const placed = remembered.flatMap(id => {
    const tile = byId.get(id);
    if (!tile) return [];
    byId.delete(id);
    return [tile];
  });
  return [...placed, ...sorted.filter(tile => byId.has(tile.id))];
}

export function moveHandTile(ids: readonly number[], movingId: number, targetId: number, after = false): number[] {
  if (movingId === targetId || !ids.includes(movingId) || !ids.includes(targetId)) return [...ids];
  const next = ids.filter(id => id !== movingId);
  next.splice(next.indexOf(targetId) + Number(after), 0, movingId);
  return next;
}

/** Pick one offered host action. Winning outranks calling; special self actions stay manual. */
export function automaticIntent(actions: AvailableActions, drawnTileId: number | null,
  assists: TableAssists, riichiStaged: boolean): RoundIntent | null {
  if (assists.win && actions.canTsumo) return { kind: 'TSUMO' };
  const ron = actions.callOptions.find(option => option.kind === 'ron');
  if (assists.win && ron) return { kind: 'RESPOND', optionId: ron.id };
  // A visible ron opportunity stays available for manual choice when automatic winning is off.
  if (assists.call && !ron) {
    for (const kind of ['pon', 'daiminkan', 'chi'] as const) {
      const option = actions.callOptions.find(candidate => candidate.kind === kind);
      if (option) return { kind: 'RESPOND', optionId: option.id };
    }
  }
  if (actions.canPass) return null;
  if (assists.cut && !riichiStaged && drawnTileId !== null && actions.discardableTileIds.includes(drawnTileId))
    return { kind: 'DISCARD', tileId: drawnTileId };
  return null;
}
