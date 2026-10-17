'use client';
import { useEffect, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CoinDecision } from '@/lib/skill-random';
import './coin-decision-dialog.css';

export function CoinDecisionDialog({ open, cardName, error, disabled = false, choose, cancel }: {
  open: boolean; cardName: string; error?: string; disabled?: boolean;
  choose: (decision: CoinDecision) => void | Promise<void>; cancel: () => void;
}) {
  const lock = useRef(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { lock.current = false; setBusy(false); } }, [open]);
  const pick = async (decision: CoinDecision) => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true);
    try { await choose(decision); } finally { lock.current = false; setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy && !disabled) cancel(); }}>
    <DialogContent className="coin-decision-dialog" showCloseButton={false}>
      <DialogHeader><DialogTitle>选择硬币结果</DialogTitle><DialogDescription>「{cardName}」：录入实体硬币结果，或在游戏内掷币。</DialogDescription></DialogHeader>
      <div className="coin-decision-options">
        <button type="button" aria-label="正面" disabled={busy || disabled} onClick={() => void pick('heads')}><span className="coin-decision-face" aria-hidden="true">正</span><strong>正面</strong><small>直接使用正面结果</small></button>
        <button type="button" aria-label="反面" disabled={busy || disabled} onClick={() => void pick('tails')}><span className="coin-decision-face coin-decision-silver" aria-hidden="true">反</span><strong>反面</strong><small>直接使用反面结果</small></button>
        <button type="button" aria-label="掷币" disabled={busy || disabled} onClick={() => void pick('toss')}><span className="coin-decision-face coin-decision-toss" aria-hidden="true"><Dices /></span><strong>掷币</strong><small>随机抽取并播放动画</small></button>
      </div>
      {error && <p className="coin-decision-error" role="alert">{error}</p>}
      {busy && <p className="coin-decision-progress" role="status">正在确认结果…</p>}
      <DialogFooter><Button variant="outline" disabled={busy || disabled} onClick={cancel}>返回</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

