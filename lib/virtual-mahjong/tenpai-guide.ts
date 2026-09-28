import type { PlayerVisibleGameState } from './projection';
import { winningTypes } from './shanten';
import { countsOf, tileTypes, type Tile } from './tiles';

/** One structurally waiting tile type with the copies the viewer has not seen. */
export interface TenpaiWait {
  type: number;
  remaining: number;
}
/** Structural tenpai guidance built from one player's own snapshot. It never claims a yaku or a legal win. */
export interface TenpaiGuide {
  tenpai: boolean;
  meldCount: number;
  /** Previewed discard that produced the wait, or null when the concealed hand already held 13 - 3*melds tiles. */
  discardTileId: number | null;
  /** Face of the previewed discard, or null when no preview was needed. */
  discardType: number | null;
  waits: TenpaiWait[];
}

function emptyGuide(): TenpaiGuide {
  return { tenpai: false, meldCount: 0, discardTileId: null, discardType: null, waits: [] };
}

/** Copies of each tile type still outside every tile the viewer can see: own hand, public river, melds, nuki, revealed indicators.
 * Opponent concealed hands and unrevealed indicators are never read, and one physical tile ID counts once. */
export function remainingTileCounts(view: PlayerVisibleGameState): number[] {
  const allowed = tileTypes(view.rules.players);
  const used = Array<number>(34).fill(0);
  const counted = new Set<number>();
  const add = (tiles: readonly Pick<Tile, 'id' | 'type'>[] | undefined) => {
    for (const tile of tiles ?? []) {
      if (counted.has(tile.id)) continue;
      counted.add(tile.id);
      used[tile.type]++;
    }
  };
  const own = view.players.find(player => player.id === view.viewerId);
  add(own?.hand);
  for (const player of view.players) {
    add(player.river.map(discard => discard.tile));
    add(player.melds.flatMap(meld => meld.tiles));
    add(player.nuki);
  }
  add(view.doraIndicators);
  if (view.phase.call) add([view.phase.call.tile]);
  return used.map((count, type) => allowed.includes(type) ? Math.max(0, 4 - count) : 0);
}

/** Waits of the concealed hand; a 14-tile hand previews the selected discard, else the drawn-tile discard. */
export function tenpaiGuide(view: PlayerVisibleGameState, selectedDiscardTileId: number | null = null): TenpaiGuide {
  const own = view.players.find(player => player.id === view.viewerId);
  const concealed = own?.hand;
  if (!own || !concealed || concealed.length === 0) return emptyGuide();
  const meldCount = own.melds.length;
  const base = 13 - 3 * meldCount;
  let discardTileId: number | null = null;
  let searched = concealed;
  if (concealed.length === base + 1) {
    const holds = (id: number | null) => id !== null && concealed.some(tile => tile.id === id);
    discardTileId = (holds(selectedDiscardTileId) ? selectedDiscardTileId : null) ?? (holds(own.drawnTileId ?? null) ? own.drawnTileId! : null)
      ?? concealed[concealed.length - 1].id;
    searched = concealed.filter(tile => tile.id !== discardTileId);
  } else if (concealed.length !== base) return emptyGuide();
  const discardType = discardTileId === null ? null : concealed.find(tile => tile.id === discardTileId)!.type;
  const counts = countsOf(searched);
  const meldCounts = countsOf(own.melds.flatMap(meld => meld.tiles));
  const remaining = remainingTileCounts(view);
  // Synthetic layout previews can contain impossible tile multiplicities. Guidance
  // must fail closed without taking down the table; authoritative play remains unchanged.
  let types: number[];
  try { types = winningTypes(counts, meldCount, view.rules.players, meldCounts); }
  catch { return emptyGuide(); }
  const waits = types.map(type => ({ type, remaining: remaining[type] }));
  return { tenpai: waits.length > 0, meldCount, discardTileId, discardType, waits };
}
