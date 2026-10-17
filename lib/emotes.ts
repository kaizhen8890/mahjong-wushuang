import emoteData from '@/data/emotes.json';

export interface GameEmote {
  id: string;
  label: string;
  src: string;
}

/** Bundled originals plus verified imported media; only the local library populates the picker. */
export const GAME_EMOTES = emoteData as GameEmote[];
export const GAME_EMOTES_BY_ID = new Map(GAME_EMOTES.map((emote) => [emote.id, emote]));

