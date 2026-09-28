/** Physical identity is independent of a tile's face. Host-created tiles only. */
export interface Tile { readonly id: number; readonly type: number; readonly red: boolean }
export type PlayerCount = 3 | 4;

export function tileTypes(players: PlayerCount): number[] {
  if (players !== 3 && players !== 4) throw new Error('Invalid player count');
  return Array.from({ length: 34 }, (_, type) => type)
    .filter(type => players === 4 || type === 0 || type >= 8);
}

export function createTiles(players: PlayerCount, redFives: boolean): Tile[] {
  return tileTypes(players).flatMap(type => Array.from({ length: 4 }, (_, copy) => ({
    id: type * 4 + copy, type, red: redFives && copy === 0 && [4, 13, 22].includes(type),
  })));
}

export function countsOf(tiles: readonly Pick<Tile, 'type'>[]): number[] {
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) {
    if (!Number.isInteger(tile.type) || tile.type < 0 || tile.type >= 34) throw new Error('Invalid tile type');
    if (++counts[tile.type] > 4) throw new Error('More than four copies');
  }
  return counts;
}

/** Asset/scoring adapter, not the formal table's visual representation. */
export function tileCode(tile: Pick<Tile, 'type' | 'red'>): string {
  countsOf([tile]);
  const suit = Math.floor(tile.type / 9);
  const value = tile.type % 9 + 1;
  if (tile.red && (suit === 3 || value !== 5)) throw new Error('Invalid red tile');
  return `${tile.red ? 0 : value}${'mpsz'[suit]}`;
}

export function doraType(indicator: number, players: PlayerCount): number {
  if (!tileTypes(players).includes(indicator)) throw new Error('Invalid indicator');
  if (players === 3 && indicator < 9) return indicator === 0 ? 8 : 0;
  if (indicator < 27) return Math.floor(indicator / 9) * 9 + (indicator + 1) % 9;
  if (indicator < 31) return 27 + (indicator - 27 + 1) % 4;
  return 31 + (indicator - 31 + 1) % 3;
}
