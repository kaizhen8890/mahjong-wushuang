'use client';
/* oxlint-disable next/no-img-element -- Existing offline card artwork. */
import { useState } from 'react';
import { Search, Check, Sparkles } from 'lucide-react';
import manifest from '@/public/skill-cards/manifest.json';
import bundled from '@/data/skill-cards.json';
import './skill-flow.css';

import { type CatalogCard, skillType, skillRarity, sortSkillCatalog } from '@/lib/skill-catalog-order';
export { skillType } from '@/lib/skill-catalog-order';
const TYPES = [['全部', '全部'], ['单', '单体'], ['团', '团队'], ['攻', '攻击'], ['陷', '陷阱'], ['环', '环境'], ['神', '神卡']];

export function SkillCardArt({ card, remote = false }: { card: CatalogCard; remote?: boolean }) {
  const [failedSource, setFailedSource] = useState('');
  const faces = manifest.cards.filter(face => face.cardId === card.id && (face.name === card.name || face.name.startsWith(card.name + ' ')));
  const oldIllustration = bundled.cards.find(item => item.id === card.id && item.name === card.name)?.artwork;
  // Preserve local uploaded art / selected variants. Legacy illustrations use the complete card face.
  // Remote cards resolve only known bundled id/name pairs; never read transmitted artwork.
  const src = remote ? faces[0]?.src : card.custom ? card.artwork : card.artwork && card.artwork !== oldIllustration ? card.artwork : faces[0]?.src ?? card.artwork;
  const visibleSource = src && src !== failedSource ? src : undefined;
  return <span className="skill-card-art" data-placeholder={!visibleSource} aria-hidden="true">{visibleSource ? <img key={visibleSource} src={visibleSource} alt="" loading="lazy" onError={() => setFailedSource(visibleSource)} /> : <Sparkles />}</span>;
}

export function SkillCatalogPicker<T extends CatalogCard>({ cards, selectedId, query, onQuery, onSelect, remote = false }: {
  cards: readonly T[]; selectedId?: number; query: string; onQuery: (value: string) => void; onSelect: (card: T) => void; remote?: boolean;
}) {
  const [type, setType] = useState('全部');
  const search = query.trim().toLocaleLowerCase('zh-CN');
  const shown = sortSkillCatalog(cards).filter(card => (type === '全部' || skillType(card) === type) && (!search || `${card.name} ${card.effectDescription} ${skillType(card)}`.toLocaleLowerCase('zh-CN').includes(search)));
  const extraTypes = [...new Set(cards.map(skillType))].filter(code => !TYPES.some(([key]) => key === code)).map(code => [code, code]);
  return <section className="skill-catalog-picker" aria-label="技能卡库">
    <label className="skill-catalog-search"><Search /><input aria-label="搜索技能卡" placeholder="搜索卡名或效果" value={query} onChange={event => onQuery(event.target.value)} /></label>
    <div className="skill-type-filters" aria-label="技能类型">{[...TYPES, ...extraTypes].map(([code, label]) => <button type="button" key={code} aria-pressed={type === code} onClick={() => setType(code)}>{label}</button>)}</div>
    <div className="skill-catalog-count"><span>{shown.length} / {cards.length} 张</span><span>稀有度 ↑ · 同类型相邻</span></div>
    <div className="skill-catalog-grid">{shown.map(card => <button type="button" key={card.id} className="skill-catalog-card" aria-label={`选择技能：${card.name}`} aria-pressed={selectedId === card.id} onClick={() => onSelect(card)}>
      <SkillCardArt card={card} remote={remote} /><span className="skill-catalog-copy"><strong>{card.name}</strong><small>{skillRarity(card)} · {skillType(card)}</small></span>{selectedId === card.id && <Check className="skill-selected-check" />}
    </button>)}</div>
    {!shown.length && <div className="skill-catalog-empty"><p>没有符合条件的卡片</p><button type="button" onClick={() => { setType('全部'); onQuery(''); }}>清除筛选</button></div>}
  </section>;
}
