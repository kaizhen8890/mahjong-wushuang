import type { SkillCard } from './mahjong';
export type PresentationUpdate = { id: number; field: 'summary' | 'flavorText'; before: string; after: string };
/** Only replace known bundled wording, preserving user edits and custom cards. */
export function updateSkillPresentation(card: SkillCard, updates: readonly PresentationUpdate[]): SkillCard {
  if (card.custom) return card;
  let next = card;
  for (const update of updates) {
    if (update.id !== card.id || !['summary', 'flavorText'].includes(update.field)) continue;
    if ((next[update.field] ?? '') === update.before) next = { ...next, [update.field]: update.after };
  }
  return next;
}
