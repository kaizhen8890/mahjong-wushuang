'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { SkillCinematicSequence, useCinematicReady } from './skill-cinematic-sequence';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { targetRect, witchFilm } from '@/lib/witch-cinematic';
import { bindCinematicSound } from '@/app/hooks/use-game-audio';
import './witch-cinematic.css';

export function WitchCinematic(props: Parameters<typeof WitchCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><WitchCinematicBody {...props} /></SkillCinematicSequence>;
}
function WitchCinematicBody({ event, phone, complete }: { event: SkillExperienceEvent; phone: boolean; complete: () => void }) {
  // Keep this file for the entire playback. Rotation reflows the frame and target,
  // never reloads the movie or replays an impact/sound.
  const ready = useCinematicReady();
  const [film] = useState(() => witchFilm(event, innerHeight > innerWidth));
  const [minimal] = useState(() => phone || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [phase, setPhase] = useState<'film' | 'return' | 'fallback'>(minimal ? 'fallback' : 'film');
  const [playing, setPlaying] = useState(false);
  const [target, setTarget] = useState(() => targetRect(undefined, innerWidth, innerHeight));
  const video = useRef<HTMLVideoElement>(null);
  const judgement = event.kind === 'judgement';
  const survivorAward = judgement && event.label.includes('幸存者获得 4,000 点');

  useEffect(() => {
    const measure = () => {
      const element = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(node => node.dataset.playerId === event.targets[0]);
      setTarget(targetRect(element?.getBoundingClientRect(), innerWidth, innerHeight));
    };
    measure(); window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    document.querySelectorAll('.tablet-player-card').forEach(node => observer.observe(node));
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [event.targets]);

  useEffect(() => {
    if (!ready) return;
    const player = video.current;
    if (minimal || !player) { const timer = setTimeout(complete, phone ? 1800 : 1600); return () => clearTimeout(timer); }
    let disposed = false, finished = false, fallback = false, raf = 0;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let unbind: (() => void) | undefined;
    let lastTime = -1, progressedAt = performance.now();
    const close = () => { if (!disposed && !finished) { finished = true; complete(); } };
    const fail = () => {
      if (disposed || fallback || finished) return;
      fallback = true; player.pause(); unbind?.(); unbind = undefined;
      setPhase('fallback'); closeTimer = setTimeout(close, 1600);
    };
    const started = () => { if (!disposed && !fallback) { setPlaying(true); unbind ??= bindCinematicSound(player, .85); } };
    const ended = () => { setPhase('return'); unbind?.(); unbind = undefined; closeTimer = setTimeout(close, film.tail + (survivorAward ? 450 : 0)); };
    const hide = () => { if (document.hidden) close(); };
    const tick = () => {
      if (disposed || finished || fallback) return;
      if (player.currentTime !== lastTime) { lastTime = player.currentTime; progressedAt = performance.now(); }
      if (player.currentTime >= film.reveal) setPhase('return');
      if (!player.ended && performance.now() - progressedAt > 3500) { fail(); return; }
      raf = requestAnimationFrame(tick);
    };
    player.addEventListener('playing', started); player.addEventListener('ended', ended); player.addEventListener('error', fail);
    document.addEventListener('visibilitychange', hide);
    void player.play().catch(() => {
      // WebView without an unlocked audio session may reject audible autoplay.
      // Continue the same film silently; never leave an opaque stalled overlay.
      if (disposed || fallback) return;
      player.muted = true; void player.play().catch(fail);
    });
    raf = requestAnimationFrame(tick);
    const watchdog = setTimeout(close, (film.duration + 6) * 1000);
    return () => {
      disposed = true; clearTimeout(watchdog); clearTimeout(closeTimer); cancelAnimationFrame(raf); unbind?.();
      player.removeEventListener('playing', started); player.removeEventListener('ended', ended); player.removeEventListener('error', fail);
      document.removeEventListener('visibilitychange', hide);
      player.pause(); player.removeAttribute('src'); player.load();
    };
  }, [ready, complete, film, minimal, phone, survivorAward]);

  const style = { '--witch-x': `${target.x}%`, '--witch-y': `${target.y}%`, '--witch-w': `${target.width}px`, '--witch-h': `${target.height}px` } as CSSProperties;
  return <section className={`witch-cinematic ${judgement ? 'witch-judgement' : 'witch-intro'} ${phone ? 'witch-phone' : ''}`}
    data-phase={phase} data-playing={playing} data-target-found={target.found} style={style} aria-label={`${event.cardName}演出`}>
    {!minimal && <div className="witch-film"><video ref={video} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture aria-hidden="true" /><div className="witch-vignette" /></div>}
    {phase === 'fallback' && !phone && <div className="witch-still" style={{ backgroundImage: `url(${film.poster})` }} />}
    <div className="witch-caption" role="status"><small>{event.actorName} · {judgement ? '审判发动' : '环境降临'}</small><h2>{judgement ? '裁 决' : '魔女审判'}</h2><span>{film.name}</span><p>{event.label}</p></div>
    {judgement && phase === 'return' && !phone && <div className="witch-target-impact" aria-hidden="true">
      <div className="witch-cut"/><div className="witch-shock"/><div className="witch-target-frame"/>

      <b>本局退出</b>
    </div>}
    {survivorAward && (phase === 'return' || phase === 'fallback') && <div className="witch-award"><small>最后幸存者</small><strong>+4,000</strong><span>系统奖励 · 本局结束</span></div>}
    {phase === 'return' && !minimal && <CinematicReturnParticles theme={judgement ? 'witch' : 'environment'} targetIds={judgement ? event.targets : undefined} />}
    <button className="witch-skip" onClick={complete}>跳过演出</button>
  </section>;
}
