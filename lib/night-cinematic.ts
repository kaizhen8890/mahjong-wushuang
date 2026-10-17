import type { SkillExperienceEvent } from './skill-experience';

export const NIGHT_FILM = {
  src: '/cinematics/night/v1/intro-landscape.mp4', poster: '/cinematics/night/v1/poster.jpg',
  duration: 2, reveal: 2, tail: 0,
} as const;
export function isNightIntro(event: SkillExperienceEvent): boolean {
  return event.kind === 'environment' && event.environment === 'night';
}
export type NightInput = { active: boolean; context?: string; events: readonly SkillExperienceEvent[]; minimal: boolean; visible: boolean };
export type NightIntroState = NightInput & { seen: ReadonlySet<string>; played: ReadonlySet<string>; intro?: SkillExperienceEvent };
/** Initial snapshots are already in effect. Never illuminate a restored night. */
export function initialNightIntro(input: NightInput): NightIntroState {
  return { ...input, seen: new Set(input.events.map(e => e.id)), played: new Set(input.active && input.context ? [input.context] : []) };
}
/** Presentation state only. The authoritative environment is effective throughout. */
export function advanceNightIntro(state: NightIntroState, input: NightInput, now: number): NightIntroState {
  const seen = new Set(state.seen), played = new Set(state.played);
  const fresh = input.events.filter(e => !seen.has(e.id) && isNightIntro(e) && now - e.createdAt < 10000);
  input.events.forEach(e => seen.add(e.id));
  if (seen.size > 100) { seen.clear(); input.events.forEach(e => seen.add(e.id)); }
  let intro = input.active && input.context === state.context && !input.minimal && input.visible ? state.intro : undefined;
  if (input.active && input.context && !played.has(input.context)) {
    played.add(input.context);
    if (!input.minimal && input.visible) intro = fresh.at(-1);
  }
  while (played.size > 100) played.delete(played.values().next().value!);
  return { ...input, seen, played, intro };
}
