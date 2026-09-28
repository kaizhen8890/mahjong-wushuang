import { GAME_EMOTES_BY_ID } from '../emotes';
export interface VirtualEmote { id: string; playerId: string; emoteId: string; gameId: string; roundId: string }
export const EMOTE_INTERVAL = 400;
export function readVirtualEmote(value: unknown): VirtualEmote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_EMOTE');
  const e = value as Record<string, unknown>;
  const keys = ['id', 'playerId', 'emoteId', 'gameId', 'roundId'];
  if (Object.keys(e).length !== keys.length || keys.some(k => typeof e[k] !== 'string' || !e[k] || (e[k] as string).length > 128)
    || !GAME_EMOTES_BY_ID.has(e.emoteId as string)) throw new Error('INVALID_EMOTE');
  return { id: e.id as string, playerId: e.playerId as string, emoteId: e.emoteId as string, gameId: e.gameId as string, roundId: e.roundId as string };
}
