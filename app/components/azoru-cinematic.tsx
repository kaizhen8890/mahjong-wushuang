'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { SkillCinematicSequence } from './skill-cinematic-sequence';
import { useRef, useState } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { azoruFilm, azoruNumber } from '@/lib/azoru-cinematic';
import { fitQuad, quadMatrix, sampleQuad } from '@/lib/rulebook-cinematic';
import { useCinematicPlayback } from '@/app/hooks/use-cinematic-playback';
import './azoru-cinematic.css';

export function AzoruCinematic(props: Parameters<typeof AzoruCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><AzoruCinematicBody {...props} /></SkillCinematicSequence>;
}
function AzoruCinematicBody({ event, phone, complete }: { event: SkillExperienceEvent; phone: boolean; complete: () => void }) {
  const [film] = useState(() => azoruFilm(innerHeight > innerWidth));
  const [minimal] = useState(() => phone || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const inscription = useRef<HTMLDivElement>(null), number = azoruNumber(event);
  const { video, phase, playing } = useCinematicPlayback({ film, minimal, phone, complete, onFrame: time => {
    const node = inscription.current;
    if (!node) return;
    const quad = fitQuad(sampleQuad(film.anchors, time), film.width, film.height, innerWidth, innerHeight);
    node.style.transform = `matrix3d(${quadMatrix(quad, 640, 960).join(',')})`;
    node.style.opacity = `${Math.max(0, Math.min(1, (time - 3.65) / .45))}`;
  } });
  return <section className={`azoru-cinematic ${phone ? 'azoru-phone' : ''}`} data-phase={phase} data-playing={playing} aria-label="偶氮玉红演出">
    {!minimal && <div className="azoru-film">
      <video ref={video} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture aria-hidden="true" />
      <div className="azoru-vignette" />
      <div ref={inscription} className="azoru-inscription" aria-hidden="true"><small>宣 告 之 数</small><strong>{number ?? '？'}</strong><span>赤 染 成 玉</span></div>
    </div>}
    {phase === 'fallback' && !phone && <div className="azoru-still" style={{ backgroundImage: `url(${film.poster})` }} />}
    <header className="azoru-heading"><small>{event.actorName} · 环境发动</small><h2>偶氮玉红</h2><span>赤 染 炼 成</span></header>
    <div className="azoru-rule"><span>和牌时</span>每两张声明数字牌 · 追加一张宝牌<small>手牌含副露 · 不足两张不计</small></div>
    <div className="azoru-declaration" role="status"><small>本局声明数字</small><strong>{number ?? '待确认'}</strong><b>每两张该数字牌，追加一张宝牌</b><span>和牌时人工确认牌数 · 含副露</span></div>
    {phase === 'return' && !minimal && <CinematicReturnParticles theme="environment" />}
    <button className="azoru-skip" onClick={complete}>跳过演出</button>
  </section>;
}
