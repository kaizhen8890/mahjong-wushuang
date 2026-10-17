import data from '@/data/skill-cards.json';
import type { GameState, SkillCard } from './mahjong';
import { updateSkillPresentation, type PresentationUpdate } from './skill-presentation-update';

export const SKILL_CATALOG_REVISION = data.catalogRevision;
const bundled = data.cards as unknown as SkillCard[];
const updatedIds = new Set(data.updatedCardIds);
const retiredIds = new Set(data.retiredCardIds);
const presentationUpdates = (data as unknown as { presentationUpdates?: PresentationUpdate[] }).presentationUpdates ?? [];

/** Apply this balance revision once, preserving local artwork, random rules and custom cards. */
export function migrateSkillLibrary(saved?: readonly SkillCard[], revision?: string): SkillCard[] {
  if (!saved?.length) return [...bundled];
  const migrated = saved.filter(card => card.custom || !retiredIds.has(card.id)).map(card => {
    if (revision === SKILL_CATALOG_REVISION || revision === '2026-10-01' || card.custom || !updatedIds.has(card.id)) return updateSkillPresentation(card, presentationUpdates);
    const current = bundled.find(entry => entry.id === card.id);
    if (!current) return card;
    return { ...card, ...current, artwork: card.artwork ?? current.artwork,
      ...(card.randomRule ? { randomRule: card.randomRule } : {}) };
  });
  // Add new built-ins once, without overwriting a colliding user-created ID.
  if (revision !== SKILL_CATALOG_REVISION) {
    for (const id of data.addedCardIds) {
      const card = bundled.find(entry => entry.id === id);
      if (card && !migrated.some(entry => entry.id === id)) migrated.push(card);
    }
  }
  return migrated;
}

/** Retire playable references; retain scores, match records and resolved effect history. */
export function retireSkillReferences(game: GameState, cards: readonly SkillCard[] = bundled): GameState {
  const customIds = new Set(cards.filter(card => card.custom).map(card => card.id));
  const retired = (id: number) => retiredIds.has(id) && !customIds.has(id);
  return { ...game,
    players: game.players.map(player => ({ ...player, skillHand: (player.skillHand ?? []).filter(id => !retired(id)) })),
    skillDeck: (game.skillDeck ?? []).filter(id => !retired(id)),
    skillDiscard: (game.skillDiscard ?? []).filter(id => !retired(id)),
    effects: (game.effects ?? []).map(effect => retired(effect.cardId)
      ? { ...effect, state: 'resolved' as const, status: 'resolved' as const } : effect),
    environmentSkillId: game.environmentSkillId !== null && retired(game.environmentSkillId) ? null : game.environmentSkillId,
  };
}
