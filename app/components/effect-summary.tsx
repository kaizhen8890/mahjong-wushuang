'use client';
import type { ReactNode } from 'react';
import { ArrowRight, EyeOff, ShieldCheck } from 'lucide-react';
import { SkillCardArt } from './skill-catalog-picker';
import type { CatalogCard } from '@/lib/skill-catalog-order';
import './effect-flows.css';

export function EffectSummary({ card, hidden = false, remote = false, title, from, to, duration, state, text, expanded = false, children }: {
  card?: CatalogCard; hidden?: boolean; remote?: boolean; title: string; from: string; to: string;
  duration: string; state?: string; text?: string; expanded?: boolean; children?: ReactNode;
}) {
  return <article className="effect-summary" data-hidden={hidden}>
    <div className="effect-summary-art">{hidden ? <span className="effect-concealed-art" aria-label="暗置卡片"><EyeOff /><small>暗置</small></span> : card ? <SkillCardArt card={card} remote={remote} /> : <span className="effect-concealed-art"><ShieldCheck /></span>}</div>
    <div className="effect-summary-content">
      <div className="effect-state"><span>{hidden ? '尚未揭示' : state === 'triggered' ? '已触发' : '生效中'}</span><small>{hidden ? '触发后公开' : duration}</small></div>
      <h3>{hidden ? '暗置陷阱' : title}</h3>
      <div className="effect-route"><span>{from}</span><ArrowRight aria-hidden="true" /><strong>{hidden ? '等待触发' : to}</strong></div>
      {hidden ? <p className="effect-private-note">卡名、卡面和说明保持隐藏。</p> : expanded ? <p className="effect-full-copy">{text || '按卡面说明执行'}</p> : <details className="effect-copy"><summary><span>{text || '按卡面说明执行'}</span><small>展开完整说明</small></summary><p>{text || '按卡面说明执行'}</p></details>}
    </div>
    {children && <div className="effect-summary-actions">{children}</div>}
  </article>;
}
