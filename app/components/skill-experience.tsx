'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { YAKU } from '@/lib/mahjong';
import { ENVIRONMENTS, type EnvironmentOptions, type EnvironmentView, type SkillExperienceEvent } from '@/lib/skill-experience';
import { randomRuleTemplate, type RandomRule, type RandomEffect, type RandomResult } from '@/lib/skill-random';
import { GAME_AUDIO, playGameSound } from '@/app/hooks/use-game-audio';
import { useNightBrightness } from '@/app/hooks/use-night-brightness';
import { useNightIntro } from '@/app/hooks/use-night-intro';
import { NightCinematic } from './night-cinematic';
import { NightBlackout } from './night-blackout';
import { isWitchCinematic } from '@/lib/witch-cinematic';
import { WitchCinematic } from './witch-cinematic';
import { isRulebookCinematic } from '@/lib/rulebook-cinematic';
import { RulebookCinematic } from './rulebook-cinematic';
import { isAzoruCinematic } from '@/lib/azoru-cinematic';
import { AzoruCinematic } from './azoru-cinematic';
import { isTreasureCinematic } from '@/lib/treasure-cinematic';
import { TreasureCinematic } from './treasure-cinematic';
import { isSilenceCinematic } from '@/lib/silence-cinematic';
import { SilenceCinematic } from './silence-cinematic';
import { wushuangOutcome } from '@/lib/wushuang-cinematic';
import { specialCinematic } from '@/lib/special-cinematic';
import { SpecialCinematic } from './special-cinematic';
import { WushuangCinematic, type CinematicPlayer } from './wushuang-cinematic';
import './skill-experience.css';

export function EnvironmentFields({ name, value = {}, change }: { name: string; value?: EnvironmentOptions; change: (value: EnvironmentOptions) => void }) {
  if (name === ENVIRONMENTS.yaku) return <label className="experience-field">声明役种（本局固定 5 番）<select aria-label="声明役种" value={value.yakuId ?? ''} onChange={e => change({ yakuId: e.target.value })}><option value="">请选择</option>{YAKU.filter(y => !y.yakuman).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>;
  if (name === ENVIRONMENTS.number) return <label className="experience-field">声明数字<select aria-label="声明数字" value={value.number ?? ''} onChange={e => change({ number: Number(e.target.value) })}><option value="">请选择</option>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>;
  return null;
}
export function EnvironmentBonusField({ environment, count, change }: { environment?: EnvironmentView; count: number; change: (n: number) => void }) {
  if (environment?.kind === 'yaku') return <p className="experience-score-note">规则怪谈：已选的「{YAKU.find(y => y.id === environment.yakuId)?.name ?? '待声明役种'}」按固定 5 番计算，不额外叠加原番。</p>;
  if (environment?.kind !== 'number') return null;
  return <label className="experience-field">偶氮玉红：确认数字 {environment.number} 的牌数（含副露）<input type="number" min={0} max={18} value={count} onChange={e => change(Math.min(18, Math.max(0, Math.trunc(Number(e.target.value) || 0))))} /><small>每两张计一张额外宝牌。本次追加 {Math.floor(count / 2)} 番；不要重复填入普通宝牌。</small></label>;
}
export { EnvironmentControls } from './environment-controls';

export function RandomRuleEditor({ value, change }: { value?: RandomRule; change: (rule: RandomRule | undefined) => void }) {
  const update = (index: number, patch: Partial<RandomRule['outcomes'][number]>) => value && change({ ...value, outcomes: value.outcomes.map((o, i) => i === index ? { ...o, ...patch } : o) });
  return <fieldset className="random-editor"><legend>随机判定（可选）</legend><label className="experience-field">机制<select value={value?.kind ?? ''} onChange={e => change(e.target.value ? randomRuleTemplate(e.target.value as RandomRule['kind']) : undefined)}><option value="">不使用随机判定</option><option value="coin">决斗币</option><option value="dice">骰子</option><option value="wheel">轮盘</option></select></label>
    {value && <><p>主机只判定一次，先保存结果，再播放动画。点数变化为场外增减。</p>{value.kind !== 'wheel' && <label className="experience-field">投掷次数<input type="number" min={1} max={3} value={value.count} onChange={e => change({ ...value, count: Number(e.target.value) })} /><small>{value.kind === 'coin' ? '正面计 1，反面计 0，按总和选择结果。' : '按骰子点数总和选择结果。'}请为每个可能总和配置一个结果。</small></label>}
      {value.outcomes.map((o, index) => <div className="random-outcome" key={`${value.kind}-${o.id}`}><label>结果名<input maxLength={40} value={o.label} onChange={e => update(index, { label: e.target.value })} /></label>{value.kind === 'wheel' ? <label>权重<input type="number" min={1} max={1000} value={o.weight} onChange={e => update(index, { weight: Number(e.target.value) })} /><small>概率 {Math.round(o.weight / value.outcomes.reduce((n, x) => n + x.weight, 0) * 1000) / 10}%</small></label> : <label>匹配总和<input defaultValue={o.values.join(',')} placeholder="如 1,2,3" onBlur={e => update(index, { values: e.target.value.split(/[,，]/).filter(s => s.trim()).map(Number) })} /></label>}
        <label>执行效果<select value={o.effect.kind} onChange={e => update(index, { effect: { ...o.effect, kind: e.target.value as RandomEffect['kind'], amount: e.target.value === 'draw-skill' ? 1 : 0 } })}><option value="manual">现实执行提醒</option><option value="score">场外增减点数</option><option value="draw-skill">抽技能卡</option><option value="status">持续效果说明</option></select></label>
        <label>作用于<select value={o.effect.target} onChange={e => update(index, { effect: { ...o.effect, target: e.target.value as RandomEffect['target'] } })}><option value="actor">发动者</option><option value="targets">所选目标</option></select></label>
        {['score', 'draw-skill'].includes(o.effect.kind) && <label>{o.effect.kind === 'score' ? '点数（负数为扣分）' : '张数'}<input type="number" value={o.effect.amount} onChange={e => update(index, { effect: { ...o.effect, amount: Number(e.target.value) } })} /></label>}
        <label>效果说明<input maxLength={160} value={o.effect.text} onChange={e => update(index, { effect: { ...o.effect, text: e.target.value } })} /></label><button type="button" disabled={value.outcomes.length <= 2} onClick={() => change({ ...value, outcomes: value.outcomes.filter((_, i) => i !== index) })}>移除此结果</button></div>)}
      <button type="button" disabled={value.outcomes.length >= 18} onClick={() => change({ ...value, outcomes: [...value.outcomes, { id: `r-${Date.now()}`, label: '新结果', weight: 1, values: [], effect: { kind: 'manual', target: 'actor', amount: 0, text: '' } }] })}>添加结果</button></>}
  </fieldset>;
}

function RandomDisplay({ result }: { result: RandomResult }) {
  const options = result.options ?? [], sum = options.reduce((s, o) => s + o.weight, 0);
  let cursor = 0;
  const sections = options.map((o, i) => { const start = cursor; cursor += o.weight / sum * 360; return { ...o, start, end: cursor, color: ['#d9ac51','#49304e','#bb7860','#6b526f'][i % 4] }; });
  const chosen = sections.find(o => o.id === result.outcomeId);
  return <div className={`experience-random random-${result.kind}`}>
    {result.kind === 'wheel' && chosen ? <div className="experience-wheel-wrap"><b>▼</b><div className="experience-wheel" style={{ background: `conic-gradient(${sections.map(o => `${o.color} ${o.start}deg ${o.end}deg`).join(',')})`, '--stop': `${1440 - (chosen.start + chosen.end) / 2}deg` } as CSSProperties}>{sections.map((o, i) => <i key={o.id} style={{ transform: `translate(-50%,-50%) rotate(${(o.start + o.end) / 2}deg) translateY(-90px)` }}>{i + 1}</i>)}</div><small>{options.map((o, i) => `${i + 1} ${o.label}`).join(' · ')}</small></div> : <span style={result.source === 'manual' ? { animation: 'none' } : undefined}>{result.kind === 'coin' ? result.faces.map(f => f ? '正' : '反').join(' · ') : result.faces.map(n => ['','⚀','⚁','⚂','⚃','⚄','⚅'][n]).join(' ')}</span>}
    <strong style={result.source === 'manual' ? { animation: 'none' } : undefined}>{result.label}</strong>
  </div>;
}

const EMPTY: SkillExperienceEvent[] = [];
export function ExperiencePresentation({ events = EMPTY, dark = false, phone = false, contextKey, players, onComplete, onPlayed }: { events?: SkillExperienceEvent[]; dark?: boolean; phone?: boolean; contextKey?: string; players?: readonly CinematicPlayer[]; onComplete?: (event:SkillExperienceEvent)=>void; onPlayed?: (event:SkillExperienceEvent)=>void }) {
  const seen = useRef(new Set(events.map(e => e.id))), [queue, setQueue] = useState<SkillExperienceEvent[]>([]);
  const previousContext = useRef(contextKey);
  const [target, setTarget] = useState({ x: 50, y: 50 });
  useEffect(() => {
    const added = events.filter(e => !seen.current.has(e.id) && Date.now() - e.createdAt < 10000);
    events.forEach(e => seen.current.add(e.id));
    if (seen.current.size > 100) seen.current = new Set(events.map(e => e.id));
    const replaced = previousContext.current !== contextKey;
    previousContext.current = contextKey;
    if (!document.hidden && !dark) setQueue(q => [...(replaced ? [] : q), ...added].slice(-8));
    if (dark) setQueue([]);
  }, [events, dark, contextKey]);
  const event = queue[0];
  const cinematic = event && (isWitchCinematic(event) || isRulebookCinematic(event) || isAzoruCinematic(event) || isTreasureCinematic(event) || isSilenceCinematic(event) || !!wushuangOutcome(event) || !!specialCinematic(event));
  const completeCallback=useRef(onComplete);completeCallback.current=onComplete;
  const playedCallback = useRef(onPlayed);
  useEffect(() => { playedCallback.current = onPlayed; }, [onPlayed]);
  const played = useCallback(() => { if (event && !phone) playedCallback.current?.(event); }, [event, phone]);
  const completedEvent=useRef('');
  const complete = useCallback(() => {setQueue(q => q.filter(e => e.id !== event?.id));if(event&&completedEvent.current!==event.id){completedEvent.current=event.id;completeCallback.current?.(event);}}, [event]);
  useEffect(() => {
    if (!event) return;
    const measure = () => {
      const element = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(n => n.dataset.playerId === event.targets[0]);
      const box = element?.getBoundingClientRect(); setTarget(box ? { x: (box.left + box.width / 2) / innerWidth * 100, y: (box.top + box.height / 2) / innerHeight * 100 } : { x: 50, y: 50 });
    };
    measure(); window.addEventListener('resize', measure);
    if (!phone && !cinematic) playGameSound(event.kind === 'judgement' ? GAME_AUDIO.thunder : GAME_AUDIO.skillShatter, .55);
    const finish = cinematic ? undefined : setTimeout(complete, phone ? 2100 : 3600);
    const hide = () => { if (document.hidden) setQueue([]); };
    document.addEventListener('visibilitychange', hide);
    return () => { clearTimeout(finish); window.removeEventListener('resize', measure); document.removeEventListener('visibilitychange', hide); };
  }, [event, phone, cinematic, complete]);
  if (!event || dark) return null;
  if (isSilenceCinematic(event)) return createPortal(<SilenceCinematic key={event.id} event={event} phone={phone} complete={complete} />, document.body);
  if (specialCinematic(event)) return createPortal(<SpecialCinematic key={event.id} event={event} players={players} phone={phone} complete={complete} onFinished={played} />, document.body);
  const outcome = wushuangOutcome(event);
  if (outcome) return createPortal(<WushuangCinematic key={event.id} outcome={outcome} event={event} players={players} phone={phone} complete={complete} />, document.body);
  if (isWitchCinematic(event)) return createPortal(<WitchCinematic key={event.id} event={event} phone={phone} complete={complete} />, document.body);
  if (isRulebookCinematic(event)) return createPortal(<RulebookCinematic key={event.id} event={event} phone={phone} complete={complete} />, document.body);
  if (isAzoruCinematic(event)) return createPortal(<AzoruCinematic key={event.id} event={event} phone={phone} complete={complete} />, document.body);
  if (isTreasureCinematic(event)) return createPortal(<TreasureCinematic key={event.id} event={event} phone={phone} complete={complete} />, document.body);
  const style = { '--target-x': `${target.x}%`, '--target-y': `${target.y}%` } as CSSProperties;
  return createPortal(<section key={event.id} className={`experience-show exp-${event.environment ?? event.kind} ${phone ? 'exp-phone' : ''} ${event.kind === 'judgement' ? 'exp-judgement' : ''}`} style={style} aria-label={`${event.cardName}演出`}>
    <div className="experience-orbit" aria-hidden="true"><svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="175"/><circle cx="200" cy="200" r="146"/><path d="M200 30 347 285 53 285Z M200 370 53 115 347 115Z"/>{Array.from({ length: 12 }, (_, i) => <path key={i} transform={`rotate(${i * 30} 200 200)`} d="M200 22v30 M194 37h12" />)}</svg></div>
    <div className="experience-motes" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--angle': `${i * 137.5}deg`, '--travel': `${80 + i % 7 * 22}px`, '--delay': `${i % 5 * 65}ms` } as CSSProperties} />)}</div>
    {event.kind === 'judgement' && <div className="experience-sentence" aria-hidden="true"><span>裁 决</span></div>}
    {event.environment === 'number' && <div className="experience-number" aria-hidden="true">{event.label.match(/[1-9]/)?.[0]}<small>玉 红 之 数</small></div>}
    {event.environment === 'yaku' && <div className="experience-scroll" aria-hidden="true"><span>{event.label.split(' · ')[0]}</span><small>伍 番 · 本 局 有 效</small></div>}
    {event.environment === 'silence' && <div className="experience-hush" aria-hidden="true">寂<small>静默封印</small></div>}
    {event.random && <RandomDisplay result={event.random} />}
    <div className="experience-title"><small>{event.actorName}</small><h2>{event.cardName}</h2><p>{event.label}</p></div><button className="experience-skip" onClick={() => setQueue(q => q.slice(1))}>跳过演出</button>
  </section>, document.body);
}

export function NightMode({ active, leave, effectId, events = EMPTY, phone = false }: {
  active: boolean; leave?: () => void; effectId?: string; events?: SkillExperienceEvent[]; phone?: boolean;
}) {
  const { intro, complete } = useNightIntro({ active, context: active ? effectId : undefined, events,
    minimal: phone || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches), visible: typeof document === 'undefined' || !document.hidden });
  useNightBrightness(active && !intro);
  if (!active || phone) return null;
  if (intro) return createPortal(<NightCinematic key={intro.id} event={intro} complete={complete} />, document.body);
  return createPortal(<NightBlackout key={effectId} leave={leave} />, document.body);
}
