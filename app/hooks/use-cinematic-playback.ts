'use client';
import { useEffect, useRef, useState } from 'react';
import { useCinematicReady } from '../components/skill-cinematic-sequence';
import { bindCinematicSound } from './use-game-audio';

/** Media-clock presentation only: skipping, failing or closing never changes a game. */
export function useCinematicPlayback({ film, minimal, phone, complete, onFrame }: {
  film: { duration: number; reveal: number; tail: number }; minimal: boolean; phone: boolean;
  complete: () => void; onFrame?: (time: number) => void;
}) {
  const ready = useCinematicReady();
  const video = useRef<HTMLVideoElement>(null), callback = useRef(onFrame);
  useEffect(() => { callback.current = onFrame; }, [onFrame]);
  const [phase, setPhase] = useState<'film' | 'return' | 'fallback'>(minimal ? 'fallback' : 'film');
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const player = video.current;
    if (minimal || !player) { const timer = setTimeout(complete, phone ? 1800 : 1600); return () => clearTimeout(timer); }
    let disposed = false, finished = false, fallback = false, raf = 0, returned = false;
    let closeTimer: ReturnType<typeof setTimeout> | undefined, unbind: (() => void) | undefined;
    let lastTime = -1, progressedAt = performance.now();
    const close = () => { if (!disposed && !finished) { finished = true; complete(); } };
    const fail = () => {
      if (disposed || fallback || finished) return;
      fallback = true; player.pause(); unbind?.(); unbind = undefined;
      setPhase('fallback'); closeTimer = setTimeout(close, 1600);
    };
    const started = () => { if (!disposed && !fallback) { setPlaying(true); unbind ??= bindCinematicSound(player, .85); } };
    const ended = () => { if (disposed || fallback || finished) return; setPhase('return'); unbind?.(); unbind = undefined; closeTimer = setTimeout(close, film.tail); };
    const hide = () => { if (document.hidden) close(); };
    const tick = () => {
      if (disposed || fallback || finished) return;
      if (player.currentTime !== lastTime) { lastTime = player.currentTime; progressedAt = performance.now(); }
      callback.current?.(player.currentTime);
      if (!returned && player.currentTime >= film.reveal) { returned = true; setPhase('return'); }
      if (!player.ended && performance.now() - progressedAt > 3500) { fail(); return; }
      raf = requestAnimationFrame(tick);
    };
    player.addEventListener('playing', started); player.addEventListener('ended', ended); player.addEventListener('error', fail);
    document.addEventListener('visibilitychange', hide);
    void player.play().catch(() => { if (disposed || fallback) return; player.muted = true; void player.play().catch(fail); });
    raf = requestAnimationFrame(tick);
    const watchdog = setTimeout(close, (film.duration + 6) * 1000);
    return () => {
      disposed = true; clearTimeout(watchdog); clearTimeout(closeTimer); cancelAnimationFrame(raf); unbind?.();
      player.removeEventListener('playing', started); player.removeEventListener('ended', ended); player.removeEventListener('error', fail);
      document.removeEventListener('visibilitychange', hide); player.pause(); player.removeAttribute('src'); player.load();
    };
  }, [ready, complete, film, minimal, phone]);
  return { video, phase, playing };
}
