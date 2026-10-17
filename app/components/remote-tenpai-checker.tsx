'use client';
import { useMemo, useState } from 'react';
import { HandDisplay, MahjongTile, tileName } from './mahjong-tile';
import { TILE_IDS } from '@/lib/mahjong';
import { inspectPhysicalTenpai } from '@/lib/physical-tenpai';
import { tileCode, tileIndex } from '@/lib/hand-analysis';
import type { PlayerCount } from '@/lib/virtual-mahjong/tiles';
import './skill-flow.css';

type MeldKind = '吃' | '碰' | '杠' | '暗杠';
type RecordedMeld = { kind: MeldKind; tile: string };
const kindLabel = (kind: MeldKind) => kind === '杠' ? '明杠' : kind;
const groupTiles = (meld: RecordedMeld) => meld.kind === '吃'
  ? [0, 1, 2].map(offset => tileCode(tileIndex(meld.tile) + offset))
  : Array<string>(meld.kind.includes('杠') ? 4 : 3).fill(meld.tile);

export function RemoteTenpaiChecker({ players }: { players: PlayerCount }) {
  const [tiles, setTiles] = useState<string[]>([]);
  const [melds, setMelds] = useState<RecordedMeld[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [kind, setKind] = useState<MeldKind>('吃');
  const meldText = melds.map(meld => meld.kind + meld.tile).join(',');
  const result = useMemo(() => inspectPhysicalTenpai(tiles, meldText, players), [tiles, meldText, players]);
  const choices = TILE_IDS.filter(tile => players === 4 || !tile.endsWith('m') || tile === '1m' || tile === '9m');
  const allowed = new Set(choices);
  const recorded = [...tiles, ...melds.flatMap(groupTiles)];
  const otherTiles = [...tiles, ...melds.filter((_, i) => i !== editing).flatMap(groupTiles)];
  const count = (list: string[], tile: string) => list.filter(value => value === tile).length;
  const groups = choices.map(tile => ({ kind, tile })).filter(meld => (kind !== '吃' || (tileIndex(meld.tile) < 27 && tileIndex(meld.tile) % 9 <= 6)) && groupTiles(meld).every(tile => allowed.has(tile)));
  return <section className="remote-tenpai-checker tenpai-visual">
    <p>只录入自己的牌。这里只查询牌型，不判断有役、振听或能否和牌。</p>
    <section className="tenpai-meld-section"><div className="tenpai-section-heading"><h3>已摆出的牌组</h3><span>{melds.length} / 4 组</span></div>
      <div className="tenpai-recorded-melds">{melds.map((meld, i) => <div key={i}><strong>{kindLabel(meld.kind)}</strong><HandDisplay tiles={groupTiles(meld)} /><div><button type="button" aria-label={`重选第${i + 1}组`} onClick={() => { setKind(meld.kind); setEditing(i); }}>重选</button><button type="button" aria-label={`删除第${i + 1}组`} onClick={() => { setMelds(current => current.filter((_, index) => index !== i)); setEditing(null); }}>删除</button></div></div>)}</div>
      {!melds.length && <p className="tenpai-hint">没有吃碰杠可跳过，暗杠也在这里添加。</p>}
      {editing === null ? <button type="button" className="tenpai-add-meld" disabled={melds.length >= 4} onClick={() => setEditing(-1)}>＋ 添加吃／碰／杠</button> : <div className="tenpai-meld-editor">
        <div className="tenpai-section-heading"><strong>{editing === -1 ? '添加牌组' : `重选第 ${editing + 1} 组`}</strong><button type="button" onClick={() => setEditing(null)}>取消选组</button></div>
        <div className="meld-kind-tabs">{(['吃', '碰', '杠', '暗杠'] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{kindLabel(value)}</button>)}</div>
        <p className="tenpai-hint">点选完整牌组；灰色表示会与已录入牌合计超过四张。</p>
        <div className="tenpai-meld-options">{groups.map(meld => { const group = groupTiles(meld); const disabled = [...new Set(group)].some(tile => count(otherTiles, tile) + count(group, tile) > 4); return <button type="button" key={meld.tile} disabled={disabled} aria-label={`添加${kindLabel(kind)}：${group.map(tileName).join('、')}`} onClick={() => { setMelds(current => editing === -1 ? [...current, meld] : current.map((item, i) => i === editing ? meld : item)); setEditing(null); }}><HandDisplay tiles={group} /></button>; })}</div>
      </div>}
    </section>
    <div className="remote-tenpai-count"><strong>手中 {tiles.length} 张</strong><span>待牌 {result.expected} 张 · 摸牌后 {result.expected + 1} 张</span><button type="button" disabled={!tiles.length} onClick={() => setTiles([])}>清空手牌</button></div>
    <div className="remote-selected-tiles" aria-label="已录入手牌">{tiles.map((tile, index) => <button type="button" key={`${tile}-${index}`} aria-label={`移除${tileName(tile)}`} onClick={() => setTiles(current => current.filter((_, i) => i !== index))}><MahjongTile tile={tile} /></button>)}{!tiles.length && <span>在下方点牌，只录入未摆出的手牌。</span>}</div>
    <output className="tenpai-input-status">{tiles.length < result.expected ? `还需 ${result.expected - tiles.length} 张可查当前听牌。` : tiles.length > result.expected + 1 ? `手牌多了 ${tiles.length - result.expected - 1} 张，请点上方牌张移除；牌组不要重复录入。` : tiles.length === result.expected ? '当前手牌张数正确，下面显示待牌结果。' : '摸牌后张数正确，下面显示可听牌的舍牌。'}</output>
    {tiles.length >= result.expected && tiles.length <= result.expected + 1 && <output className="remote-tenpai-result" aria-live="polite">{result.error ? <strong>{result.error}</strong> : result.previews.some(preview => preview.waits.length) ? result.previews.filter(preview => preview.waits.length).map(preview => <div key={preview.discard ?? 'current'}>{preview.discard ? <div className="tenpai-discard"><span>打</span><MahjongTile tile={preview.discard} /><span>→ 听</span></div> : <strong>当前听牌</strong>}<HandDisplay tiles={preview.waits} /><span>{preview.waits.map(tileName).join('、')}</span></div>) : <strong>{tiles.length === result.expected + 1 ? '这手牌没有可听牌的舍牌' : '当前未听牌'}</strong>}</output>}
    <div className="remote-tile-picker">{[['万子', 'm'], ['筒子', 'p'], ['索子', 's'], ['字牌', 'z']].map(([name, suit]) => <div key={suit}><span>{name}</span><section>{choices.filter(tile => tile.endsWith(suit)).map(tile => <button type="button" key={tile} disabled={tiles.length >= result.expected + 1 || count(recorded, tile) >= 4} aria-label={`添加${tileName(tile)}`} onClick={() => setTiles(current => [...current, tile])}><MahjongTile tile={tile} /></button>)}</section></div>)}</div>
  </section>;
}
