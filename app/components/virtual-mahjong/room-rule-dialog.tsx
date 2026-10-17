'use client';
import { useEffect, useRef, useState } from 'react';
import type { Rules } from '@/lib/virtual-mahjong/model';
import { validateRules } from '@/lib/virtual-mahjong/rules';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import { RoomRuleEditor, ruleChanges } from './room-rules';

/** Only public rules enter this editor. Applying still goes through the existing Host command. */
export function RoomRuleDialog({ current, draft, change, close, apply, error }: {
  current: Rules; draft: Rules; change: (rules: Rules) => void; close: () => void; apply: () => void; error: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [review, setReview] = useState(false), [discard, setDiscard] = useState(false);
  const changes = ruleChanges(current, draft);
  const back = () => { if (discard) setDiscard(false); else if (review) setReview(false); else if (changes.length) setDiscard(true); else close(); };
  useEffect(() => { ref.current?.showModal(); }, []);
  useNativeBackLayer(() => ref.current, back);
  let issue = '';
  try { validateRules(draft); } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    issue = message === 'Invalid points' ? '起点与返点须为 1,000～1,000,000 之间的整百点数。' : message === 'Invalid timer' ? '行动时间须在 0～3,600 秒内；鸣牌时间和总出牌时间不能为 0。' : message === 'Invalid match rules' ? '请核对终局设置：顺位马须为整数、绝对值不超过 1,000，且总和为 0。' : '请核对房间规则。';
  }
  return <dialog ref={ref} className="vr-rule-dialog" aria-labelledby="vr-rule-title" onCancel={event => { event.preventDefault(); back(); }}>
    <header><h2 id="vr-rule-title">{discard ? '放弃规则修改？' : review ? '核对房间规则变更' : '调整房间规则'}</h2><p>{discard ? '草稿尚未应用，当前房间规则保持不变。' : '应用后真人玩家需重新准备；人机自动准备。'}</p>{!discard && (issue || error) && <p role="alert">{issue || (error === 'TOO_MANY_PLAYERS' ? '当前人数超出新规则，请先移出多余席位。' : error)}</p>}</header>
    <div className="vr-rule-dialog-body">
      {discard ? <p>已调整 {changes.length} 项。可继续编辑，或放弃本次修改。</p> : review ? <dl className="vr-rule-diff">{changes.map(item => <div key={item.label}><dt>{item.label}</dt><dd><span>{item.before}</span><b aria-label="改为">→</b><strong>{item.after}</strong></dd></div>)}</dl> : <><p className="vr-rule-draft-note">修改人数会载入对应默认规则；下一步可核对全部变更。</p><RoomRuleEditor rules={draft} change={change} basics /></>}
    </div>
    <footer>{discard ? <><button onClick={() => setDiscard(false)}>继续编辑</button><button onClick={close}>放弃修改</button></> : review ? <><button onClick={() => setReview(false)}>返回修改</button><button disabled={Boolean(issue) || !changes.length} onClick={apply}>应用并取消准备</button></> : <><span>{changes.length ? `${changes.length} 项待应用` : '尚未修改'}</span><button onClick={back}>取消</button><button disabled={!changes.length || Boolean(issue)} onClick={() => setReview(true)}>核对变更</button></>}</footer>
  </dialog>;
}
