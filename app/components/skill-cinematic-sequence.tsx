'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { preludeTheme } from '@/lib/cinematic-motion';
import { SkillPrelude } from './skill-prelude';

const CinematicReady = createContext(true);
export const useCinematicReady = () => useContext(CinematicReady);

/** Children preload while hidden, but their playback clocks and audio are gated by context. */
export function SkillCinematicSequence({ event, phone = false, complete, children }: {
  event: SkillExperienceEvent; phone?: boolean; complete: () => void; children: ReactNode;
}) {
  const theme = preludeTheme(event);
  const film = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!theme);
  const advance = useCallback(() => setReady(true), []);
  useEffect(() => {
    // A skip during the prelude must release preloaded films even though their playback effect never started.
    const players = [...(film.current?.querySelectorAll('video') ?? [])];
    return () => { players.forEach(player => {
      // React's development effect replay leaves nodes connected; it is not an actual dismissal.
      if (!player.isConnected) { player.pause(); player.removeAttribute('src'); player.load(); }
    }); };
  }, []);
  useEffect(() => {
    const hide = () => { if (document.hidden) complete(); };
    const back = (event: Event) => { event.preventDefault(); complete(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('mahjong:native-back', back);
    if (document.hidden) complete();
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('mahjong:native-back', back); };
  }, [complete]);
  return <CinematicReady.Provider value={ready}>
    <div ref={film} className="cinematic-sequence-film" hidden={!ready} aria-hidden={!ready} inert={!ready} data-cinematic-ready={ready}>{children}</div>
    {!ready && theme && <SkillPrelude theme={theme} cardName={event.cardName} actorId={event.actorId} actorName={event.actorName} phone={phone} done={advance} skip={complete} />}
  </CinematicReady.Provider>;
}
