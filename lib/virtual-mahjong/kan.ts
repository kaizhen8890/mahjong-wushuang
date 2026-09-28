import type { AvailableActions, Player } from './model';
import { waits } from './scoring';
import { countsOf } from './tiles';

export type SelfKanOption = AvailableActions['selfKanOptions'][number];

/** Require the existing triplet in EVERY winning decomposition, not just unchanged waits. */
export function preservesRiichiStructure(player: Player, tileIds: number[], players: 3 | 4): boolean {
  if (tileIds.length !== 4 || !tileIds.includes(player.drawnTileId ?? -1)) return false;
  const tiles = player.hand.filter(tile => tileIds.includes(tile.id));
  if (tiles.length !== 4 || tiles.some(tile => tile.type !== tiles[0].type)) return false;
  const type = tiles[0].type;
  const before = { ...player, hand: player.hand.filter(tile => tile.id !== player.drawnTileId) };
  const after = { ...player, hand: player.hand.filter(tile => !tileIds.includes(tile.id)), melds: [...player.melds,
    { id: 'check', kind: 'ankan' as const, tiles, sourcePlayerId: null, calledTileId: null, addedTileId: null }] };
  const original = waits(before, players);
  if (!original.length || original.join(',') !== waits(after, players).join(',')) return false;
  return original.every(winningType => {
    if (winningType === type) return false;
    const counts = countsOf(before.hand); counts[winningType]++;
    // Search for a valid interpretation WITHOUT the proposed triplet.
    function groups(): boolean {
      const first = counts.findIndex(n => n > 0);
      if (first < 0) return true;
      if (first !== type && counts[first] >= 3) {
        counts[first] -= 3; const found = groups(); counts[first] += 3;
        if (found) return true;
      }
      if (first < 27 && first % 9 <= 6 && counts[first + 1] && counts[first + 2]) {
        counts[first]--; counts[first + 1]--; counts[first + 2]--;
        const found = groups();
        counts[first]++; counts[first + 1]++; counts[first + 2]++;
        if (found) return true;
      }
      return false;
    }
    for (let pair = 0; pair < 34; pair++) {
      if (counts[pair] < 2) continue;
      counts[pair] -= 2; const alternative = groups(); counts[pair] += 2;
      if (alternative) return false;
    }
    return true;
  });
}

export function selfKanOptions(player: Player, players: 3 | 4): SelfKanOption[] {
  const options: SelfKanOption[] = [];
  for (const type of new Set(player.hand.map(tile => tile.type))) {
    const tileIds = player.hand.filter(tile => tile.type === type).map(tile => tile.id);
    if (tileIds.length === 4 && (player.riichi === 'none' || preservesRiichiStructure(player, tileIds, players))) {
      options.push({ id: `ankan:${tileIds.join(',')}`, kind: 'ankan', tileIds });
    }
    if (player.riichi === 'none' && player.melds.some(meld => meld.kind === 'pon' && meld.tiles[0].type === type)) {
      for (const id of tileIds) options.push({ id: `kakan:${id}`, kind: 'kakan', tileIds: [id] });
    }
  }
  return options;
}
