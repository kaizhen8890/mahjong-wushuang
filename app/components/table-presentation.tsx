'use client';

/* oxlint-disable next/no-img-element -- Bundled public winning tiles. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { winHeadline, type TablePresentation } from '@/lib/presentation';
import { GAME_AUDIO, playGameSound } from '@/app/hooks/use-game-audio';
import { SkillPresentation } from './skill-presentation';
import { CharacterPortrait } from './character-picker';
import type { CharacterChoice } from '@/lib/characters';

const EMPTY: TablePresentation[] = [];
const fresh = (events: TablePresentation[]) => events.filter(e => Date.now() - e.createdAt < 20000);
export function usePresentationSequence(events: TablePresentation[] = EMPTY) {
  const [state, setState] = useState(() => ({ source: events, seen: events.map(e => e.id), queue: fresh(events) }));
  const [stage, setStage] = useState({ id: '', phase: 'intro' as 'intro' | 'impact' });
  if (state.source !== events) {
    const ids = new Set(events.map(e => e.id));
    const added = fresh(events).filter(e => !state.seen.includes(e.id));
    setState({ source: events, seen: [...state.seen, ...added.map(e => e.id)].slice(-32),
      queue: [...state.queue.filter(e => ids.has(e.id)), ...added].slice(-8) });
  }
  const event = state.queue[0];
  const phase = stage.id === event?.id ? stage.phase : 'intro';
  useEffect(() => {
    if (!event) return;
    const impact = event.kind === 'win' ? window.setTimeout(() => setStage({ id: event.id, phase: 'impact' }), 3000) : undefined;
    const finish = window.setTimeout(() => setState(s => ({ ...s, queue: s.queue.filter(e => e.id !== event.id) })), event.kind === 'win' ? 4800 : event.kind === 'skill' ? 3400 : 2200);
    return () => { window.clearTimeout(impact); window.clearTimeout(finish); };
  }, [event]);
  return { event, phase };
}
export type PresentationSequence = ReturnType<typeof usePresentationSequence>;

export function RollingScore({ value, playerId, groupIds, sequence, className = '' }: {
  value: number; playerId: string; groupIds?: string[]; sequence: PresentationSequence; className?: string;
}) {
  const ref = useRef<HTMLOutputElement>(null);
  const displayed = useRef(value);
  const groupKey = groupIds?.join('\0');
  const change = useMemo(() => {
    if (sequence.event?.kind !== 'win') return undefined;
    if (!groupKey) return sequence.event.scores.find(s => s.playerId === playerId);
    const ids = new Set(groupKey.split('\0'));
    return sequence.event.scores.filter(s => ids.has(s.playerId)).reduce((sum, s) => ({ before: sum.before + s.before, after: sum.after + s.after }), { before: 0, after: 0 });
  }, [sequence.event, playerId, groupKey]);
  const held = !!change && sequence.phase === 'intro';
  const target = held ? change.before : change?.after ?? value;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const from = change && !held ? change.before : displayed.current;
    if (held || from === target || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayed.current = target; element.textContent = target.toLocaleString('zh-CN');
      return;
    }
    element.textContent = from.toLocaleString('zh-CN');
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1350);
      displayed.current = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      element.textContent = displayed.current.toLocaleString('zh-CN');
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, held, change]);
  return <output ref={ref} className={className} aria-label={`${target}点`}>{target.toLocaleString('zh-CN')}</output>;
}

export function WinParticles({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="win-particles" aria-hidden="true">{Array.from({ length: 16 }, (_, i) =>
    <i key={i} style={{ '--angle': `${i * 22.5}deg`, '--delay': `${i % 4 * 60}ms` } as CSSProperties} />)}</span>;
}

function ThunderStrike({ playerId }: { playerId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const card = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(p => p.dataset.playerId === playerId);
    if (!element || !card) return;
    const position = () => {
      const rect = card.getBoundingClientRect();
      element.style.setProperty('--strike-x', `${rect.left + rect.width / 2}px`);
      element.style.setProperty('--strike-y', `${rect.top + rect.height / 2}px`);
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(card); window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); };
  }, [playerId]);
  return <div className="ron-thunder" ref={ref} aria-hidden="true"><i /><b /><span /></div>;
}

export function PresentationOverlay({ sequence, tablet = false, characters = {} }: { sequence: PresentationSequence; tablet?: boolean; characters?: Record<string, CharacterChoice> }) {
  const { event, phase } = sequence;
  useEffect(() => {
    if (event && event.kind !== 'skill') playGameSound(event.kind === 'riichi' ? GAME_AUDIO.riichiCue : GAME_AUDIO.win, 0.72);
  }, [event]);
  useEffect(() => {
    if (tablet && event?.kind === 'win' && event.winType === 'ron' && phase === 'impact') playGameSound(GAME_AUDIO.thunder, 0.82);
  }, [tablet, event, phase]);
  if (!event) return null;
  if (event.kind === 'skill') return tablet ? <SkillPresentation key={event.id} event={event} character={characters[event.playerId]} /> : null;
  if (event.kind === 'riichi') return <output key={event.id} className="riichi-announcement"><CharacterPortrait choice={characters[event.playerId]} className="presentation-character" /><span>立直</span><strong>{event.playerName}</strong></output>;
  if (phase === 'impact') return tablet && event.winType === 'ron' && event.loserId ? <ThunderStrike key={event.id} playerId={event.loserId} /> : null;
  return <section key={event.id} className={`win-announcement win-${event.winType}`} aria-label="和牌演出">
    <CharacterPortrait choice={characters[event.playerId]} className="presentation-character" />
    <div className="win-burst" aria-hidden="true" />
    <div className="win-scroll">
      <div className="win-florals" aria-hidden="true"><i className="flower-left"/><i className="flower-right"/><i className="petal petal-a"/><i className="petal petal-b"/><i className="petal petal-c"/></div>
      <span className="win-method">{event.winType === 'tsumo' ? '自摸' : '荣和'}</span>
      <h2 className={winHeadline(event).length > 4 ? 'is-long' : ''}>{winHeadline(event)}</h2>
      <output className="win-points">{event.points.toLocaleString('zh-CN')}<small> 点</small></output>
      <div className="win-details">{event.yakuman <= 0 && event.han > 0 && <b>{event.han} 番{event.fu > 0 ? ` · ${event.fu} 符` : ''}</b>}</div>
      {event.tiles.length > 0 && <div className="win-tiles">{event.tiles.map((tile, index) => <img key={index} src={`/tiles/${tile}.png`} alt={tile} />)}</div>}
      {event.yaku.length > 0 && <p className="win-yaku">{event.yaku.join(' · ')}</p>}
      <strong className="win-player-name">{event.playerName}</strong>
    </div>
  </section>;
}
