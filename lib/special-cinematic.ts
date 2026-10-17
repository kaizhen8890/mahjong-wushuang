import type { SkillExperienceEvent } from './skill-experience';
export type SpecialCard = '断序杂音' | '宿星审判' | '听天问剑';
export function specialCinematic(event: SkillExperienceEvent) {
  if (event.kind === 'skill' && (event.cardName === '断序杂音' || event.cardName === '宿星审判')) return { name: event.cardName, outcome: undefined };
  const r = event.random;
  if (event.cardName === '听天问剑' && event.kind === 'random' && r?.kind === 'coin' && r.faces.length === 1 && [0, 1].includes(r.faces[0]) && r.total === r.faces[0])
    return { name: event.cardName, outcome: r.faces[0] === 1 ? 'heads' as const : 'tails' as const };
}
export function specialFilms(event: SkillExperienceEvent, portrait: boolean) {
  const route = specialCinematic(event); if (!route) return [];
  const shape = portrait ? 'portrait' : 'landscape';
  const root = route.name === '断序杂音' ? '/cinematics/discord/v2' : route.name === '宿星审判' ? '/cinematics/astral-judgement/v2' : '/cinematics/heavens-sword/v1';
  const duration = route.name === '断序杂音' ? 8 : route.name === '宿星审判' ? 10 : 11;
  const stem = `effect-${route.outcome ? `${route.outcome}-` : ''}${shape}`;
  const effect = { src: `${root}/${stem}.mp4`, poster: `${root}/${stem}.jpg`, duration, reveal: duration - .6 };
  return route.outcome && event.random?.source !== 'manual' ? [{ src: `/cinematics/wushuang-coin/v3/${route.outcome}-${shape}.mp4`, poster: `/cinematics/wushuang-coin/v3/${route.outcome}-${shape}.jpg`, duration: 10, reveal: 8.25 }, effect] : [effect];
}
