'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { SkillCinematicSequence } from './skill-cinematic-sequence';
import { useEffect, useState, type CSSProperties } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { silenceFilm } from '@/lib/silence-cinematic';
import { useCinematicPlayback } from '@/app/hooks/use-cinematic-playback';
import './silence-cinematic.css';

function Seal() {
  return <svg viewBox="0 0 120 160" aria-hidden="true"><path d="M60 12v136 M25 32 47 44 60 32 73 44 95 32 M25 66 47 78 60 66 73 78 95 66 M25 100 47 112 60 100 73 112 95 100" /><path d="M28 12 8 43v66l20 37 M92 12l20 31v66l-20 37" /></svg>;
}

function SilencePenalty({ event, phone, complete }: { event: SkillExperienceEvent; phone: boolean; complete: () => void }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const element = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(node => node.dataset.playerId === event.targets[0]);
      setBox(element?.getBoundingClientRect() ?? null);
      frame = requestAnimationFrame(measure);
    };
    if (!phone) measure();
    const timer = setTimeout(complete, phone ? 1800 : 1400);
    const hide = () => { if (document.hidden) complete(); };
    document.addEventListener('visibilitychange', hide);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
  }, [event.targets, phone, complete]);
  const style: CSSProperties | undefined = box ? { left: box.left, top: box.top, width: box.width, height: box.height } : undefined;
  return <div className={`silence-penalty-v2 ${box ? 'silence-penalty-anchored' : 'silence-penalty-notice'}`} style={style} role="status" aria-label="寂静之地违规反馈">
    <div className="silence-penalty-lines" aria-hidden="true"><Seal /></div><strong>{event.label}</strong><small>违规 · 场外扣分</small>
  </div>;
}

export function SilenceCinematic(props: Parameters<typeof SilenceCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><SilenceCinematicBody {...props} /></SkillCinematicSequence>;
}
function SilenceCinematicBody({ event, phone = false, complete }: { event: SkillExperienceEvent; phone?: boolean; complete: () => void }) {
  if (event.kind === 'penalty') return <SilencePenalty event={event} phone={phone} complete={complete} />;
  return <SilenceIntro event={event} phone={phone} complete={complete} />;
}

function SilenceIntro({ event, phone, complete }: { event: SkillExperienceEvent; phone: boolean; complete: () => void }) {
  const [film] = useState(() => silenceFilm(innerHeight > innerWidth));
  const [minimal] = useState(() => phone || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [title, setTitle] = useState(false);
  const [anchor, setAnchor] = useState({ x: innerWidth / 2, y: innerHeight / 2 });
  const { video, phase } = useCinematicPlayback({ film, minimal, phone, complete, onFrame: time => { if (time >= film.title) setTitle(true); } });
  useEffect(() => {
    const measure = () => {
      const element = document.querySelector<HTMLElement>('.tablet-center-console, .table-control-island');
      const box = element?.getBoundingClientRect();
      setAnchor(box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 });
    };
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const fallback = phase === 'fallback';
  return <section className={`silence-cinematic ${phone ? 'silence-phone' : ''}`} data-phase={phase} data-title={title || fallback || phase === 'return'} role="dialog" aria-modal="true" aria-label="寂静之地演出" style={{ '--silence-x': `${anchor.x}px`, '--silence-y': `${anchor.y}px` } as CSSProperties}>
    {!minimal && <div className="silence-film"><video ref={video} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture /></div>}
    {fallback && <div className="silence-fallback-shade" />}
    <div className="silence-return-seal"><Seal /></div>
    <div className="silence-title"><small>{event.actorName} · 静默封界</small><h2>寂静之地</h2><p>禁止非规则交流 · 禁止吃碰杠</p><span>违规场外扣 3,000 点</span></div>
    {phase === 'return' && !minimal && <CinematicReturnParticles theme="environment" />}
    <button autoFocus className="silence-skip" onClick={complete}>跳过演出</button>
  </section>;
}
