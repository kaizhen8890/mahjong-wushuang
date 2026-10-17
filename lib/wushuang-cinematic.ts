import type { SkillExperienceEvent } from './skill-experience';
export type WushuangOutcome = 'heads' | 'tails';
/** Presentation routing only. Never infer a face from a label or roll on a client. */
export function wushuangOutcome(event: Pick<SkillExperienceEvent, 'kind' | 'cardName' | 'random'>): WushuangOutcome | undefined {
  const r = event.random;
  if (event.kind !== 'random' || event.cardName !== '麻将无双' || r?.kind !== 'coin'
    || r.faces.length !== 1 || ![0, 1].includes(r.faces[0]) || r.total !== r.faces[0]) return;
  return r.faces[0] === 1 ? 'heads' : 'tails';
}
type WushuangFilm = { src: string; poster: string; duration: number; reveal: number };
export function wushuangFilms(outcome: WushuangOutcome, portrait: boolean): readonly [WushuangFilm, WushuangFilm];
export function wushuangFilms(outcome: WushuangOutcome, portrait: boolean, manualCoin: boolean): readonly WushuangFilm[];
export function wushuangFilms(outcome: WushuangOutcome, portrait: boolean, manualCoin = false): readonly WushuangFilm[] {
  const shape = portrait ? 'portrait' : 'landscape';
  const films = [
    { src: `/cinematics/wushuang-coin/v3/${outcome}-${shape}.mp4`, poster: `/cinematics/wushuang-coin/v3/${outcome}-${shape}.jpg`, duration: 10, reveal: 8.25 },
    { src: `/cinematics/wushuang-${outcome}/v1/effect-${shape}.mp4`, poster: `/cinematics/wushuang-${outcome}/v1/effect-${shape}.jpg`, duration: 6, reveal: 5.3 },
  ] as const;
  return manualCoin ? [films[1]] : films;
}
