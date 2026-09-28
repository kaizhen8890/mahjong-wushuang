import emoteData from '@/data/emotes.json';

export interface GameEmote {
  id: string;
  label: string;
  src: string;
}

/**
 * 表情包只由 data/emotes.json 管理。图片放入 public/emotes 后，在清单中
 * 添加或删除一行即可；局域网只发送稳定 id，不发送大体积图片资料。
 */
export const GAME_EMOTES = emoteData as GameEmote[];
export const GAME_EMOTES_BY_ID = new Map(GAME_EMOTES.map((emote) => [emote.id, emote]));

