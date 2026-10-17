'use client';
import { useState, useSyncExternalStore } from 'react';
import { hasNativeLanRoom } from '@/lib/lan-native';
import { NfcIntentTarget } from './nfc-card-scanner';
import { MahjongApp } from './mahjong-app';
import VirtualLanPage from '@/app/virtual/lan/page';
import VirtualPractice from '@/app/virtual/page';

/** Mount only one mode: the physical LAN hooks never run alongside virtual listeners. */
export function ModeEntry() {
  const native = useSyncExternalStore<boolean | null>(() => () => {}, hasNativeLanRoom, () => null);
  const [mode, setMode] = useState<'choose' | 'physical' | 'virtual' | 'practice'>('choose');
  if (native === null) return <main className="vr-room">正在加载对局模式…</main>;
  if (!native) return <MahjongApp />;
  if (mode === 'physical') return <MahjongApp onBackToModes={() => setMode('choose')} />;
  if (mode === 'virtual') return <><NfcIntentTarget cards={[]} canPrepare={false} onPrepare={()=>{}}/><VirtualLanPage onBack={() => setMode('choose')} /></>;
  if (mode === 'practice') return <><NfcIntentTarget cards={[]} canPrepare={false} onPrepare={()=>{}}/><VirtualPractice onBack={() => setMode('choose')} /></>;
  return <main className="vr-room vr-mode"><header><small>麻将无双</small><h1>选择对局模式</h1></header><div className="vr-mode-choices"><section>
    <h2>实体麻将</h2><p>使用现实牌桌，保留计分、平板主机和手机遥控。</p><button onClick={() => setMode('physical')}>实体麻将</button>
  </section><section><h2>虚拟麻将</h2><p>一人创建房间，朋友通过同一 Wi-Fi 加入，每个人用手机摸牌与出牌。</p><button onClick={() => setMode('virtual')}>虚拟麻将</button><button onClick={() => setMode('practice')}>单机3D试打</button></section></div></main>;
}
