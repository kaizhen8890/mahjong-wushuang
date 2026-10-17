'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check, ChevronRight, Gavel, Gem, Moon, VolumeX, X } from 'lucide-react';
import { YAKU } from '@/lib/mahjong';
import type { CharacterChoice } from '@/lib/characters';
import type { EnvironmentAction, EnvironmentView } from '@/lib/skill-experience';
import { CharacterAvatar } from './character-picker';
import { FitLabel } from './fit-label';
import './environment-controls.css';

type Seat = { id: string; name: string; active: boolean; enemy?: boolean; team?: string; wind?: string; character?: CharacterChoice };
type EnvironmentControlsProps = {
  environment?: EnvironmentView; actorId: string; seats: Seat[]; host?: boolean; teams?: boolean; disabled?: boolean;
  action: (actorId: string, input: EnvironmentAction) => Promise<void> | void;
};
export function EnvironmentControls(props: EnvironmentControlsProps) {
  return props.environment ? <EnvironmentPanel key={props.environment.effectId} {...props} environment={props.environment} /> : null;
}
function EnvironmentPanel({ environment: env, actorId, seats, host = false, teams = false, disabled = false, action }: EnvironmentControlsProps & { environment: EnvironmentView }) {
  const [open, setOpen] = useState(false), [who, setWho] = useState(''), [target, setTarget] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sending = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = (event: Event) => { if (!event.defaultPrevented) { event.preventDefault(); setOpen(false); } };
    window.addEventListener('mahjong:native-back', back);
    return () => window.removeEventListener('mahjong:native-back', back);
  }, [open]);
  const actor = seats.find(s => s.id === (host && who ? who : actorId));
  const canAct = Boolean(actor?.active && !disabled);
  const options = seats.filter(s => s.active && (env.kind !== 'witch' || (s.id !== actor?.id && (host ? !teams || s.team !== actor?.team : s.enemy !== false))));
  const canTreasure = env.kind === 'treasure' && !env.confirmed && (host || env.actorId === actorId);
  const summaries = {
    witch: host ? '选择刚碰牌的玩家，再点敌方头像直接审判。' : '刚碰牌后，点敌方头像直接审判。',
    yaku: '本局声明的役种按固定 5 番计算。',
    number: '每两张对应数字牌，计一张额外宝牌。',
    treasure: '现实牌桌翻开宝牌指示器，本局四杠不流局。',
    silence: host ? '选择违规玩家，记录场外扣分。' : '禁止交流、吃碰杠；违规由牌桌记录。',
    night: '轻点牌桌唤醒超暗操作，闲置 10 秒重新熄屏。',
  };
  const perform = async (targetId = '') => {
    if (!actor || !canAct || sending.current) return;
    if ((env.kind === 'witch' || env.kind === 'silence') && !options.some(s => s.id === targetId)) return;
    if (env.kind === 'silence' && !host) return;
    if (env.kind === 'treasure' && !canTreasure) return;
    // An explicit target/action tap is the physical acknowledgement. Host validation remains authoritative.
    sending.current = true; setBusy(true); setTarget(targetId); setError('');
    try {
      await action(actor.id, { kind: 'environment.action', effectId: env.effectId,
        action: env.kind === 'witch' ? 'judge' : env.kind === 'silence' ? 'penalty' : 'treasure', targetId, confirmed: true });
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试'); }
    finally { sending.current = false; setBusy(false); }
  };
  const changeOpen = (next: boolean) => {
    if (next) { setWho(host && !seats.some(s => s.id === actorId && s.active) ? seats.find(s => s.active)?.id ?? actorId : actorId); setTarget(''); setError(''); }
    setOpen(next);
  };
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger ref={trigger} disabled={busy} className={`experience-environment env-${env.kind}`} aria-label={`${env.name}，打开环境操作`}>
      <FitLabel maxSize={32}>{env.name}</FitLabel>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className="environment-backdrop" />
      <Dialog.Viewport className="environment-viewport">
        <Dialog.Popup className={`environment-window environment-${env.kind}`} finalFocus={trigger} aria-busy={busy}>
          <header className="environment-header">
            <div><Dialog.Title>{env.name}</Dialog.Title><Dialog.Description>{summaries[env.kind]}</Dialog.Description></div>
            <Dialog.Close className="environment-close" aria-label="关闭环境操作"><X size={22} /></Dialog.Close>
          </header>
          <div className="environment-body">
            {env.kind === 'witch' && <>
              <section className="environment-actor-section" aria-label="碰牌者">
                <h3>{host ? '谁刚刚碰牌？' : '本次碰牌者'}</h3>
                {host ? <div className="environment-actors">{seats.map(seat => <button key={seat.id} type="button" className="environment-actor" aria-label={`由${seat.name}审判`} aria-pressed={actor?.id === seat.id} disabled={!seat.active || busy || disabled} onClick={() => { setWho(seat.id); setTarget(''); setError(''); }}>
                  <span className="environment-actor-image"><CharacterAvatar choice={seat.character} />{actor?.id === seat.id && <i><Check size={13} /></i>}</span>
                  <strong>{seat.name}</strong><small>{seat.wind ? `${seat.wind}家` : seat.team}</small>
                </button>)}</div> : <div className="environment-self"><CharacterAvatar choice={actor?.character} /><strong>{actor?.name}</strong></div>}
              </section>
              <section className="environment-verdict" aria-label="审判目标">
                <h3><Gavel size={18} /> 点选敌方 · 即刻审判</h3>
                <div className="environment-targets" style={{ '--target-count': Math.max(1, options.length) } as CSSProperties}>
                  {options.map(seat => <button key={seat.id} className="environment-target" type="button" disabled={!canAct || busy} aria-label={`审判${seat.name}，退出本局`} onClick={() => void perform(seat.id)}>
                    <CharacterAvatar choice={seat.character} /><span className="environment-target-shade" />
                    <span className="environment-target-caption"><small>{seat.wind ? `${seat.wind}家` : seat.team}</small><strong>{seat.name}</strong><span>{busy && target === seat.id ? '正在审判…' : '审判'}<ChevronRight size={16} /></span></span>
                  </button>)}
                </div>
                {!options.length && <p className="environment-empty">暂无可审判的敌方玩家</p>}
              </section>
            </>}
            {env.kind === 'yaku' && <div className="environment-rule"><small>本局声明役种</small><strong>{YAKU.find(y => y.id === env.yakuId)?.name ?? '待声明'}</strong><span className="environment-value"><b>5</b>番</span><p>按固定番数结算，不再叠加该役原番。</p></div>}
            {env.kind === 'number' && <div className="environment-rule"><small>本局指定数字</small><strong className="environment-number">{env.number ?? '—'}</strong><div className="environment-equation"><span>2 张数字牌</span><ChevronRight /><span>1 张额外宝牌</span></div><p>含副露；在和牌结算中录入对应牌数。</p></div>}
            {env.kind === 'treasure' && <div className="environment-rule"><Gem className="environment-emblem" /><strong>宝牌指示器</strong><p>{env.confirmed ? '已记录翻牌 · 本局四杠不流局' : '先在现实牌桌翻开指示器，再点下方记录。'}</p>{canTreasure && <button type="button" className="environment-action" disabled={!canAct || busy} onClick={() => void perform()}><Check size={19} />{busy ? '正在记录…' : '已翻开指示器'}</button>}</div>}
            {env.kind === 'silence' && <div className="environment-rule"><VolumeX className="environment-emblem" /><strong>保持寂静</strong><p>禁止交流、吃碰杠 · 每次违规 −3,000 点</p>{host && <><div className="environment-actors">{options.map(seat => <button key={seat.id} className="environment-actor" type="button" disabled={!canAct || busy} aria-pressed={target === seat.id} onClick={() => setTarget(seat.id)}><span className="environment-actor-image"><CharacterAvatar choice={seat.character} />{target === seat.id && <i><Check size={13} /></i>}</span><strong>{seat.name}</strong></button>)}</div><button type="button" className="environment-action" disabled={!canAct || busy || !options.some(s => s.id === target)} onClick={() => void perform(target)}>{busy ? '正在记录…' : '记录违规 · −3,000'}</button></>}</div>}
            {env.kind === 'night' && <div className="environment-rule"><Moon className="environment-emblem" /><strong>暗夜中的牌桌</strong><p>手机保留超暗操作界面；使用者光源可照任意位置。</p><div className="environment-equation"><span>轻点唤醒</span><ChevronRight /><span>闲置 10 秒熄屏</span></div></div>}
            {error && <p className="environment-error" role="alert">{error}</p>}
            {disabled && <output className="environment-error">连接恢复后可继续操作</output>}
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
