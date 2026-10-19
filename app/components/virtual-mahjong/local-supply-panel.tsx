'use client';
import { useEffect, useRef, useState } from 'react';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import type { LocalControlState } from '@/lib/virtual-mahjong/local-session';
import { tileTypes, tileCode } from '@/lib/virtual-mahjong/tiles';
import { tileName } from '../mahjong-tile';
import { TileFace } from './tile-face';
import './local-controls.css';

export function LocalSupplyPanel({ controls, players, seats, supply, keep, cancel, clear, close }: {
  controls: LocalControlState; players: 3 | 4; seats: { id: string; name: string }[];
  supply: (type: number, target: string) => string;
  keep: (types: number[]) => string; cancel: () => void; clear: () => void; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<'supply' | 'keep'>('supply');
  const [target, setTarget] = useState(controls.supply?.target ?? 'next');
  const [feedback, setFeedback] = useState('');
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);
  useNativeBackLayer(() => ref.current, close);
  const name = (type: number) => tileName(tileCode({ type, red: false }));
  const status = controls.supply ? '待供：' + name(controls.supply.type) + ' · '
    + (controls.supply.target === 'next' ? '下一位人机' : seats.find(seat => seat.id === controls.supply!.target)?.name ?? '') : '尚未指定下一张';
  return <dialog ref={ref} className="vm-local-dialog vm-supply-dialog" aria-labelledby="vm-supply-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="vm-supply-title">供牌</h2><p>对局已暂停 · 选好后返回牌桌继续</p></div>
      <button type="button" onClick={close}>返回牌桌</button></header>
    <div className="vm-supply-toolbar">
      <div className="vm-supply-tabs"><button type="button" aria-pressed={action === 'supply'} onClick={() => setAction('supply')}>指定下一张</button>
        <button type="button" aria-pressed={action === 'keep'} onClick={() => setAction('keep')}>保留牌</button></div>
      {action === 'supply' ? <label>由谁供牌<select aria-label="供牌人机" value={target} onChange={event => {
        const nextTarget = event.target.value;
        if (controls.supply) {
          const message = supply(controls.supply.type, nextTarget);
          if (message) { setFeedback(message); return; }
          setFeedback('已改为由' + (nextTarget === 'next' ? '下一位人机' : seats.find(seat => seat.id === nextTarget)?.name ?? '') + '供牌。');
        }
        setTarget(nextTarget);
      }}>
        <option value="next">下一位人机</option>{seats.map(seat => <option key={seat.id} value={seat.id}>{seat.name}</option>)}</select></label>
        : <p>点选保留，再点取消 · 对全部人机生效</p>}
    </div>
    <div className="vm-supply-body">
      {[0, 1, 2, 3].map(suit => <div className="vm-supply-suit" key={suit}>
        {tileTypes(players).filter(type => Math.floor(type / 9) === suit).map(type => {
          const held = controls.keepTypes.includes(type), available = controls.availableTypes.includes(type);
          const chosen = action === 'keep' ? held : controls.supply?.type === type;
          return <button type="button" key={type} style={{ gridColumnStart: type % 9 + 1 }}
            aria-label={name(type) + (action === 'keep' ? (held ? '，已保留' : '，保留') : (available ? '，指定供牌' : '，当前无可供牌'))}
            aria-pressed={chosen} disabled={action === 'supply' && !available}
            title={!available ? '当前没有可供出的此牌' : name(type)}
            onClick={() => {
              const message = action === 'supply' ? supply(type, target)
                : keep(held ? controls.keepTypes.filter(item => item !== type) : [...controls.keepTypes, type]);
              setFeedback(message || (action === 'supply' ? '已指定' + name(type) + '；供出一张后自动清除。'
                : held ? '已取消保留。' : '人机将保留' + name(type) + '。'));
            }}><TileFace tile={{ id: type * 4, type, red: false }} />
            <small>{action === 'keep' && held ? '保留' : action === 'supply' && chosen ? '待供' : '\u00a0'}</small></button>;
        })}
      </div>)}
    </div>
    <div className="vm-supply-status" aria-live="polite"><strong>{status}</strong>
      <span>{feedback || controls.error || (action === 'supply' ? '需要吃牌时，可选择上家供牌。' : '保留牌直到取消或本局结束。')}</span></div>
    <footer><div><button type="button" onClick={() => { cancel(); setFeedback('已取消本次供牌。'); }}>取消供牌</button>
      <button type="button" onClick={() => { clear(); setFeedback('已清空供牌和保留。'); }}>全部清空</button></div>
      <button type="button" className="vm-local-primary" onClick={close}>继续对局</button></footer>
  </dialog>;
}
