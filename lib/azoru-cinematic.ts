import type { SkillExperienceEvent } from './skill-experience';
import landscape from '../public/cinematics/azoru/v1/anchors-landscape.json';
import portrait from '../public/cinematics/azoru/v1/anchors-portrait.json';

export function isAzoruCinematic(event: SkillExperienceEvent) {
  return event.kind === 'environment' && event.environment === 'number';
}

/** Parse the Host's existing saved declaration; never roll or infer a number. */
export function azoruNumber(event: SkillExperienceEvent): number | undefined {
  const match = event.label.match(/^数字\s+([1-9])\s*·/u);
  return match ? Number(match[1]) : undefined;
}

export function azoruFilm(vertical: boolean) {
  const shape = vertical ? 'portrait' : 'landscape';
  return {
    src: `/cinematics/azoru/v1/intro-${shape}.mp4`, poster: `/cinematics/azoru/v1/poster-${shape}.jpg`,
    width: vertical ? 1000 : 1600, height: vertical ? 1600 : 1000,
    duration: 6, reveal: 5.35, tail: 550, anchors: vertical ? portrait : landscape,
  };
}
