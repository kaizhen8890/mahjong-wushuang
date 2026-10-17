import type { SkillExperienceEvent } from './skill-experience';

/** Only Host-persisted activation and penalty events enter this presentation. */
export function isSilenceCinematic(event: SkillExperienceEvent) {
  return event.environment === 'silence' && (event.kind === 'environment' || event.kind === 'penalty');
}

export function silenceFilm(portrait: boolean) {
  const shape = portrait ? 'portrait' : 'landscape';
  return {
    src: `/cinematics/silence/v2/intro-${shape}.mp4`,
    poster: `/cinematics/silence/v2/poster-${shape}.jpg`,
    width: portrait ? 1000 : 1600, height: portrait ? 1600 : 1000,
    duration: 6.4, silence: 4.7, title: 5.5, reveal: 6.4, tail: 800,
  };
}
