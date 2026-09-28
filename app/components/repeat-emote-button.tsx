'use client';

import { useEffect, useRef } from 'react';

export function RepeatEmoteButton({ emote, disabled, onSend }: {
  emote: { id: string; label: string; src: string };
  disabled: boolean;
  onSend: () => Promise<boolean>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holding = useRef(false);
  const repeated = useRef(false);
  const sending = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const sender = useRef(onSend);
  useEffect(() => { sender.current = onSend; }, [onSend]);
  const stop = () => { holding.current = false; clearTimeout(timer.current); };
  useEffect(() => {
    if (disabled) stop();
    const blur = () => stop();
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);
    return () => {
      stop();
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
    };
  }, [disabled]);
  const send = async () => {
    if (sending.current || disabled) return false;
    sending.current = true;
    try { return await sender.current(); } finally { sending.current = false; }
  };
  const repeat = async () => {
    if (!holding.current) return;
    repeated.current = true;
    const accepted = await send();
    if (holding.current && accepted) timer.current = setTimeout(repeat, 400);
    else stop();
  };
  return <button type="button" disabled={disabled} aria-label={`发送表情 ${emote.label}`} title="点击发送，长按连发"
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      stop(); holding.current = true; repeated.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      timer.current = setTimeout(repeat, 450);
    }}
    onPointerMove={event => {
      if (holding.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 12) {
        repeated.current = true; stop();
      }
    }}
    onPointerUp={stop} onLostPointerCapture={stop}
    onPointerCancel={() => { repeated.current = true; stop(); }}
    onClick={() => { if (!repeated.current) void send(); repeated.current = false; }}>
    {/* oxlint-disable-next-line next/no-img-element -- Bundled local emote artwork. */}
    <img src={emote.src} alt="" loading="lazy" decoding="async" draggable={false} />

  </button>;
}
