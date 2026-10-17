'use client';
import { useEffect, useRef } from 'react';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import type { Tile } from '@/lib/virtual-mahjong/tiles';
import { tileCode } from '@/lib/virtual-mahjong/tiles';
import { tileName } from '../mahjong-tile';
import { TileFace } from './tile-face';
import './call-choice.css';

type Choice = { id: string; label: string; self: boolean; tiles: Tile[] };
export function CallChoice({ choices, close, choose }: { choices: Choice[]; close: () => void; choose: (choice: Choice) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useNativeBackLayer(() => ref.current, close);
  return <dialog ref={ref} className="vm-call-choice" aria-labelledby="vm-choice-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="vm-choice-title">选择鸣牌组合</h2><p>点选牌组确认；返回不会执行鸣牌。对局计时继续。</p></header>
    <div className="vm-call-options">{choices.map((option, index) => <button key={option.id} type="button" aria-label={`${option.label}组合 ${index + 1}：${option.tiles.map(tile => tileName(tileCode(tile))).join('、')}`} onClick={() => choose(option)}><span>{option.label} · 组合 {index + 1}</span><div>{option.tiles.map(tile => <TileFace key={tile.id} tile={tile} />)}</div></button>)}</div>
    <footer><span>{choices.length} 种可选组合</span><button type="button" onClick={close}>返回牌桌</button></footer>
  </dialog>;
}
