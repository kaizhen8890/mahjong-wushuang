'use client';
import { useEffect, useRef, useState } from 'react';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import { changeLocalPlayers, localRules, type LocalSettings } from '@/lib/virtual-mahjong/local-settings';
import './local-controls.css';

export function LocalSetup({ initial, modal = false, start, close }: {
  initial: LocalSettings; modal?: boolean; start: (settings: LocalSettings) => void; close: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...initial }));
  const [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (modal && !ref.current?.open) ref.current?.showModal(); }, [modal]);
  useNativeBackLayer(() => ref.current, close);
  const content = <form className="vm-local-form" onSubmit={event => {
    event.preventDefault();
    try { localRules(draft); }
    catch { setError('起始点数须为 1,000 至 1,000,000 之间的 100 整数倍。'); return; }
    try { start(draft); setError(''); }
    catch { setError('未能开始牌局，请重试。'); }
  }}>
    <header><div><p>麻将无双 · 本地牌桌</p><h1 id="vm-local-setup-title">{modal ? '新开一场' : '单机3D试打'}</h1></div>
      <button type="button" onClick={close}>{modal ? '返回牌桌' : '返回'}</button></header>
    <div className="vm-local-form-body">
      {modal && <p className="vm-local-note">当前牌局已暂停。点击“开始牌局”后使用下方配置新开一场。</p>}
      <fieldset><legend>人机模式</legend><div className="vm-local-modes">
        <button type="button" aria-pressed={draft.botMode === 'cooperative'} onClick={() => setDraft({ ...draft, botMode: 'cooperative' })}>
          <strong>配合做牌</strong><small>人机按你的指令供牌，帮你做想要的牌。</small></button>
        <button type="button" aria-pressed={draft.botMode === 'normal'} onClick={() => setDraft({ ...draft, botMode: 'normal' })}>
          <strong>普通人机</strong><small>人机会简单组牌、立直和和牌。</small></button>
      </div></fieldset>
      <div className="vm-local-fields">
        <label>人数<select value={draft.players} onChange={event => setDraft(changeLocalPlayers(draft, Number(event.target.value) as 3 | 4))}>
          <option value={4}>四人麻将</option><option value={3}>三人麻将</option></select></label>
        <label>起始点数<input type="number" min={1000} max={1000000} step={100} required value={draft.startingPoints}
          onChange={event => setDraft({ ...draft, startingPoints: Number(event.target.value) })} /></label>
      </div>
      <label className="vm-local-toggle"><input type="checkbox" checked={draft.bankruptcy}
        onChange={event => setDraft({ ...draft, bankruptcy: event.target.checked })} />
        <span>击飞<small>{draft.bankruptcy ? '负分时结束整场' : '负分继续对局'}</small></span></label>
      <label className="vm-local-toggle vm-local-zenith"><input type="checkbox" checked={draft.zenithHand}
        onChange={event => setDraft({ ...draft, zenithHand: event.target.checked })} />
        <span>天顶星手牌<small>每局随机役满模板，每张起手牌独立有12%概率随机替换。</small></span></label>
      {error && <p role="alert">{error}</p>}
    </div>
    <footer><span>{draft.players} 人 · {draft.botMode === 'cooperative' ? '配合做牌' : '普通人机'}</span>
      <button type="submit" className="vm-local-primary">开始牌局</button></footer>
  </form>;
  return modal ? <dialog ref={ref} className="vm-local-dialog" aria-labelledby="vm-local-setup-title"
    onCancel={event => { event.preventDefault(); close(); }}>{content}</dialog>
    : <main className="vm-local-lobby">{content}</main>;
}
