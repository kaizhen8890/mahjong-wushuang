'use client';
import { useState, type ChangeEvent } from 'react';
import { Maximize2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { type SkillCard } from '@/lib/mahjong';
import { readRandomRule } from '@/lib/skill-random';
import { SkillCardArt } from './skill-catalog-picker';
import { SkillArtworkChoices } from './skill-artwork-choices';
import { RandomRuleEditor } from './skill-experience';
import bundledCards from '@/data/skill-cards.json';
import './library-panels.css';

const TYPES = [['单','个人增益'],['团','团队增益'],['攻','负面攻击'],['陷','防守陷阱'],['环','战局环境'],['神','无双神卡']];
// This local editor keeps the original face while its title is being renamed.
const faceCard = (card: SkillCard) => card.custom ? card : { ...card, name: bundledCards.cards.find(item => item.id === card.id)?.name ?? card.name };
export function skillEditorIssue(card: SkillCard | null) {
  if (!card?.name.trim() || !card.effectDescription.trim()) return '请填写卡片名称和效果说明。';
  try { if (card.randomRule) readRandomRule(card.randomRule); } catch (e) { return e instanceof Error ? e.message : '随机规则配置无效'; }
  return '';
}
export function SkillDetailPanel({ card, change }: { card: SkillCard; change: (artwork: string) => void }) {
  const [zoom, setZoom] = useState(false);
  return <><div className="library-detail-body"><aside><button type="button" className="library-card-zoom" onClick={() => setZoom(true)} aria-label="放大查看卡面"><SkillCardArt card={faceCard(card)} /><span><Maximize2 /> 放大卡面</span></button><SkillArtworkChoices card={faceCard(card)} change={change} /></aside><section className="library-rule-copy"><small>当前软件规则</small><h3>{card.name}</h3><p>{card.effectDescription}</p><div className="library-rule-facts">{[['使用时机',card.timing?.playWindow || '摸牌前'],['作用对象',card.targeting?.scope || '依卡面说明'],['持续范围',card.timing?.duration || '依卡面说明'],['叠加规则',card.stackability || '资料未说明']].map(([title,text]) => <div key={title}><small>{title}</small><strong>{text}</strong></div>)}</div>{Boolean(card.ambiguities?.length) && <div className="library-ruling"><h4>裁定提示</h4>{card.ambiguities?.map((text,index) => <p key={index}>{text}</p>)}</div>}<p className="library-hint">卡面可能保留旧文案，请按当前软件规则与现场裁定执行。切换卡面仅供预览，编辑并保存后才更新本机资料。</p>{card.flavorText && <blockquote>{card.flavorText}</blockquote>}</section></div><Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="library-art-lightbox"><DialogHeader><DialogTitle>{card.name} · 卡面</DialogTitle><DialogDescription>完整展示原有卡面；关闭后回到技能详情。</DialogDescription></DialogHeader><SkillCardArt card={faceCard(card)} /></DialogContent></Dialog></>;
}
export function SkillEditorPanel({ card, change, upload }: { card: SkillCard; change: (card: SkillCard) => void; upload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [section, setSection] = useState('基础资料');
  const patch = (value: Partial<SkillCard>) => change({ ...card, ...value });
  return <div className="library-editor-body"><aside className="library-editor-preview"><SkillCardArt card={faceCard(card)} /><strong>{card.name || '未命名技能'}</strong><small>{card.rarity} · {card.type.code}</small><p>预览会跟随编辑更新。保存后应用到本机技能库。</p></aside><div className="library-editor-main"><nav aria-label="技能编辑分区">{['基础资料','卡面素材','随机与高级'].map(name => <button type="button" key={name} aria-pressed={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav><div className="library-editor-scroll">
    <section hidden={section !== '基础资料'}><h3>基础资料</h3><div className="library-fields"><label>名称<input value={card.name} onChange={e => patch({name:e.target.value})} /></label><label>稀有度<select value={card.rarity} onChange={e => patch({rarity:e.target.value})}>{['普通','稀有','史诗','无双'].map(name => <option key={name}>{name}</option>)}</select></label><label>类型<select value={card.type.code} onChange={e => patch({type:{...card.type, code:e.target.value, name:TYPES.find(([code]) => code === e.target.value)?.[1] ?? '自定义'}})}>{TYPES.map(([code,name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label><label>使用时机<input value={card.timing?.playWindow ?? ''} onChange={e => patch({timing:{...card.timing, playWindow:e.target.value}})} /></label></div><label>效果说明<textarea value={card.effectDescription} onChange={e => patch({effectDescription:e.target.value, summary:e.target.value})} /></label><label>风味文字<input value={card.flavorText} onChange={e => patch({flavorText:e.target.value})} /></label></section>
    <section hidden={section !== '卡面素材'}><h3>卡面素材</h3><p className="library-hint">PNG、JPEG 或 WebP，单张不超过 1.5 MB。保持原图背景与透明区域。</p><label className="library-upload"><Upload /> 更换素材<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></label><SkillArtworkChoices card={faceCard(card)} change={artwork => patch({artwork})} /><p className="library-hint">上传图用于本机技能库；手机遥控器仍只匹配已内置的卡面。</p></section>
    <section hidden={section !== '随机与高级'}><h3>随机与高级</h3><p className="library-hint">这里只编辑规则。实际发动时仍由主机判定，预览不会掷币、掷骰或记分。</p><RandomRuleEditor value={card.randomRule} change={randomRule => patch({randomRule})} /></section>
  </div></div></div>;
}
