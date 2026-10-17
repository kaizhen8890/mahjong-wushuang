import type { ActiveSkillEffect, GameState, PlayerState, SkillCard } from '@/lib/mahjong';
import { calculateTurnClock } from '@/lib/mahjong';
import { activeEnvironment, usesDecisionCoin } from './skill-experience';
import type {
  ControllerEffect,
  ControllerEffectDirection,
  ControllerNotification,
  ControllerSkillCard,
  ControllerSnapshot,
  SkillDuration,
} from '@/lib/lan-protocol';

const MAX_REMOTE_TEXT_LENGTH = 500;

export interface ControllerSnapshotContext {
  roomId: string;
  matchId: string;
  handId: string;
  revision: number;
  playerId: string;
  pendingNotifications?: readonly ControllerNotification[];
  skillCatalogRevision?: string;
}

function truncateText(value: string | undefined, fallback = '') {
  return (value || fallback).slice(0, MAX_REMOTE_TEXT_LENGTH);
}

function effectSourceId(effect: ActiveSkillEffect) {
  return effect.sourcePlayerId || effect.ownerId;
}

function effectTargets(effect: ActiveSkillEffect) {
  const values = effect.affectedPlayerIds?.length
    ? effect.affectedPlayerIds
    : effect.targetPlayerIds?.length
      ? effect.targetPlayerIds
      : effect.targetId
        ? [effect.targetId]
        : [];
  return [...new Set(values)];
}

function effectIsHidden(effect: ActiveSkillEffect) {
  return effect.visibility === 'face-down' || effect.faceDown;
}

function effectIsLive(effect: ActiveSkillEffect) {
  return effect.state !== 'resolved' && effect.status !== 'resolved';
}

function effectDuration(effect: ActiveSkillEffect): SkillDuration {
  return effect.duration === 'once' || effect.duration === 'match' || effect.duration === 'manual'
    ? effect.duration
    : 'hand';
}

function effectState(effect: ActiveSkillEffect): ControllerEffect['state'] {
  if (effect.state === 'armed' || effect.state === 'triggered') return effect.state;
  return 'active';
}

function playerParticipation(player: PlayerState): PlayerState['participation'] {
  return player.participation ?? (player.active ? 'playing' : 'won');
}

function describeSource(game: GameState, sourceId: string) {
  const source = game.players.find((player) => player.id === sourceId);
  return source ? `${source.wind}家 · ${source.name}` : '牌桌';
}

function directionForEffect(
  effect: ActiveSkillEffect,
  playerId: string,
): ControllerEffectDirection | null {
  const sourceId = effectSourceId(effect);
  const targets = effectTargets(effect);
  const hidden = effectIsHidden(effect);

  if (hidden) return sourceId === playerId ? 'hidden-own' : null;
  if (effect.scope === 'table') return 'table';
  if (effect.scope === 'team' && targets.includes(playerId)) return 'team';
  if (sourceId === playerId) {
    if (effect.scope === 'self' || (targets.length === 1 && targets[0] === playerId)) return 'self';
    return 'outgoing';
  }
  if (!targets.includes(playerId)) return null;
  return effect.scope === 'team' ? 'team' : 'incoming';
}

function toControllerEffect(
  game: GameState,
  cardsById: ReadonlyMap<number, SkillCard>,
  effect: ActiveSkillEffect,
  playerId: string,
): ControllerEffect | null {
  if (!effectIsLive(effect)) return null;
  const direction = directionForEffect(effect, playerId);
  if (!direction) return null;

  const card = cardsById.get(effect.cardId);
  const hidden = effectIsHidden(effect);
  const createdAt = effect.createdAt;
  return {
    effectId: effect.id,
    cardId: effect.cardId,
    cardName: truncateText(effect.cardName, card?.name || (hidden ? '暗置陷阱' : '技能效果')),
    effectText: truncateText(effect.effectText || effect.note, card?.effectDescription),
    direction,
    sourceLabel: truncateText(describeSource(game, effectSourceId(effect))),
    duration: effectDuration(effect),
    state: effectState(effect),
    hidden,
    ...(hidden ? { coinDecisionAvailable: usesDecisionCoin({ name: effect.cardName ?? card?.name ?? '', randomRule: card?.randomRule }, effect.randomRule) } : {}),
    ...(createdAt ? { createdAt: truncateText(createdAt) } : {}),
  };
}

/**
 * Returns a deterministic, non-cryptographic revision for the text-only skill
 * catalog. It is intended for cache invalidation, not authentication.
 */
export function createSkillCatalogRevision(cards: readonly SkillCard[]) {
  const canonical = [...cards]
    .sort((left, right) => left.id - right.id)
    .map((card) => `${card.id}\u001f${card.name}\u001f${card.type.code}\u001f${card.rarity}\u001f${card.effectDescription}\u001f${JSON.stringify(card.randomRule ?? null)}`)
    .join('\u001e');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `catalog-${cards.length}-${hash.toString(16).padStart(8, '0')}`;
}

export function createControllerSkillCatalog(cards: readonly SkillCard[]): ControllerSkillCard[] {
  const uniqueCards = new Map<number, SkillCard>();
  for (const card of cards) uniqueCards.set(card.id, card);
  return [...uniqueCards.values()]
    .sort((left, right) => left.id - right.id)
    .map((card) => ({
      id: card.id,
      name: truncateText(card.name),
      typeCode: truncateText(card.type.code),
      rarity: card.rarity.slice(0, 32),
      effectDescription: truncateText(card.effectDescription),
      ...(card.randomRule ? { randomRule: card.randomRule } : {}),
    }));
}

/**
 * Projects the authoritative table state into the small, seat-specific view a
 * phone is allowed to receive. Other players' scores, skill hands, hidden
 * traps, virtual hands/rivers and full history never cross this boundary.
 */
export function createControllerSnapshot(
  game: GameState,
  cards: readonly SkillCard[],
  context: ControllerSnapshotContext,
): ControllerSnapshot {
  const player = game.players.find((candidate) => candidate.id === context.playerId);
  if (!player) throw new Error(`找不到遥控器绑定的玩家：${context.playerId}`);

  const participation = playerParticipation(player);
  const canAct = !game.handEnded && player.active && participation === 'playing';
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const effects = game.effects
    .map((effect) => toControllerEffect(game, cardsById, effect, player.id))
    .filter((effect): effect is ControllerEffect => effect !== null);

  return {
    wushuangSessions: game.effects.filter(e => e.ownerId === player.id && e.wushuang && (e.wushuang.status === 'settled' || effectIsLive(e))).slice(-2).map(e => e.wushuang!),
    roomId: context.roomId,
    environment: activeEnvironment(game),
    experienceEvents: (game.experienceEvents ?? []).filter(e => Date.now() - e.createdAt < 20000),
    matchId: context.matchId,
    handId: context.handId,
    revision: context.revision,
    presentations: (game.presentations ?? []).filter(event => event.kind !== 'skill' && Date.now() - event.createdAt < 20000).map(event => ({
      ...event, scores: event.scores.filter(score => score.playerId === player.id),
    })),
    self: {
      playerId: player.id,
      name: player.name,
      character: player.character,
      wind: player.wind,
      team: player.team,
      score: player.score,
      riichi: player.riichi,
      participation,
    },
    table: {
      roundWind: game.roundWind,
      handNumber: game.handNumber,
      honba: game.honba,
      riichiSticks: game.riichiSticks,
      wallCount: Math.max(0, game.wallCount),
      handEnded: game.handEnded,
      isMyTurn: game.players[game.turnIndex]?.id === player.id,
      wushuang: game.settings.wushuang,
      playerCount: game.settings.playerCount, akaDora: game.settings.akaDora,
      openTanyao: game.settings.openTanyao,
      kiriageMangan: game.settings.kiriageMangan,
      kazoeYakuman: game.settings.kazoeYakuman,
      timerEnabled: game.settings.turnTimerEnabled,
      turnState: game.turnState ?? 'waiting',
      timerPaused: Boolean(game.timerPaused),
      clock: calculateTurnClock(game),
      turnPlayerId: game.players[game.turnIndex]?.id,
      turnWind: game.players[game.turnIndex]?.wind,
      turnStartedAt: game.turnStartedAt,
      turnFixedSeconds: Math.max(0, game.players[game.turnIndex]?.turnFixedSeconds ?? game.settings.turnFixedSeconds),
      turnExtraSeconds: Math.max(0, game.players[game.turnIndex]?.turnExtraSeconds ?? game.settings.turnExtraSeconds),
    },
    targetOptions: game.players
      .filter((candidate) => candidate.id !== player.id)
      .map((candidate) => ({
        playerId: candidate.id, name: candidate.name, character: candidate.character,
        wind: candidate.wind,
        active: candidate.active && playerParticipation(candidate) === 'playing',
        enemy: !game.settings.teamsEnabled || candidate.team !== player.team,
      })),
    controls: {
      canDraw: canAct && !game.timerPaused && game.wallCount > 0 && !(game.turnState === 'thinking' && game.players[game.turnIndex]?.id === player.id),
      canDiscard: canAct && game.turnState === 'thinking' && game.players[game.turnIndex]?.id === player.id,
      canRiichi: canAct && !player.riichi && player.score >= 1_000,
      canWin: canAct,
      canUseSkill: canAct && game.settings.wushuang,
    },
    effects,
    pendingNotifications: [...(context.pendingNotifications ?? [])],
    skillCatalogRevision: context.skillCatalogRevision ?? createSkillCatalogRevision(cards),
  };
}

export const buildControllerSnapshot = createControllerSnapshot;
