import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import { relativeSeat, meldDisplay } from '@/lib/virtual-mahjong/table-view';
import { tileCode, type Tile } from '@/lib/virtual-mahjong/tiles';
import { isVisibleDora } from '@/lib/virtual-mahjong/dora-display';
import type { TableTile } from './table-scene';

export function atlasFace(tile: Tile) {
  const code = tileCode(tile);
  return { column: code[0] === '0' ? 9 : Number(code[0]) - 1, row: { s: 0, m: 1, p: 2, z: 3 }[code[1]]! };
}
export function seatPoint(x: number, z: number, seat: number) {
  const yaw = seat * Math.PI / 2;
  return { x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw), yaw };
}
export interface TableSelection { selected: number | null; legal: readonly number[]; riichi: boolean; highlight: number | null }

/** All positions derive exclusively from the current player's projection. */
export function layoutTable(view: PlayerVisibleGameState, selection: TableSelection, deal = false): TableTile[] {
  const own = view.players.find(player => player.id === view.viewerId);
  if (!own) return [];
  const tiles: TableTile[] = [];
  for (const player of view.players) {
    const seat = relativeSeat(player.seat, own.seat, view.players.length);
    const river = player.river.filter(discard => !discard.calledBy);
    const riverScale = 1.28;
    const mainLeft = -4.4;
    // First 18: 6 x 3. Continue at the right of row one, 3 tiles per row.
    // Reserve the full main width (including a sideways riichi tile) so nothing recenters.
    const extensionLeft = mainLeft + (6 * 1.08 + 0.4) * riverScale + 0.55;
    for (let offset = 0; offset < river.length;) {
      const extension = offset >= 18;
      const columns = extension ? 3 : 6;
      const rowIndex = extension ? Math.floor((offset - 18) / 3) : Math.floor(offset / 6);
      const row = river.slice(offset, offset + columns);
      let x = extension ? extensionLeft : mainLeft;
      row.forEach(discard => {
        const width = (discard.riichi ? 1.48 : 1.08) * riverScale;
        tiles.push({ key: `river:${player.id}:${discard.tile.id}`, tileId: discard.tile.id, face: atlasFace(discard.tile),
          dora: isVisibleDora(discard.tile, view.doraIndicators, view.rules.players),
          motion: 'discard', origin: { ...seatPoint(-2, 12.8, seat), y: 1.2 },
          ...seatPoint(x + width / 2, 5.6 + rowIndex * 1.42 * riverScale, seat), y: 0.31 * riverScale, flat: true, scale: riverScale,
          sideways: discard.riichi, highlighted: selection.highlight === discard.tile.type || view.phase.call?.tile.id === discard.tile.id });
        x += width;
      });
      offset += columns;
    }
    if (seat !== 0) for (let i = 0; i < player.handCount; i++) {
      // Deliberately anonymous; no mapping to hidden tile IDs or future draws.
      tiles.push({ key: `back:${player.id}:${i}`, ...seatPoint(-10.5 + i * 1.06, 14.2, seat), y: 0.7, flat: false, motion: 'draw', origin: { ...seatPoint(-10.5 + i * 1.06, 14.2, seat), y: 1.4 } });
    }
    const groups = player.melds.map(meld => meldDisplay(meld, player.seat, view.players));
    const scale = seat === 0 ? 1.15 : 1;
    // Extracted Norths are public table tiles, in their own row separate from melds.
    // Reserve four positions without moving existing tiles as more Norths arrive.
    player.nuki.forEach((tile, index) => {
      tiles.push({ key: `nuki:${player.id}:${tile.id}`, tileId: tile.id, face: atlasFace(tile),
        dora: isVisibleDora(tile, view.doraIndicators, view.rules.players),
        // Own flat hand overlays the near edge: use the open left shoulder of the table.
        ...seatPoint((seat === 0 ? -11.7 : 7.9) + index * 1.08 * scale, seat === 0 ? 9.9 : 12, seat),
        y: 0.31 * scale, flat: true, scale,
        motion: deal ? undefined : 'nuki', origin: { ...seatPoint(-2, 14.2, seat), y: 1.4 },
        highlighted: selection.highlight === tile.type });
    });
    const groupWidth = (items: typeof groups[number]) => items.reduce((width, item) => width + (item.added ? 0 : item.sideways ? 1.48 : 1.08), 0);
    let meldX = (seat === 0 ? 15.8 : 12) - groups.reduce((total, items) => total + groupWidth(items) * scale + 0.4, 0);
    groups.forEach((items, index) => {
      let x = meldX; let calledX = x;
      items.forEach(item => {
        const width = (item.sideways ? 1.48 : 1.08) * scale;
        const center = item.added ? calledX : x + width / 2;
        if (item.sideways && !item.added) calledX = center;
        tiles.push({ key: `meld:${player.melds[index].id}:${item.tile.id}`, tileId: item.back ? undefined : item.tile.id,
          dora: !item.back && isVisibleDora(item.tile, view.doraIndicators, view.rules.players),
          motion: 'meld', origin: { ...seatPoint(-2, 12.8, seat), y: 0.6 },
          face: item.back ? undefined : atlasFace(item.tile), ...seatPoint(center, 14.2, seat),
          y: (0.31 + (item.added ? 0.54 : 0)) * scale, flat: true, sideways: item.sideways, scale,
          highlighted: !item.back && selection.highlight === item.tile.type });
        if (!item.added) x += width;
      });
      meldX += groupWidth(items) * scale + 0.4;
    });
  }
  return deal ? tiles.map(tile => tile.key.startsWith('back:') ? { ...tile, motion: 'deal' as const,
    origin: { x: tile.x * .55, z: tile.z * .55, y: 2.5 }, delay: Math.floor(Number(tile.key.split(':').at(-1)) / 4) * 110 } : tile) : tiles;
}
