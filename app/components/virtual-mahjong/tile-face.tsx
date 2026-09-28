/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG exposes its accessible tile name as an image. */
import type { Tile } from '@/lib/virtual-mahjong/tiles';
import { tileCode } from '@/lib/virtual-mahjong/tiles';
import { tileName } from '../mahjong-tile';
/** Display a tile from the supplied sheet, without changing shared physical-mode assets. */
export function TileFace({ tile, back = false, shine = false }: { tile?: Tile; back?: boolean; shine?: boolean }) {
  const code = !back && tile ? tileCode(tile) : 'back';
  if (code === 'back') return <svg className="vm-tile-face" viewBox="0 0 80 129" role="img" aria-label="暗牌"><rect x="1" y="1" width="78" height="127" rx="9" fill="#155e60" /><rect x="2" y="6" width="76" height="122" rx="8" fill="#c3d1bf" /><rect x="3" y="12" width="74" height="115" rx="7" fill="#1baa97" stroke="#75d6bd" strokeWidth="2" /><path d="M40 45 56 68 40 91 24 68Z M40 53V83 M30 68H50" fill="none" stroke="#a9ead0" strokeWidth="2" /></svg>;
  const column = code[0] === '0' ? 9 : Number(code[0]) - 1;
  const row = { s: 0, m: 1, p: 2, z: 3 }[code[1]]!;
  return <svg className="vm-tile-face" viewBox="0 0 80 129" role="img" aria-label={tileName(code)}><svg width="80" height="129" overflow="hidden"><image href="/virtual-tiles/tile-sheet.png" x={-column * 80} y={-row * 129} width="800" height="516" />{shine && <><rect className="vm-tile-sheen" x="0" y="129" width="80" height="48" fill="#fff"><animate attributeName="y" values="129;129;-48;-48" keyTimes="0;.18;.66;1" dur="3.2s" repeatCount="indefinite" /><animate attributeName="opacity" values="0;0;.36;.36;0;0" keyTimes="0;.18;.26;.66;.74;1" dur="3.2s" repeatCount="indefinite" /></rect><rect className="vm-tile-sheen" x="0" y="146" width="80" height="14" fill="#fff"><animate attributeName="y" values="146;146;-31;-31" keyTimes="0;.18;.66;1" dur="3.2s" repeatCount="indefinite" /><animate attributeName="opacity" values="0;0;.45;.45;0;0" keyTimes="0;.18;.26;.66;.74;1" dur="3.2s" repeatCount="indefinite" /></rect></>}</svg></svg>;
}
