/** Physical costs are acknowledged once; unknown physical cards are never digitally deducted. */
export function godCardCost(card?: { id: number; name: string }): string | undefined {
  if (!card) return;
  if (card.id === 42 && card.name === '断序杂音') return '两张「攻」';
  if (card.id === 43 && card.name === '宿星审判') return '两张「团」';
  if (card.id === 44 && card.name === '听天问剑') return '两张「单」';
}
