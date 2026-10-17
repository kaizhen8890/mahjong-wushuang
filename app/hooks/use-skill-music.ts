'use client';
import { useCallback, useEffect } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import { NFC_IDENTITIES, nfcAudioSource } from '@/lib/nfc-registry';
import { gameMusicDirector } from './use-game-audio';

/** Mounted only by the physical table Host. Neither controller completion nor preview can start a song. */
export function useSkillMusic(enabled: boolean, owner: string) {
  useEffect(() => {
    if (!enabled) gameMusicDirector().stopSkill(owner);
    return () => { gameMusicDirector().stopSkill(owner); };
  }, [enabled, owner]);
  return useCallback((event: SkillExperienceEvent) => {
    if (!enabled || event.kind !== 'skill' || !['断序杂音', '宿星审判'].includes(event.cardName)) return;
    const identity = NFC_IDENTITIES.find(card => card.action === 'skill' && card.skillName === event.cardName);
    const source = identity && nfcAudioSource(identity);
    if (source) gameMusicDirector().startSkill(owner, event.id, source);
  }, [enabled, owner]);
}
