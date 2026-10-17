'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { SkillCinematicSequence } from './skill-cinematic-sequence';
import { useEffect, useState, type CSSProperties } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { treasureConfirmed, treasureFilm } from '@/lib/treasure-cinematic';
import { useCinematicPlayback } from '@/app/hooks/use-cinematic-playback';
import { bindCinematicSound } from '@/app/hooks/use-game-audio';
import './treasure-cinematic.css';

export function TreasureCinematic(props: Parameters<typeof TreasureCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><TreasureCinematicBody {...props} /></SkillCinematicSequence>;
}
function TreasureCinematicBody({ event, phone, complete }: { event: SkillExperienceEvent; phone: boolean; complete: () => void }) {
  const confirmed = treasureConfirmed(event);
  const [film] = useState(() => treasureFilm(innerHeight > innerWidth));
  const [minimal] = useState(() => phone || confirmed || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const { video, phase, playing } = useCinematicPlayback({ film, minimal, phone, complete });
  useEffect(() => {
    if (!confirmed || phone || document.hidden) return;
    const sound = new Audio('/cinematics/treasure/v1/reveal.mp3');
    const unbind = bindCinematicSound(sound, .55);
    void sound.play().catch(() => undefined);
    return () => { unbind(); sound.pause(); sound.removeAttribute('src'); sound.load(); };
  }, [confirmed, phone]);
  return <section className={`treasure-cinematic ${phone ? 'treasure-phone' : ''} ${confirmed ? 'treasure-confirmed' : ''}`}
    data-phase={phase} data-playing={playing} aria-label={confirmed ? '宝箱猎人翻牌确认' : '宝箱猎人演出'}>
    {!minimal && <div className="treasure-film">
      <video ref={video} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture aria-hidden="true" />
      <div className="treasure-vignette" />
    </div>}
    {phase === 'fallback' && !phone && !confirmed && <div className="treasure-still" style={{ backgroundImage: `url(${film.poster})` }} />}
    <header className="treasure-heading"><small>{event.actorName} · {confirmed ? '翻牌确认' : '环境发动'}</small><h2>宝箱猎人</h2><span>古 墓 解 封</span></header>
    <div className="treasure-rule">翻开所有宝牌指示器<small>本局四杠不流局</small></div>
    <div className="treasure-declaration" role="status">
      <div className="treasure-seal" aria-hidden="true"><svg viewBox="0 0 160 160"><path d="M80 5 155 80 80 155 5 80Z M80 20 140 80 80 140 20 80Z"/><circle cx="80" cy="80" r="42"/><path d="M67 67h26v26H67Z M80 25v12 M80 123v12 M25 80h12 M123 80h12"/></svg></div>
      {confirmed && <div className="treasure-gold-dust" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--angle': `${i * 137.5}deg`, '--distance': `${95 + i % 5 * 18}px`, '--delay': `${i % 4 * 40}ms` } as CSSProperties} />)}</div>}
      <small>{event.actorName} · {confirmed ? '已确认现实翻牌' : '环境已生效'}</small>
      <strong>{confirmed ? '宝牌已揭示' : '宝牌解封'}</strong>
      <b>{confirmed ? '本局四杠不流局' : '请在现实牌桌翻开所有宝牌指示器'}</b>
      <span>{confirmed ? '宝箱猎人 · 本局有效' : '本局四杠不流局 · 翻牌后由发动者确认'}</span>
    </div>
    {phase === 'return' && !minimal && <CinematicReturnParticles theme="environment" />}
    <button className="treasure-skip" onClick={complete}>跳过演出</button>
  </section>;
}
