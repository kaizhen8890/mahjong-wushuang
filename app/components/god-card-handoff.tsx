'use client';
import { CinematicReturnParticles } from './cinematic-return-particles';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { SkillExperienceEvent } from '@/lib/skill-experience';
import type { CinematicPlayer } from './wushuang-cinematic';
import { CharacterPortrait } from './character-picker';
import './god-card-handoff.css';

export function GodCardHandoff({ event, players = [] }: { event: SkillExperienceEvent; players?: readonly CinematicPlayer[] }) {
  const kind = event.cardName === '断序杂音' ? 'discord' : event.cardName === '宿星审判' ? 'astral' : event.random?.faces[0] === 1 ? 'sword-heads' : 'sword-tails';
  const actor = players.find(p => p.id === event.actorId);
  const ids = useMemo(() => kind === 'astral' ? event.targets : kind === 'discord' && event.targets.length ? event.targets : [event.actorId], [kind, event.targets, event.actorId]);
  const [points, setPoints] = useState<{ x: number; y: number; id: string }[]>([]);
  useEffect(() => {
    const measure = () => setPoints(Array.from(document.querySelectorAll<HTMLElement>('.tablet-player-card'))
      .filter(card => ids.includes(card.dataset.playerId ?? '') && card.getBoundingClientRect().width > 0 && card.getBoundingClientRect().bottom > 0 && card.getBoundingClientRect().top < innerHeight).map(card => {
        const box = card.getBoundingClientRect();
        return { id: card.dataset.playerId!, x: Math.max(12, Math.min(innerWidth - 12, box.left + box.width / 2)) / innerWidth * 100, y: Math.max(12, Math.min(innerHeight - 12, box.top + box.height / 2)) / innerHeight * 100 };
      }));
    measure(); window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    document.querySelectorAll('.tablet-player-card').forEach(p => observer.observe(p));
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [ids]);
  const description = kind === 'discord' ? '己方领域展开 · 敌方荣和与鸣牌封锁' : kind === 'astral' ? '星之刻印 · 公开与弃牌由你裁定' : kind === 'sword-heads' ? '正面 · 每次摸牌额外抽取五张技能卡' : '反面 · 明示一张手牌，化为「飞」';
  return <div className={`god-handoff god-${kind}`} data-handoff={kind}>
    <div className="god-flash" />
    <CinematicReturnParticles theme={kind} targetIds={ids} />
    {actor?.character && <CharacterPortrait choice={actor.character} className="god-character" />}
    <div className="god-declaration" role="status"><small>{event.actorName} · 神卡发动</small><h2>{event.cardName}</h2><p>{description}</p><span>{kind === 'astral' ? event.targets.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(' · ') || '请按卡面指定敌方玩家' : '本局生效'}</span></div>
    {kind === 'discord' && <div className="god-fractures">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>}
    {kind === 'astral' && <div className="god-petals">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i, '--angle': `${i * 137.5}deg` } as CSSProperties} />)}</div>}
    {kind === 'sword-heads' && <div className="god-five">{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties}>技</i>)}</div>}
    {kind === 'sword-tails' && <div className="god-fly">飛</div>}
    {points.map(p => <div className="god-target" key={p.id} style={{ left: `${p.x}%`, top: `${p.y}%` }}><b>{kind === 'discord' ? '域' : kind === 'astral' ? '裁' : kind === 'sword-heads' ? '+5' : '飛'}</b></div>)}

  </div>;
}
