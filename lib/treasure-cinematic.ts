import type { SkillExperienceEvent } from './skill-experience';

/** Present only events already accepted and saved by the Host. */
export function isTreasureCinematic(event: SkillExperienceEvent) {
  return event.environment === 'treasure' && (event.kind === 'environment' || event.kind === 'treasure');
}

export function treasureConfirmed(event: SkillExperienceEvent) {
  return isTreasureCinematic(event) && event.kind === 'treasure';
}

export function treasureFilm(vertical: boolean) {
  const shape = vertical ? 'portrait' : 'landscape';
  return {
    src: `/cinematics/treasure/v1/intro-${shape}.mp4`,
    poster: `/cinematics/treasure/v1/poster-${shape}.jpg`,
    width: vertical ? 1000 : 1600, height: vertical ? 1600 : 1000,
    duration: 6.4, reveal: 5.8, tail: 400,
  };
}
