'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import { tableEffects, type TableEffect } from '@/lib/virtual-mahjong/table-effects';
import { playGameSound, stopGameSound } from '@/app/hooks/use-game-audio';
import { VIRTUAL_AUDIO } from '@/lib/virtual-mahjong/audio';

export function useTableEffects(root: RefObject<HTMLElement | null>, view: PlayerVisibleGameState, entrance: boolean, reduced: boolean) {
  const previous = useRef<PlayerVisibleGameState | null>(null);
  const first = useRef(true);
  const animations = useRef<Animation[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sounds = useRef(new Set<string>());
  useEffect(() => {
    const cancel = () => { animations.current.forEach(a => a.cancel()); animations.current = []; timers.current.forEach(clearTimeout); timers.current = []; sounds.current.forEach(stopGameSound); sounds.current.clear(); };
    const hidden = () => { if (document.hidden) { previous.current = null; first.current = false; cancel(); } };
    const node = root.current;
    // A touch always sees final card positions and can act immediately.
    node?.addEventListener('pointerdown', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => { cancel(); node?.removeEventListener('pointerdown', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, [root]);
  useEffect(() => {
    const effects: TableEffect[] = first.current && entrance && !view.result ? [{ kind: 'deal' }] : tableEffects(previous.current, view);
    const old = previous.current; previous.current = view; first.current = false;
    if (document.hidden) return;
    const interrupted = reduced || !!view.result || (old && (old.gameId !== view.gameId || old.viewerId !== view.viewerId
      || (old.roundId === view.roundId && view.revision > old.revision + 1)));
    if (effects.length || interrupted) { animations.current.forEach(a => a.cancel()); animations.current = []; timers.current.forEach(clearTimeout); timers.current = []; sounds.current.forEach(stopGameSound); sounds.current.clear(); }
    const animate = (node: Element | null, frames: Keyframe[], duration: number, delay = 0) => {
      if (node && !reduced && !interrupted && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const a = node.animate(frames, { duration, delay, easing: 'ease-out', fill: 'backwards' }); animations.current.push(a); a.onfinish = () => { animations.current = animations.current.filter(v => v !== a); }; }
    };
    const play = (sound: string, volume: number, delay: number) => {
      const run = () => { sounds.current.add(sound); playGameSound(sound, volume); };
      if (delay) timers.current.push(setTimeout(run, delay)); else run();
    };
    let soundAt = 0;
    for (const effect of effects) {
      if (effect.kind === 'deal') {
        play(VIRTUAL_AUDIO.deal, .55, 0);
        root.current?.querySelectorAll('.vm-hand>button').forEach((node, i) => animate(node.firstElementChild,
          [{ transform: 'translateY(-35px) rotate(-5deg)', opacity: .2 }, { transform: 'none', opacity: 1 }], 280, Math.floor(i / 4) * 110));
      } else if (effect.kind === 'dora') {
        animate(root.current?.querySelector(`[data-dora-id="${effect.tileId}"]`) ?? null,
          [{ transform: 'perspective(300px) rotateY(90deg)', opacity: .1 }, { transform: 'perspective(300px) rotateY(0)', opacity: 1 }], 360);
        play(VIRTUAL_AUDIO.reveal, .4, soundAt); soundAt += 200;
      } else if (effect.kind === 'draw') { play(VIRTUAL_AUDIO.select, .22, soundAt); soundAt += 200; }
      else if (effect.kind === 'discard') { play(VIRTUAL_AUDIO.discard, .55, soundAt); soundAt += 200; }
      else if (effect.kind === 'nuki') {
        play(VIRTUAL_AUDIO.discard, .45, reduced ? soundAt : soundAt + 420); soundAt += 200;
      }
      else if (effect.kind === 'chi' || effect.kind === 'pon' || effect.kind === 'kan') {
        // Reuse the supplied tile-placement sound for melds; no invented voice mapping.
        play(VIRTUAL_AUDIO.discard, .45, soundAt); soundAt += 200;
        animate(root.current?.querySelector(`[data-player-id="${CSS.escape(effect.playerId ?? '')}"] .vm-avatar`) ?? null,
          [{ boxShadow: '0 0 0 8px #ead08e', filter: 'brightness(1.6)' }, { boxShadow: '0 0 0 0px transparent', filter: 'brightness(1)' }], 420);
      }
    }
  }, [view, entrance, reduced, root]);
}
