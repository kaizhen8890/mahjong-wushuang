'use client';
import { useCallback, useState } from 'react';
import { advanceNightIntro, initialNightIntro, type NightInput } from '@/lib/night-cinematic';

export function useNightIntro(input: NightInput) {
  const [state, setState] = useState(() => initialNightIntro(input));
  // Adjust before commit: a fresh event must not briefly dim the native window
  // or mount the black screen before its movie is selected.
  if (state.active !== input.active || state.context !== input.context || state.events !== input.events || state.minimal !== input.minimal || state.visible !== input.visible) {
    setState(advanceNightIntro(state, input, Date.now()));
  }
  const id = state.intro?.id;
  const complete = useCallback(() => setState(current => current.intro?.id === id ? { ...current, intro: undefined } : current), [id]);
  return { intro: state.intro, complete };
}
