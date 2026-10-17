import type { GameState, SettlementInput, SettlementResult, SkillCard } from './mahjong';
import { wushuangOutcome } from './wushuang-cinematic';

export interface TablePresentation {
  id: string;
  createdAt: number;
  kind: 'riichi' | 'win' | 'skill';
  skill?: { cardId: number; name: string; type: '攻' | '团' | '单' | '陷'; targetIds: string[] };
  playerId: string;
  playerName: string;
  winType?: 'ron' | 'tsumo';
  loserId?: string;
  han: number;
  fu: number;
  yakuman: number;
  limit: string;
  points: number;
  yaku: string[];
  tiles: string[];
  scores: { playerId: string; before: number; after: number }[];
}

function base(playerId: string, playerName: string): TablePresentation {
  return { id: crypto.randomUUID(), createdAt: Date.now(), kind: 'riichi', playerId, playerName,
    han: 0, fu: 0, yakuman: 0, limit: '', points: 0, yaku: [], tiles: [], scores: [] };
}

/** Host-only visual events. Hidden placement, editing and resolving never reveal a card. */
export function recordSkillTransitions(before: GameState, after: GameState, cards: SkillCard[]): GameState {
  let result = after;
  for (const effect of after.effects) {
    if (effect.faceDown || effect.visibility === 'face-down' || effect.state === 'armed'
      || effect.state === 'resolved' || effect.status === 'resolved') continue;
    const previous = before.effects.find(entry => entry.id === effect.id);
    if (previous && !(previous.faceDown || previous.visibility === 'face-down' || previous.state === 'armed')) continue;
    const card = cards.find(entry => entry.id === effect.cardId);
    if (card && wushuangOutcome({ kind: 'random', cardName: card.name, random: effect.randomResult })) continue;
    if (!card || !['攻', '团', '单', '陷'].includes(card.type.code)) continue;
    const actor = after.players.find(player => player.id === (effect.sourcePlayerId || effect.ownerId));
    if (!actor) continue;
    const targets = card.type.code === '单' ? [actor.id]
      : effect.affectedPlayerIds?.length ? effect.affectedPlayerIds
      : effect.targetPlayerIds?.length ? effect.targetPlayerIds : effect.targetId ? [effect.targetId] : [];
    result = appendPresentation(result, { ...base(actor.id, actor.name), kind: 'skill',
      skill: { cardId: card.id, name: card.name, type: card.type.code as '攻' | '团' | '单' | '陷',
        targetIds: [...new Set(targets)].filter(id => after.players.some(player => player.id === id)) } });
  }
  return result;
}

/** 展示真实等级；不足满贯时以番数为主标题，不虚构等级。 */
export function winHeadline(event: Pick<TablePresentation, 'yakuman' | 'limit' | 'han'>): string {
  if (event.limit === '无双结算') return '无双结算';
  if (event.yakuman === 1) return '役满';
  if (event.yakuman > 1) {
    const names: Record<number, string> = { 2: '两', 3: '三', 4: '四', 5: '五', 6: '六' };
    return `${names[event.yakuman] ?? event.yakuman}倍役满`;
  }
  if (/满/.test(event.limit)) return event.limit;
  return event.han > 0 ? `${event.han} 番` : '和牌';
}

export function appendPresentation(game: GameState, event: TablePresentation): GameState {
  return { ...game, presentations: [...(game.presentations ?? []).filter(e => Date.now() - e.createdAt < 20000), event].slice(-8) };
}

export function recordRiichiTransitions(before: GameState, after: GameState): GameState {
  let result = after;
  for (const player of after.players) {
    const previous = before.players.find(p => p.id === player.id);
    if (player.riichi && previous && !previous.riichi) {
      result = appendPresentation(result, base(player.id, player.name));
    }
  }
  return result;
}

export function recordWin(before: GameState, after: GameState, input: SettlementInput, result: SettlementResult,
  yaku: string[] = [], tiles: string[] = []): GameState {
  const player = before.players.find(p => p.id === input.winnerId)!;
  return appendPresentation(after, {
    ...base(player.id, player.name), kind: 'win', winType: input.winType, loserId: input.loserId,
    han: input.han, fu: input.fu, yakuman: input.yakuman, limit: result.label, points: result.winnerGain,
    yaku: yaku.slice(0, 32), tiles: tiles.slice(0, 32),
    scores: before.players.map(p => ({ playerId: p.id, before: p.score, after: after.players.find(a => a.id === p.id)?.score ?? p.score })),
  });
}
