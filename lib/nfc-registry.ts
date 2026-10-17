import registry from '../data/nfc-card-registry.json';
import type { NfcCard } from './nfc-cards';

export interface NfcIdentity {
  code: string;
  /** Retained read-compatible identity; prefer this canonical code when writing new tags. */
  aliasOf?: string;
  name: string;
  uri: string;
  action: 'skill' | 'music';
  skillId: number;
  skillName: string;
  artwork?: string;
  trackTitle?: string;
  artist?: string;
  coverSrc?: string | null;
  lyricsSrc?: string | null;
  audioSrc?: string | null;
}
export const NFC_IDENTITIES = registry.cards as readonly NfcIdentity[];

/** Music is optional metadata on a skill; availability never depends on whether skill use is allowed. */
export function nfcHasMusic(identity: NfcIdentity): boolean {
  return identity.action === 'music' || Boolean(identity.trackTitle);
}

/** Exact, versioned allowlist. Tag data can identify a card, never supply commands or media URLs. */
export function identifyNfcUri(uri: unknown): NfcIdentity {
  if (
    typeof uri !== 'string' ||
    uri.length > 160 ||
    !/^mahjongwushuang:\/\/card\/v1\/MW-[0-9]{3}$/.test(uri)
  ) {
    throw Error('未识别的卡片格式，请写入代号库中的完整 URL 记录');
  }
  const identity = NFC_IDENTITIES.find((card) => card.uri === uri);
  if (!identity) throw Error('此卡面代号尚未收录，请检查代号或更新 App');
  return identity;
}
export function nfcSkill<T extends NfcCard>(identity: NfcIdentity, cards: readonly T[]) {
  return cards.find(
    (card) => !card.custom && card.id === identity.skillId && card.name === identity.skillName,
  );
}
export function nfcAudioSource(identity: NfcIdentity): string | null {
  const src = identity.audioSrc;
  return typeof src === 'string' &&
    /^\/audio\/nfc\/[a-z0-9_-]+\.(mp3|m4a|mp4|ogg|wav)$/.test(src)
    ? src
    : null;
}

/** Album covers stay separate from skill-card artwork and never come from tag URLs. */
export function nfcCoverSource(identity: NfcIdentity): string | null {
  const src = identity.coverSrc;
  return typeof src === 'string' &&
    /^\/audio\/nfc\/[a-z0-9_-]+\.(webp|png|jpe?g|avif)$/.test(src)
    ? src
    : null;
}
