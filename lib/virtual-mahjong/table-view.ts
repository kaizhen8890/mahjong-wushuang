import type { Meld } from './model';
import type { PlayerVisibleGameState } from './projection';
import type { Tile } from './tiles';
import type { AvailableActions } from './model';

/** Equivalent non-red physical copies need only one visible choice. Preserve Host option IDs. */
export function distinctCalls(options: AvailableActions['callOptions'], hand: readonly Tile[]) {
  const seen = new Set<string>();
  return options.filter(option => {
    const key = option.kind + ':' + choiceTiles(hand, option.consumeTileIds).map(tile => `${tile.type}:${tile.red}`).join(',');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Sort visible combination tiles for reading; intent IDs remain unchanged. */
export function choiceTiles(hand: readonly Tile[], ids: readonly number[], called?: Tile): Tile[] {
  return [...ids.map(id => hand.find(tile => tile.id === id)!), ...(called ? [called] : [])]
    .sort((a, b) => a.type - b.type || a.id - b.id);
}

export function relativeSeat(seat: number, ownSeat: number, players: number): number {
  const relative = (seat - ownSeat + players) % players;
  return players === 3 && relative === 2 ? 3 : relative;
}

/** Pure display ordering only. No hand legality or hidden-state inference. */
export function meldDisplay(meld: Meld, seat: number, seats: { id: string; seat: number }[]) {
  if (meld.kind === 'ankan') return meld.tiles.map((tile, index) => ({ tile, back: index === 0 || index === 3, sideways: false, added: false }));
  const source = seats.find(player => player.id === meld.sourcePlayerId);
  const distance = source ? (source.seat - seat + seats.length) % seats.length : 0;
  const calledIndex = distance === 1 ? 2 : distance === 2 && seats.length === 4 ? 1 : 0;
  const called = meld.tiles.find(tile => tile.id === meld.calledTileId)!;
  const base = meld.tiles.filter(tile => tile.id !== meld.calledTileId && tile.id !== meld.addedTileId);
  base.splice(Math.min(calledIndex, base.length), 0, called);
  const result = base.map(tile => ({ tile, back: false, sideways: tile.id === meld.calledTileId, added: false }));
  if (meld.addedTileId !== null) result.splice(result.findIndex(item => item.sideways) + 1, 0,
    { tile: meld.tiles.find(tile => tile.id === meld.addedTileId)!, back: false, sideways: true, added: true });
  return result;
}

export function ownHand(view: PlayerVisibleGameState) {
  const own = view.players.find(player => player.id === view.viewerId);
  const tiles = [...(own?.hand ?? [])].sort((a, b) => a.type - b.type || a.id - b.id);
  return [...tiles.filter(tile => tile.id !== own?.drawnTileId), ...tiles.filter(tile => tile.id === own?.drawnTileId)];
}
