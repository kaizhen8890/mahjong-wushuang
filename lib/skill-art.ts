import manifest from '../public/skill-cards/manifest.json';

/** First matching entry is the default; reorder variants to change the selected face. */
export function skillCardArt(cardId: number): string | undefined {
  return manifest.cards.find(card => card.cardId === cardId)?.src;
}
