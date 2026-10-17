'use client';
import { SkillCinematicSequence } from './skill-cinematic-sequence';
import { useRef } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { NIGHT_FILM } from '@/lib/night-cinematic';
import { useCinematicPlayback } from '@/app/hooks/use-cinematic-playback';
import './night-cinematic.css';

export function NightCinematic(props: Parameters<typeof NightCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event}  complete={props.complete}><NightCinematicBody {...props} /></SkillCinematicSequence>;
}
function NightCinematicBody({ event, complete }: { event: SkillExperienceEvent; complete: () => void }) {
  const caption = useRef<HTMLDivElement>(null), skip = useRef<HTMLButtonElement>(null);
  const { video, phase, playing } = useCinematicPlayback({ film: NIGHT_FILM, minimal: false, phone: false, complete, onFrame: time => {
    const opacity = `${Math.min(1, Math.max(0, (NIGHT_FILM.duration - .20 - time) / .30))}`;
    if (caption.current) caption.current.style.opacity = opacity;
    if (skip.current) skip.current.style.opacity = opacity;
  } });
  return <section className="night-cinematic" aria-label="暗夜之战演出" data-phase={phase} data-playing={playing}>
    <div className="night-cinematic-film"><video ref={video} src={NIGHT_FILM.src} poster={NIGHT_FILM.poster} preload="auto" playsInline disablePictureInPicture aria-hidden="true" /></div>
    <div ref={caption} className="night-cinematic-caption" role="status"><small>{event.actorName} · 环境发动</small><h2>暗夜之战</h2><span>夜 幕 降 临</span></div>
    <button ref={skip} className="night-cinematic-skip" onClick={complete}>跳过演出</button>
  </section>;
}
