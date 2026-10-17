'use client';
import { useEffect, useRef } from 'react';
import { Undo2 } from 'lucide-react';
import { MahjongTile, tileName } from './mahjong-tile';

export function RemoteWinTileEntry({ tiles, players, change }: {
  tiles: string[]; players: number; change: (update: (current: string[]) => string[]) => void;
}) {
  const tray = useRef<HTMLDivElement>(null);
  const previousCount = useRef(tiles.length);
  useEffect(() => {
    if (tiles.length > previousCount.current && tray.current) tray.current.scrollTop = tray.current.scrollHeight;
    previousCount.current = tiles.length;
  }, [tiles.length]);
  const suits = [
    { name: '万', tiles: players === 3 ? ['1m', '9m'] : ['0m', ...Array.from({ length: 9 }, (_, i) => `${i + 1}m`)] },
    { name: '筒', tiles: ['0p', ...Array.from({ length: 9 }, (_, i) => `${i + 1}p`)] },
    { name: '索', tiles: ['0s', ...Array.from({ length: 9 }, (_, i) => `${i + 1}s`)] },
    { name: '字', tiles: Array.from({ length: 7 }, (_, i) => `${i + 1}z`) },
  ];
  return <section className="remote-tile-entry" aria-label="和牌录牌区">
    <div className="entry-hand-area">
      <div className="entry-hand-heading"><span>已录 <output aria-live="polite">{tiles.length}</output> 张</span><button type="button" disabled={!tiles.length} onClick={() => change(current => current.slice(0, -1))}><Undo2 />撤销末张</button></div>
      <div ref={tray} className="entry-hand" aria-label="已录入的手牌">
        {tiles.map((tile, index) => <button type="button" key={`${index}-${tile}`} aria-label={`移除第${index + 1}张：${tileName(tile)}`} onClick={() => change(current => current.filter((_, i) => i !== index))}><MahjongTile tile={tile} /></button>)}
        {!tiles.length && <span>点下方牌面录入<br /><small>也可直接切到“役与符”手动选择</small></span>}
      </div>
      <p className="entry-hand-hint">点已录入的牌可移除 · 包含吃碰杠的全部牌张</p>
    </div>
    <div className="entry-palette" aria-label="可录入的麻将牌">{suits.map(suit => <div key={suit.name} className="entry-suit" data-suit={suit.name}>
      <span>{suit.name}</span><div className="entry-suit-tiles">{suit.tiles.map(tile => {
        const count = tiles.filter(selected => selected === tile).length;
        return <button type="button" key={tile} data-tile={tile} data-picked={count > 0} aria-label={`录入${tileName(tile)}`} onClick={() => change(current => [...current, tile])}><MahjongTile tile={tile} />{count > 0 && <small aria-hidden="true">{count}</small>}</button>;
      })}</div>
    </div>)}</div>
  </section>;
}
