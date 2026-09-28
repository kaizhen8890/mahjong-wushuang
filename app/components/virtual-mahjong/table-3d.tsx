'use client';
import { useEffect, useRef } from 'react';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import { canAnimateTable } from './three/motion';
import { isNewDeal } from '@/lib/virtual-mahjong/table-effects';
import { layoutTable, type TableSelection } from './three/table-layout';
import type { TableQuality } from './three/quality';
import type { TableScene } from './three/table-scene';

export function Table3D(props: { view: PlayerVisibleGameState; selection: TableSelection; quality: TableQuality;
  pick: (id: number) => void; fail: (message: string) => void; entrance?: boolean; reduced?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<TableScene | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    const old = latest.current.view;
    if (old.gameId !== props.view.gameId || old.roundId !== props.view.roundId || old.turnId !== props.view.turnId || old.phase.kind !== props.view.phase.kind) scene.current?.cancelInput();
    const reduced = props.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const deal = !document.hidden && !reduced && isNewDeal(old, props.view);
    const animate = reduced ? false : old.revision === props.view.revision && old.roundId === props.view.roundId
      && old.gameId === props.view.gameId && old.viewerId === props.view.viewerId ? undefined
      : deal || canAnimateTable(old, props.view, !document.hidden, !!reduced);
    latest.current = props; scene.current?.setQuality(props.quality); scene.current?.setReducedMotion(reduced);
    if (deal) scene.current?.sync([], false);
    scene.current?.sync(layoutTable(props.view, props.selection, deal), animate);
  }, [props]);
  useEffect(() => {
    let cancelled = false; let owned: TableScene | null = null;
    const initial = latest.current.view;
    // Fresh canvas on every mount, including StrictMode cleanup/remount.
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '3D麻将桌面，手牌在下方');
    container.current!.appendChild(canvas);
    void import('./three/table-scene').then(async ({ TableScene }) => {
      if (cancelled) return;
      owned = new TableScene(canvas, id => latest.current.pick(id), message => latest.current.fail(message),
        matrix => container.current?.parentElement?.style.setProperty('--vm-center-projection', matrix));
      if (process.env.NODE_ENV === 'development') Object.defineProperty(canvas, 'tableScene', { value: owned });
      scene.current = owned; owned.setQuality(latest.current.quality); owned.setReducedMotion(!!latest.current.reduced);
      await owned.loadAtlas();
      if (!cancelled) {
        const deal = latest.current.entrance && initial.roundId === latest.current.view.roundId
          && initial.revision === latest.current.view.revision && !document.hidden && !latest.current.reduced
          && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        owned.sync(layoutTable(latest.current.view, latest.current.selection, deal), !!deal);
      }
    }).catch(() => { if (!cancelled) latest.current.fail('此设备暂时无法显示3D，已切回平面牌桌。'); });
    return () => { cancelled = true; owned?.dispose(); scene.current = null; canvas.remove(); };
  }, []);
  return <div className="vm-three-canvas" ref={container} />;
}


