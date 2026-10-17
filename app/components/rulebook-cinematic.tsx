'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { SkillCinematicSequence } from './skill-cinematic-sequence';
import { useRef, useState, type CSSProperties } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { fitQuad, quadMatrix, rulebookFilm, rulebookYaku, sampleQuad } from '@/lib/rulebook-cinematic';
import { useCinematicPlayback } from '@/app/hooks/use-cinematic-playback';
import './rulebook-cinematic.css';

export function RulebookCinematic(props: Parameters<typeof RulebookCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><RulebookCinematicBody {...props} /></SkillCinematicSequence>;
}
function RulebookCinematicBody({ event, phone, complete }: { event: SkillExperienceEvent; phone: boolean; complete: () => void }) {
  const [film] = useState(() => rulebookFilm(innerHeight > innerWidth));
  const [minimal] = useState(() => phone || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const inscription = useRef<HTMLDivElement>(null), yaku = rulebookYaku(event);
  const { video, phase, playing } = useCinematicPlayback({ film, minimal, phone, complete, onFrame: time => {
    const node = inscription.current;
    if (!node) return;
    const quad = fitQuad(sampleQuad(film.anchors, time), film.width, film.height, innerWidth, innerHeight);
    node.style.transform = `matrix3d(${quadMatrix(quad).join(',')})`;
    node.style.opacity = `${Math.max(0, Math.min(1, (time - 3.75) / .25))}`;
  } });
  return <section className={`rulebook-cinematic ${phone ? 'rulebook-phone' : ''}`} data-phase={phase} data-playing={playing} aria-label="规则怪谈演出">
    {!minimal && <div className="rulebook-film"><video ref={video} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture aria-hidden="true" />
      <div className="rulebook-vignette" />
      <div ref={inscription} className="rulebook-inscription" aria-hidden="true" style={{ '--yaku-size': `${Math.min(108, 510 / Math.max(yaku.length, 1))}px` } as CSSProperties}>
        <small>此 局 重 订</small><strong>{yaku}</strong><b>固定 <em>5</em> 番</b><span>取代原番 · 可与其他役种叠加</span>
      </div>
    </div>}
    {phase === 'fallback' && !phone && <div className="rulebook-still" style={{ backgroundImage: `url(${film.poster})` }} />}
    <header className="rulebook-heading"><small>{event.actorName} · 改写规则</small><h2>规则怪谈</h2><span>禁 典 重 订</span></header>
    <div className="rulebook-declaration" role="status"><small>本局声明役种</small><strong>{yaku}</strong><b>固定 <em>5</em> 番</b><span>取代原番 · 可与其他役种叠加</span></div>
    {phase === 'return' && !minimal && <CinematicReturnParticles theme="environment" />}
    <button className="rulebook-skip" onClick={complete}>跳过演出</button>
  </section>;
}
