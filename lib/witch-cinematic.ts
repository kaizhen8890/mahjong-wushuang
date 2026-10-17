import type { SkillExperienceEvent } from './skill-experience';

const ROOT = '/cinematics/witch/v1';
/** Video seconds, measured from the encoded assets. No gameplay callbacks. */
export const WITCH_FILMS = {
  intro: { duration: 5.2, reveal: 4.55, tail: 450, name: '深渊法庭' },
  judgement: { duration: 2.1, reveal: 1.15, tail: 550, name: '裁决降临' },
} as const;
export function isWitchCinematic(event: SkillExperienceEvent): boolean {
  return event.environment === 'witch' && (event.kind === 'environment' || event.kind === 'judgement');
}
export function witchFilm(event: SkillExperienceEvent, portrait: boolean) {
  const kind = event.kind === 'judgement' ? 'judgement' : 'intro';
  const shape = portrait ? 'portrait' : 'landscape';
  return { ...WITCH_FILMS[kind], kind, src: `${ROOT}/${kind}-${shape}.mp4`, poster: `${ROOT}/poster-${shape}.jpg` };
}
export function targetRect(box: { left: number; top: number; width: number; height: number } | undefined, width: number, height: number) {
  if (!box || width <= 0 || height <= 0) return { x: 50, y: 50, width: 200, height: 110, found: false };
  return { x: (box.left + box.width / 2) / width * 100, y: (box.top + box.height / 2) / height * 100,
    width: box.width, height: box.height, found: true };
}
