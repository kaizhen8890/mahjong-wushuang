'use client';
/* oxlint-disable next/no-img-element -- Bundled offline emote artwork. */
import { useEffect, useRef, useState } from 'react';
import { GAME_EMOTES, GAME_EMOTES_BY_ID } from '@/lib/emotes';
import { EMOTE_INTERVAL, type VirtualEmote } from '@/lib/virtual-mahjong/emotes';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import { relativeSeat } from '@/lib/virtual-mahjong/table-view';
import './emotes.css';
import { GAME_AUDIO, playGameSound, stopGameSound } from '@/app/hooks/use-game-audio';
const empty: VirtualEmote[] = [];
export function TableEmotes({ view, events = empty, send }: { view: PlayerVisibleGameState; events?: VirtualEmote[]; send?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<(VirtualEmote & { until: number })[]>([]);
  // Mounting/rejoining a table must not replay old transient events.
  const seen = useRef(events.map(event => event.id));
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const last = useRef(-Infinity);
  const cancel = () => { clearInterval(repeat.current); repeat.current = undefined; };
  useEffect(() => {
    const fresh = events.filter(event => !seen.current.includes(event.id) && event.gameId === view.gameId && event.roundId === view.roundId);
    seen.current = [...seen.current, ...fresh.map(event => event.id)].slice(-64);
    if (!document.hidden && fresh.length) { playGameSound(GAME_AUDIO.emote, .45); setVisible(old => [...old, ...fresh.map(event => ({ ...event, until: Date.now() + 3000 }))].slice(-16)); }
  }, [events, view.gameId, view.roundId]);
  useEffect(() => {
    const tick = setInterval(() => setVisible(old => old.some(event => event.until <= Date.now()) ? old.filter(event => event.until > Date.now()) : old), 100);
    const hide = () => { if (document.hidden) { cancel(); stopGameSound(GAME_AUDIO.emote); setVisible([]); setOpen(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(tick); cancel(); stopGameSound(GAME_AUDIO.emote); document.removeEventListener('visibilitychange', hide); };
  }, []);
  const emit = (id: string) => {
    // oxlint-disable-next-line react/react-compiler -- Called only by pointer/keyboard handlers and their repeat timer.
    const now = Date.now();
    if (document.hidden || now - last.current < EMOTE_INTERVAL) return;
    last.current = now;
    if (send) send(id);
    else { playGameSound(GAME_AUDIO.emote, .45); setVisible(old => [...old, { id: crypto.randomUUID(), playerId: view.viewerId!, gameId: view.gameId, roundId: view.roundId, emoteId: id, until: now + 3000 }].slice(-16)); }
  };
  const own = view.players.find(player => player.id === view.viewerId)!;
  return <>
    {view.players.map(player => {
      const event = visible.filter(item => item.playerId === player.id).at(-1), emote = event && GAME_EMOTES_BY_ID.get(event.emoteId);
      return emote && <div key={player.id} className={`vm-emote-bubble vm-emote-seat-${relativeSeat(player.seat, own.seat, view.players.length)}`} aria-label={`${player.name}：${emote.label}`}><img key={event!.id} src={emote.src} alt={emote.label} /></div>;
    })}
    <button className="vm-emote-toggle" aria-label="表情" aria-expanded={open} onClick={() => { cancel(); setOpen(!open); }}>☺</button>
    {open && <aside className="vm-emote-picker" aria-label="选择表情"><header><strong>表情</strong><button onClick={() => { cancel(); setOpen(false); }}>收起表情</button></header><div>{GAME_EMOTES.map(emote => <button key={emote.id} aria-label={emote.label}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); cancel(); emit(emote.id); repeat.current = setInterval(() => emit(emote.id), EMOTE_INTERVAL + 20); }}
      onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel} onContextMenu={event => event.preventDefault()}
      onClick={event => { if (event.detail === 0) emit(emote.id); }}><img loading="lazy" src={emote.src} alt="" draggable={false} /></button>)}</div></aside>}
  </>;
}
