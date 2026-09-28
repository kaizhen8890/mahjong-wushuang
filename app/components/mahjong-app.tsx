'use client';

/* oxlint-disable next/no-img-element -- The bundled brand mark is a local offline asset. */

import { useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Smartphone, Tablet, Wifi } from 'lucide-react';

import { MahjongConsole } from '@/app/components/mahjong-console';
import { RemoteController } from '@/app/components/remote-controller';
import { useLanClient } from '@/app/hooks/use-lan-client';
import { hasNativeLanRoom } from '@/lib/lan-native';

type AppMode = 'choose' | 'table' | 'remote';

const MODE_KEY = 'mahjong-wushuang:android-mode:v1';

export function MahjongApp({ onBackToModes }: { onBackToModes?: () => void } = {}) {
  const native = useSyncExternalStore(
    () => () => undefined,
    hasNativeLanRoom,
    () => false,
  );
  const [mode, setMode] = useState<AppMode>('choose');
  const client = useLanClient();

  const chooseMode = (next: 'table' | 'remote') => {
    localStorage.setItem(MODE_KEY, next);
    setMode(next);
  };

  if (!native) return <MahjongConsole />;

  if (mode === 'remote') {
    return (
      <RemoteController
        connectionState={client.connectionState}
        snapshot={client.snapshot}
        discoveredRooms={client.discoveredRooms}
        skillCards={client.skillCards}
        seatOptions={client.seatOptions}
        connectionMessage={client.connectionMessage}
        realtimeEvent={client.realtimeEvent}
        emoteEvents={client.emoteEvents}
        joinRoom={client.joinRoom}
        refreshRooms={client.refreshRooms}
        sendCommand={client.sendCommand}
        acknowledgeNotification={client.acknowledgeNotification}
        disconnect={client.disconnect}
        backToMode={() => {
          void client.disconnect();
          setMode('choose');
        }}
      />
    );
  }

  if (mode === 'table') {
    return <MahjongConsole onOpenModeChooser={() => setMode('choose')} />;
  }

  return (
    <main className="app-mode-shell">
      <section className="app-mode-card">
        <header className="app-mode-header">
          <div className="app-mode-brand">
            <span className="app-mode-mark"><img src="/brand/mahjong-wushuang-logo.png" alt="" /></span>
            <div><small>本地局域网版</small><h1>麻将无双</h1></div>
          </div>
          {onBackToModes && <button className="app-mode-back" type="button" onClick={onBackToModes}><ArrowLeft />返回</button>}
        </header>
        <div className="app-mode-intro">
          <span><Wifi /> 同一个 Wi-Fi 即可连接</span>
          <h2>这台设备要做什么？</h2>
          <p>平板负责显示牌桌和保存唯一对局状态；每位玩家的手机只显示自己的操作按钮与效果提醒。</p>
        </div>
        <div className="app-mode-options">
          <button type="button" onClick={() => chooseMode('table')}>
            <span className="app-mode-icon"><Tablet /></span>
            <span><strong>牌桌主机</strong><small>用于放在麻将桌中央的平板</small></span>
            <ArrowRight />
          </button>
          <button type="button" onClick={() => chooseMode('remote')}>
            <span className="app-mode-icon"><Smartphone /></span>
            <span><strong>手机遥控</strong><small>加入平板房间，摸牌、立直、和牌与发动技能</small></span>
            <ArrowRight />
          </button>
        </div>
        <small className="app-mode-footnote">两种模式都在同一个 APK 内，不需要安装第二个应用。</small>
      </section>
    </main>
  );
}
