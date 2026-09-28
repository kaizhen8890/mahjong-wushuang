'use client';
import { useEffect, useState } from 'react';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import type { TablePresentation } from '@/lib/presentation';
import { virtualPresentations } from '@/lib/virtual-mahjong/presentation';
import { usePresentationSequence } from '../table-presentation';
import { playGameSound } from '@/app/hooks/use-game-audio';
import { VIRTUAL_AUDIO } from '@/lib/virtual-mahjong/audio';

export function useVirtualPresentation(view: PlayerVisibleGameState) {
  const [tracking, setTracking] = useState<{ view: PlayerVisibleGameState | null; events: TablePresentation[]; resultBefore: PlayerVisibleGameState | null }>({ view, events: [], resultBefore: null });
  useEffect(() => {
    const frame = requestAnimationFrame(() => setTracking(previous => {
      const visible = document.visibilityState === 'visible';
      const sameRound = previous.view?.roundId === view.roundId && previous.view?.gameId === view.gameId;
      const resultBefore = sameRound ? view.result && previous.view && !previous.view.result ? previous.view : previous.resultBefore : null;
      return { view, resultBefore, events: visible && !view.result ? [...(sameRound ? previous.events : []), ...virtualPresentations(previous.view, view, Date.now()).filter(event => event.kind === 'riichi')].slice(-8) : [] };
    }));
    return () => cancelAnimationFrame(frame);
  }, [view]);
  useEffect(() => {
    const reset = () => setTracking({ view: null, events: [], resultBefore: null });
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, []);
  const sequence = usePresentationSequence(tracking.events);
  useEffect(() => {
    const previous = tracking.view;
    if (!previous || document.hidden || previous.gameId !== view.gameId || view.result) return;
    if (previous.roundId !== view.roundId || view.viewerId !== previous.viewerId || view.revision !== previous.revision + 1) return;
    if (view.availableActions.canPass && !previous.availableActions.canPass) playGameSound(VIRTUAL_AUDIO.prompt, 0.5);
  }, [view, tracking.view]);
  const pending = Boolean(view.result && tracking.view && tracking.view.roundId === view.roundId && !tracking.view.result);
  return { ...sequence, pending, resultBefore: tracking.resultBefore };
}
