'use client';

/* oxlint-disable next/no-img-element -- Emotes are bundled, user-managed transparent PNG assets. */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Clock3 } from 'lucide-react';

import { useEmoteLibrary } from './emote-picker';
import { GAME_EMOTES_BY_ID } from '@/lib/emotes';
import { calculateTurnClock, turnElapsedMs, type GameState } from '@/lib/mahjong';
import type { ControllerRealtimeEvent } from '@/lib/lan-protocol';

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function FloatingEmote({ events = [], tablet = false }: { events?: ControllerRealtimeEvent[]; tablet?: boolean }) {
  return <>{events.map((event, slot) => <EmoteSlot key={event.eventId} event={event} slot={slot} tablet={tablet} />)}</>;
}

function EmoteSlot({ event, slot, tablet }: { event: ControllerRealtimeEvent; slot: number; tablet: boolean }) {
  useEmoteLibrary();
  const ref = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  useLayoutEffect(() => {
    if (!tablet || dismissed) return;
    const element = ref.current;
    const card = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(p => p.dataset.playerId === event.actorPlayerId);
    if (!element || !card) return;
    const position = () => {
      const r = card.getBoundingClientRect();
      let x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (card.classList.contains('seat-top')) y = r.bottom + 50;
      else if (card.classList.contains('seat-bottom')) y = r.top - 50;
      else if (card.classList.contains('seat-left')) x = r.right + 60;
      else x = r.left - 60;
      element.style.setProperty('--emote-x', `${Math.max(65, Math.min(innerWidth - 65, x))}px`);
      element.style.setProperty('--emote-y', `${Math.max(65, Math.min(innerHeight - 65, y))}px`);
    };
    position(); const observer = new ResizeObserver(position); observer.observe(card);
    window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); };
  }, [tablet, event.actorPlayerId, dismissed]);
  const emote = event.emoteId ? GAME_EMOTES_BY_ID.get(event.emoteId) : undefined;
  useEffect(() => {
    const timer = window.setTimeout(() => setDismissed(true), 3100);
    return () => window.clearTimeout(timer);
  }, []);
  const hash = stableHash(event.eventId);
  const style = {
    '--emote-x': `${(slot % 2 ? 60 : 18) + (hash % 20)}vw`,
    '--emote-y': `${(slot < 2 ? 23 : 56) + ((hash >>> 8) % 19)}dvh`,
    '--emote-tilt': `${(hash % 9) - 4}deg`,
  } as CSSProperties;
  if (!emote || dismissed) return null;
  return (
<aside ref={ref} className="game-floating-emote" style={style} aria-live="polite" onAnimationEnd={() => setDismissed(true)}>
      <img src={emote.src} alt={emote.label} />
      <strong>{event.actorName}</strong>
    </aside>
  );
}

/** 平板与广播共用同一套计时计算；手机只显示主机下发的秒数。 */
export function useTurnCountdown(state: GameState) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      window.clearTimeout(timer);
      const currentTime = Date.now();
      setNow(currentTime);
      const clock = calculateTurnClock(state, currentTime);
      if (clock.enabled && !clock.expired && !document.hidden) {
        timer = window.setTimeout(tick, 1000 - turnElapsedMs(state, currentTime) % 1000 + 10);
      }
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [state]);
  return calculateTurnClock(state, Math.max(now, state.turnStartedAt));
}

export function TurnTimerDisplay({
  playerLabel,
  fixedRemaining,
  extraRemaining,
  usingExtra,
  expired,
  compact = false,
  statusLabel,
}: {
  playerLabel: string;
  fixedRemaining: number;
  extraRemaining: number;
  usingExtra: boolean;
  expired: boolean;
  compact?: boolean;
  statusLabel?: string;
}) {
  return (
    <div className={`turn-timer ${compact ? 'is-compact' : ''} ${usingExtra ? 'is-extra' : ''} ${expired ? 'is-expired' : ''}`}>
      <Clock3 />
      <span><small>{playerLabel}{statusLabel === '已暂停' ? ' · 已暂停' : ''}</small><strong>{statusLabel === '等待摸牌' ? '等待摸牌' : expired ? '超时' : `${fixedRemaining + extraRemaining}s`}</strong></span>
      <i>{fixedRemaining}s 固定</i>
      <i>+{extraRemaining}s 额外</i>
    </div>
  );
}
