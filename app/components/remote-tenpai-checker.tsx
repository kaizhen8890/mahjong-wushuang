'use client';

import { useMemo, useState } from 'react';
import { HandDisplay, MahjongTile } from './mahjong-tile';
import { TILE_IDS, TILE_LABELS } from '@/lib/mahjong';
import { inspectPhysicalTenpai } from '@/lib/physical-tenpai';
import type { PlayerCount } from '@/lib/virtual-mahjong/tiles';

export function RemoteTenpaiChecker({ players }: { players: PlayerCount }) {
  const [tiles, setTiles] = useState<string[]>([]);
  const [meldText, setMeldText] = useState('');
  const result = useMemo(() => inspectPhysicalTenpai(tiles, meldText, players), [tiles, meldText, players]);
  const choices = TILE_IDS.filter(tile => players === 4 || !tile.endsWith('m') || tile === '1m' || tile === '9m');
  const label = (tile: string) => TILE_LABELS[tile] ?? tile;
  return <section className="remote-tenpai-checker">
    <p>输入自己看得见的手牌。查询沿用虚拟麻将的听牌判定；这里只判断牌型，不判断役或能否和牌。</p>
    <div className="remote-tenpai-count"><strong>已录入 {tiles.length} 张</strong><span>副露时只录入未公开的手牌</span><button type="button" onClick={() => setTiles([])}>清空手牌</button></div>
    <div className="remote-selected-tiles" aria-label="已录入手牌">{tiles.map((tile, index) => <button type="button" key={`${tile}-${index}`} aria-label={`移除${label(tile)}`} onClick={() => setTiles(current => current.filter((_, i) => i !== index))}><MahjongTile tile={tile} /></button>)}{!tiles.length && <span>点击下方牌张录入；点击这里已录入的牌可移除。</span>}</div>
    <label className="remote-tenpai-melds">已副露或暗杠（可留空）<input value={meldText} onChange={event => setMeldText(event.target.value)} placeholder="例如：吃1m,碰5z,暗杠9s" /></label>
    <div className="remote-tile-picker"><div><span>万子</span><section>{choices.filter(tile => tile.endsWith('m')).map(tile => <button type="button" key={tile} aria-label={`添加${label(tile)}`} onClick={() => setTiles(current => current.length >= 14 ? current : [...current, tile])}><MahjongTile tile={tile} /></button>)}</section></div><div><span>筒子</span><section>{choices.filter(tile => tile.endsWith('p')).map(tile => <button type="button" key={tile} aria-label={`添加${label(tile)}`} onClick={() => setTiles(current => current.length >= 14 ? current : [...current, tile])}><MahjongTile tile={tile} /></button>)}</section></div><div><span>索子</span><section>{choices.filter(tile => tile.endsWith('s')).map(tile => <button type="button" key={tile} aria-label={`添加${label(tile)}`} onClick={() => setTiles(current => current.length >= 14 ? current : [...current, tile])}><MahjongTile tile={tile} /></button>)}</section></div><div><span>字牌</span><section>{choices.filter(tile => tile.endsWith('z')).map(tile => <button type="button" key={tile} aria-label={`添加${label(tile)}`} onClick={() => setTiles(current => current.length >= 14 ? current : [...current, tile])}><MahjongTile tile={tile} /></button>)}</section></div></div>
    <output className="remote-tenpai-result" aria-live="polite">{result.error ? <strong>{result.error}</strong> : result.previews.length ? result.previews.map(preview => <div key={preview.discard ?? 'current'}><strong>{preview.discard ? `打 ${label(preview.discard)} 后听` : '当前听牌'}</strong><HandDisplay tiles={preview.waits}/><span>{preview.waits.map(label).join('、')}</span></div>) : <strong>{tiles.length === result.expected + 1 ? '这手牌没有可听牌的舍牌' : '当前未听牌'}</strong>}</output>
  </section>;
}
