'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** First tap reveals the dimmed table. A hold still ends the effect explicitly. */
export function NightBlackout({ leave }: { leave?: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const ignoreClick = useRef(false);
  const surface = useRef<HTMLButtonElement>(null), callback = useRef(leave);
  useEffect(() => { callback.current = leave; }, [leave]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | undefined>(undefined);
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined; origin.current = undefined; };
  useEffect(() => {
    if (!revealed) return;
    let idle: ReturnType<typeof setTimeout>;
    const renew = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { ignoreClick.current = false; setRevealed(false); }, 10000);
    };
    renew();
    const events = ['pointerdown', 'pointermove', 'keydown', 'input'] as const;
    const interaction = (event: Event) => {
      if (event.type === 'pointermove' && !(event as globalThis.PointerEvent).buttons) return;
      renew();
    };
    for (const name of events) document.addEventListener(name, interaction, true);
    return () => {
      clearTimeout(idle);
      for (const name of events) document.removeEventListener(name, interaction, true);
    };
  }, [revealed]);
  useEffect(() => {
    if (revealed) return;
    const node = surface.current!, focused = document.activeElement;
    // The underlying table must not receive invisible taps or keyboard actions.
    const previous = new Map<HTMLElement, boolean>();
    const block = () => {
      for (const child of document.body.children) if (child instanceof HTMLElement && child !== node && !previous.has(child)) {
        previous.set(child, child.inert); child.inert = true;
      }
    };
    block(); node.focus({ preventScroll: true });
    const observer = new MutationObserver(block); observer.observe(document.body, { childList: true });
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancel(); observer.disconnect(); document.removeEventListener('visibilitychange', hidden);
      previous.forEach((inert, child) => { child.inert = inert; });
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    };
  }, [revealed]);
  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || document.hidden) return;
    ignoreClick.current = false;
    cancel(); origin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (callback.current) timer.current = setTimeout(() => { ignoreClick.current = true; cancel(); if (!document.hidden) callback.current?.(); }, 3000);
  };
  if (revealed) return null;
  return <button ref={surface} type="button" className="night-blackout" aria-label="暗夜之战：轻点显示超暗操作界面，长按 3 秒结束暗夜"
    onClick={event => { event.stopPropagation(); if (!ignoreClick.current && !document.hidden) setRevealed(true); }}
    onPointerDown={begin} onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onPointerMove={event => { const start = origin.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) { ignoreClick.current = true; cancel(); } }}
    onContextMenu={event => event.preventDefault()} onKeyDown={event => { if (event.key === 'Escape') callback.current?.(); }} />;
}
