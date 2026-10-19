'use client';
import { useEffect, useRef, useState } from 'react';
import { Monitor, Volume2, Hand, X } from 'lucide-react';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import { RIICHI_MUSIC } from '@/app/hooks/use-game-audio';
import { QUALITY_LEVELS, type TableQuality } from './three/quality';
import './settings-panel.css';
import type { LocalTableControls } from './table';

export function TableSettingsPanel({ close, three, toggleThree, quality, changeQuality, graphicsError, reduced, setReduced, sound, setSound, music, setMusic, track, setTrack, confirmMode, setConfirmMode, chooseCharacter, local }: {
  close: () => void; three: boolean; toggleThree: () => void; quality: TableQuality; changeQuality: (value: TableQuality) => void;
  graphicsError: string; reduced: boolean; setReduced: (value: boolean) => void; sound: number; setSound: (value: number) => void;
  music: number; setMusic: (value: number) => void; track: string; setTrack: (value: string) => void;
  confirmMode: boolean; setConfirmMode: (value: boolean) => void; chooseCharacter?: () => void;
  local?: LocalTableControls;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState('显示');
  useEffect(() => { ref.current?.showModal(); }, []);
  useNativeBackLayer(() => ref.current, close);
  return <dialog ref={ref} className="vm-preferences" aria-labelledby="vm-preferences-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="vm-preferences-title">牌桌设置</h2><p>{local ? '对局已暂停 · 返回后继续' : '调整立即生效 · 对局计时继续'}</p></div><button type="button" aria-label="收起牌桌设置" onClick={close}><X /></button></header>
    <nav aria-label="设置分组">{[['显示', Monitor], ['声音', Volume2], ['操作', Hand]].map(([name, Icon]) => { const LabelIcon = Icon as typeof Monitor; return <button type="button" key={String(name)} aria-pressed={section === name} onClick={() => setSection(String(name))}><LabelIcon />{String(name)}</button>; })}</nav>
    <div className="vm-preferences-body">
      {section === '显示' && <>
        <section><h3>牌桌显示 <span>{three ? '3D' : '平面'}</span></h3><button type="button" onClick={toggleThree}>{three ? '切换平面牌桌' : '切换3D牌桌'}</button>{graphicsError && <output>{graphicsError}</output>}
          {three && <fieldset><legend>画质</legend><div className="vm-preferences-options">{QUALITY_LEVELS.map(level => <button key={level.id} aria-pressed={quality === level.id} onClick={() => changeQuality(level.id)}>{level.label}</button>)}</div><small>高画质更耗电；运行不畅时可调低。</small></fieldset>}</section>
        <section><h3>动态效果 <span>{reduced ? '已减少' : '完整'}</span></h3><div className="vm-preferences-options"><button aria-pressed={!reduced} onClick={() => setReduced(false)}>完整效果</button><button aria-pressed={reduced} onClick={() => setReduced(true)}>减少动态</button></div></section>
        {chooseCharacter && <section><h3>我的角色</h3><button onClick={chooseCharacter}>选择角色</button></section>}
      </>}
      {section === '声音' && <>
        <section>{([{ label: '音效音量', value: sound, change: setSound }, { label: '音乐音量', value: music, change: setMusic }]).map(item => <label className="vm-volume" key={item.label}><span>{item.label}<output>{Math.round(item.value * 100)}%</output></span><input aria-label={item.label} type="range" min="0" max="1" step=".05" value={item.value} onChange={event => item.change(Number(event.target.value))} /></label>)}</section>
        <section><label>立直曲目<select aria-label="立直曲目" value={track} onChange={event => setTrack(event.target.value)}><option value="random">随机播放</option>{RIICHI_MUSIC.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></section>
      </>}
      {section === '操作' && <section><h3>出牌方式</h3><div className="vm-preferences-choices"><button aria-pressed={!confirmMode} onClick={() => setConfirmMode(false)}><strong>双击同一张牌</strong><small>先选中，再点一次打出</small></button><button aria-pressed={confirmMode} onClick={() => setConfirmMode(true)}><strong>选牌后确认</strong><small>选中手牌，再点出牌按钮</small></button></div><p>自动理牌、和牌、鸣牌与摸切仍在牌桌侧边调整。</p></section>}
      {local && <section><h3>本地牌局</h3><div className="vm-preferences-options">{local.openSupply && <button onClick={local.openSupply}>供牌与保留</button>}<button onClick={local.openSetup}>新开一场</button></div><small>新开一场可调整人数、点数、击飞和人机模式。</small></section>}
    </div>
    <footer><span>仅调整本机体验</span><button onClick={close}>返回牌桌</button></footer>
  </dialog>;
}
