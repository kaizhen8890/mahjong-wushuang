'use client';
import { SkillCinematicSequence, useCinematicReady } from './skill-cinematic-sequence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { specialFilms, type SpecialCard } from '@/lib/special-cinematic';
import { coinRevealDelay } from '@/lib/cinematic-motion';
import { startWushuangPlayback } from '@/lib/wushuang-playback';
import { bindCinematicSound } from '@/app/hooks/use-game-audio';
import { GodCardHandoff } from './god-card-handoff';
import type { CinematicPlayer } from './wushuang-cinematic';
import './wushuang-cinematic.css';

export function SpecialCinematic(props: Parameters<typeof SpecialCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><SpecialCinematicBody {...props} /></SkillCinematicSequence>;
}
function SpecialCinematicBody({ event, phone = false, players, complete, onFinished }: { event: SkillExperienceEvent; phone?: boolean; players?: readonly CinematicPlayer[]; complete: () => void; onFinished?: () => void }) {
  const ready = useCinematicReady();
  const finish = useCallback((reason: 'ended' | 'interrupted' | 'failed') => {
    if (reason === 'ended') onFinished?.();
    complete();
  }, [complete, onFinished]);
  const [films] = useState(() => specialFilms(event, innerHeight > innerWidth));
  const [minimal] = useState(() => phone || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const [segment, setSegment] = useState(0), [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!ready) return;
    if (minimal || !films.length) {
      const delay = coinRevealDelay(event, Date.now());
      const show = setTimeout(() => setRevealed(true), delay), timer = setTimeout(() => finish('ended'), delay + 2300);
      const hide = () => { if (document.hidden) complete(); };
      document.addEventListener('visibilitychange', hide);
      return () => { clearTimeout(show); clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
    }
    const players = refs.current.filter((p): p is HTMLVideoElement => !!p);
    return startWushuangPlayback({ players, sound: p => bindCinematicSound(p, .85), stage: i => { setSegment(i); setRevealed(false); }, reveal: () => setRevealed(true), fallback: () => setFailed(true), complete: finish, tailMs: 2400,
      revealTimes: films.map(f => f.reveal), timeoutMs: (films.reduce((n, f) => n + f.duration, 0) + 8) * 1000 });
  }, [ready, complete, finish, event, films, minimal]);
  const returning = !minimal && !failed && segment === films.length - 1 && revealed;
  return <section className={`wu-cinematic ${returning ? 'wu-return' : ''} ${minimal || failed ? 'wu-minimal' : ''}`} data-phase={returning ? 'return' : 'film'} role="dialog" aria-modal="true" aria-label={`${event.cardName}演出`}>
    {!minimal && films.map((film, i) => <video key={film.src} ref={p => { refs.current[i] = p; }} className={`wu-film ${segment === i ? 'wu-active' : ''}`} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture />)}
    {(minimal || failed) && <div className="wu-result" role="status"><small>{event.actorName}</small><h2>{event.cardName}</h2><p>{event.random?.kind === 'coin' && !revealed && !failed ? '命运掷币中' : event.label}</p></div>}
    {!minimal && !failed && !returning && <div className="god-intro">{event.cardName}<span>{event.actorName} · 发动</span></div>}
    {returning && <GodCardHandoff event={event} players={players} />}
    <button autoFocus className="wu-skip" onClick={complete}>跳过演出</button>
  </section>;
}
export function SpecialCinematicPreview() {
  const [event, setEvent] = useState<SkillExperienceEvent | null>(null); const close = useCallback(() => setEvent(null), []);
  const play = (name: SpecialCard, face?: number) => setEvent({ id: `preview-${Date.now()}`, createdAt: Date.now(), kind: face === undefined ? 'skill' : 'random', cardName: name,
    actorId: '', actorName: '演出预览', targets: [], label: '仅预览，不改变对局', ...(face === undefined ? {} : { random: { kind: 'coin' as const, faces: [face], total: face, outcomeId: `preview-${face}`, label: face ? '正面' : '反面', description: '仅预览' } }) });
  return <><div className="wu-preview-actions"><span>神卡演出</span><button onClick={() => play('断序杂音')}>断序杂音</button><button onClick={() => play('宿星审判')}>宿星审判</button><button onClick={() => play('听天问剑', 1)}>听天问剑 · 正面</button><button onClick={() => play('听天问剑', 0)}>听天问剑 · 反面</button></div>{event && createPortal(<SpecialCinematic key={event.id} event={event} complete={close} />, document.body)}</>;
}
