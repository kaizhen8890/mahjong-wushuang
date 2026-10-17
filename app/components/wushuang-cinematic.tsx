'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { SkillCinematicSequence, useCinematicReady } from './skill-cinematic-sequence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterChoice } from '@/lib/characters';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { wushuangFilms, type WushuangOutcome } from '@/lib/wushuang-cinematic';
import { coinRevealDelay } from '@/lib/cinematic-motion';
import { startWushuangPlayback } from '@/lib/wushuang-playback';
import { bindCinematicSound } from '@/app/hooks/use-game-audio';
import { CharacterPortrait } from './character-picker';
import './wushuang-cinematic.css';

export type CinematicPlayer = { id: string; name: string; character?: CharacterChoice };
export function WushuangCinematic(props: Parameters<typeof WushuangCinematicBody>[0]) {
  return <SkillCinematicSequence key={props.event.id} event={props.event} phone={props.phone} complete={props.complete}><WushuangCinematicBody {...props} /></SkillCinematicSequence>;
}
function WushuangCinematicBody({ outcome, event, players = [], phone = false, complete }: {
  outcome: WushuangOutcome; event: SkillExperienceEvent; players?: readonly CinematicPlayer[]; phone?: boolean; complete: () => void;
}) {
  const ready = useCinematicReady();
  const [films] = useState(() => wushuangFilms(outcome, innerHeight > innerWidth, event.random?.source === 'manual'));
  const [minimal] = useState(() => phone || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const first = useRef<HTMLVideoElement>(null), second = useRef<HTMLVideoElement>(null);
  const [segment, setSegment] = useState(0), [revealed, setRevealed] = useState(false), [failed, setFailed] = useState(false);
  const subjectId = outcome === 'heads' ? event.actorId : event.targets.length === 1 ? event.targets[0] : undefined;
  const subject = players.find(p => p.id === subjectId);
  useEffect(() => {
    if (!ready) return;
    if (minimal) {
      const revealDelay = coinRevealDelay(event, Date.now());
      const show = setTimeout(() => setRevealed(true), revealDelay);
      const close = setTimeout(complete, revealDelay + 2300);
      const hide = () => { if (document.hidden) complete(); };
      document.addEventListener('visibilitychange', hide);
      return () => { clearTimeout(show); clearTimeout(close); document.removeEventListener('visibilitychange', hide); };
    }
    if (!first.current || (films.length > 1 && !second.current)) return;
    return startWushuangPlayback({ players: [first.current, second.current].filter((player): player is HTMLVideoElement => !!player), sound: p => bindCinematicSound(p, .85),
      stage: i => { setSegment(i); setRevealed(false); }, reveal: () => setRevealed(true),
      fallback: () => { setFailed(true); setRevealed(true); }, complete, revealTimes: films.map(film => film.reveal),
      timeoutMs: (films.reduce((sum, film) => sum + film.duration, 0) + 8) * 1000, tailMs: 2400 });
  }, [ready, complete, event, films, minimal]);
  const returning = !minimal && !failed && segment === films.length - 1 && revealed;
  const title = outcome === 'heads' ? '万牌归一' : '神罚裁决';
  const face = outcome === 'heads' ? '正面' : '反面';
  return <section role="dialog" aria-modal="true" aria-label="麻将无双演出" className={`wu-cinematic wu-${outcome} ${returning ? 'wu-return' : ''} ${minimal || failed ? 'wu-minimal' : ''}`} data-segment={segment} data-revealed={revealed}>
    {!minimal && films.map((film, i) => <video key={film.src} ref={i ? second : first} className={`wu-film ${segment === i ? 'wu-active' : ''}`} src={film.src} poster={film.poster} preload="auto" playsInline disablePictureInPicture aria-hidden="true" />)}
    {(minimal || failed) ? <div className="wu-result" role="status"><small>{event.actorName}</small><h2>麻将无双</h2><strong>{revealed ? `${face} · ${title}` : '命运掷币中'}</strong>{revealed && <p>{event.label}</p>}</div>
      : <>{films.length > 1 && segment === 0 && revealed && <div className="wu-face" role="status">{face}</div>}
        {returning && <div className="wu-handoff">
          {subject?.character && <CharacterPortrait choice={subject.character} className="wu-character" />}
          <div className="wu-declaration"><small>{face} · 麻将无双</small><h2>{title}</h2><b>{subject?.name ?? (outcome === 'heads' ? event.actorName : '请按卡面选择目标')}</b><p>{event.label}</p></div>
          <CinematicReturnParticles theme={outcome === 'heads' ? 'wushuang-heads' : 'wushuang-tails'} targetIds={subjectId ? [subjectId] : []} />
        </div>}</>}
    <button autoFocus type="button" className="wu-skip" onClick={complete}>跳过演出</button>
  </section>;
}

/** Reachable in the skill library while the card's new settlement rules remain deferred. */
export function WushuangPreview({ players }: { players: readonly CinematicPlayer[] }) {
  const [preview, setPreview] = useState<{ outcome: WushuangOutcome; event: SkillExperienceEvent } | null>(null);
  const close = useCallback(() => setPreview(null), []);
  const play = (outcome: WushuangOutcome) => {
    const actor = players[0], target = players[1];
    setPreview({ outcome, event: { id: `preview-${Date.now()}`, createdAt: Date.now(), kind: 'random', cardName: '麻将无双',
      actorId: actor?.id ?? '', actorName: actor?.name ?? '演出预览', targets: target ? [target.id] : [], label: '演出预览' } });
  };
  return <><div className="wu-preview-actions"><span>无双演出</span><button type="button" onClick={() => play('heads')}>预览正面</button><button type="button" onClick={() => play('tails')}>预览反面</button></div>
    {preview && createPortal(<WushuangCinematic key={preview.event.id} {...preview} players={players} complete={close} />, document.body)}</>;
}
