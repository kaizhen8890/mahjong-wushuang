import bundled from '@/data/skill-cards.json';

export type CatalogCard = { id: number; name: string; effectDescription: string; rarity?: string; artwork?: string | null; custom?: boolean; type?: { code: string }; typeCode?: string };
export const skillType = (card: CatalogCard) => card.typeCode ?? card.type?.code ?? '技';
export const SKILL_RARITIES = ['普通', '稀有', '史诗', '无双'] as const;
export const SKILL_TYPES = ['单', '团', '攻', '陷', '环', '神'] as const;
// Old hosts omit rarity. Only an exact bundled id/name match can supply it.
export const skillRarity = (card: CatalogCard) => card.rarity ?? (!card.custom ? bundled.cards.find(item => item.id === card.id && item.name === card.name)?.rarity : undefined) ?? '未标注';
const rank = (values: readonly string[], value: string) => { const index = values.indexOf(value); return index < 0 ? values.length : index; };

/** Presentation order only: never reorder the source catalog or the game deck. */
export function sortSkillCatalog<T extends CatalogCard>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => rank(SKILL_RARITIES, skillRarity(a)) - rank(SKILL_RARITIES, skillRarity(b))
    || skillRarity(a).localeCompare(skillRarity(b), 'zh-CN')
    || rank(SKILL_TYPES, skillType(a)) - rank(SKILL_TYPES, skillType(b))
    || skillType(a).localeCompare(skillType(b), 'zh-CN') || a.id - b.id);
}
