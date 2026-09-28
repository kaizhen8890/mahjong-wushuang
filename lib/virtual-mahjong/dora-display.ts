import { doraType, type Tile } from './tiles';

/** Display-only highlight. Indicators are public; unrevealed and ura indicators are excluded. */
export function isVisibleDora(tile: Tile, indicators: readonly Tile[], players: 3 | 4): boolean {
  return tile.red || indicators.some(indicator => tile.type === doraType(indicator.type, players));
}
