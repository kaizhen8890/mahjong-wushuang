'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, History, Library, Upload, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { migrateSkillLibrary, SKILL_CATALOG_REVISION } from '@/lib/skill-catalog';
import { readRandomRule } from '@/lib/skill-random';
import { exportJson } from '@/lib/file-export';
import type { GameState, SkillCard } from '@/lib/mahjong';
import './operation-dialogs.css';

type Pending = { kind: 'match'; name: string; game: GameState } | { kind: 'cards'; name: string; cards: SkillCard[] };
export function DataManagementDialog({ open, close, game, cards, normalizeMatch, applyMatch, applyCards }: {
  open: boolean; close: () => void; game: GameState; cards: SkillCard[];
  normalizeMatch: (value: GameState) => GameState;
  applyMatch: (value: GameState) => void; applyCards: (value: SkillCard[]) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const request = useRef({ id: 0 }), applying = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const lifecycle = request.current;
    return () => { lifecycle.id++; };
  }, []);
  useEffect(() => { if (pending) heading.current?.focus(); }, [pending]);
  function back() {
    if (applying.current) return;
    request.current.id++; setBusy(false); setError(''); setNotice('');
    if (pending) setPending(null); else close();
  }
  async function backup(kind: 'match' | 'cards', includeMatch = false) {
    setError(''); setNotice('');
    try {
      await exportJson(includeMatch ? '麻将无双替换前备份.json' : kind === 'match' ? '麻将无双对局备份.json' : '麻将无双技能卡资料库.json', kind === 'match'
        ? { schemaVersion: 1, exportedAt: new Date().toISOString(), game }
        : { schemaVersion: 1, skillCatalogRevision: SKILL_CATALOG_REVISION, cards, ...(includeMatch ? { game, exportedAt: new Date().toISOString() } : {}) });
      setNotice(includeMatch ? '已发起备份下载，文件同时含对局和技能库；恢复时可分别从两个导入入口选择此文件。请确认已保存。' : '已发起备份下载，请确认文件已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '备份未导出，请重试'); }
  }
  async function choose(kind: 'match' | 'cards', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const ticket = ++request.current.id;
    setBusy(true); setError(''); setNotice('');
    try {
      const parsed = JSON.parse(await file.text());
      let next: Pending;
      if (kind === 'cards') {
        const raw = Array.isArray(parsed) ? parsed : parsed?.cards;
        if (!Array.isArray(raw) || !raw.length) throw new Error('文件中没有技能卡资料');
        const imported = migrateSkillLibrary(raw, Array.isArray(parsed) ? undefined : parsed.skillCatalogRevision ?? parsed.catalogRevision);
        if (!imported.length) throw new Error('文件中没有可用技能卡');
        for (const card of imported) if (card.randomRule) readRandomRule(card.randomRule);
        next = { kind, name: file.name, cards: imported };
      } else {
        const value = parsed?.game ?? parsed;
        if (!Array.isArray(value?.players) || !value.players.length) throw new Error('文件中没有对局记录');
        next = { kind, name: file.name, game: normalizeMatch(value) };
      }
      if (request.current.id === ticket) setPending(next);
    } catch (cause) {
      if (request.current.id === ticket) setError(cause instanceof SyntaxError ? '无法读取这个 JSON 文件，请选择之前导出的备份。' : cause instanceof Error ? cause.message : '文件格式不正确');
    } finally { if (request.current.id === ticket) setBusy(false); }
  }
  function confirm() {
    if (!pending || applying.current) return;
    applying.current = true;
    try {
      if (pending.kind === 'match') applyMatch(pending.game); else applyCards(pending.cards);
      setPending(null); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '没有完成导入，请检查文件'); }
    finally { applying.current = false; }
  }
  const removed = pending?.kind === 'cards' ? cards.filter(card => !pending.cards.some(next => next.id === card.id)).length : 0;
  return <Dialog open={open} onOpenChange={value => { if (!value) back(); }}>
    <DialogContent className="data-dialog data-manager">
      <DialogHeader><DialogTitle ref={heading} tabIndex={-1}>{pending ? '确认导入内容' : '备份与恢复'}</DialogTitle>
        <DialogDescription>{pending ? '核对内容与替换范围，确认后才会修改本机数据。' : '先保存一份备份，再恢复对局或维护技能库。'}</DialogDescription></DialogHeader>
      <div className="data-manager-scroll">
        {pending ? <>
          <div className="import-file"><ShieldCheck /><div><strong>{pending.kind === 'match' ? '对局备份' : '技能卡资料库'}</strong><span>{pending.name}</span></div><b>待确认</b></div>
          {pending.kind === 'match' ? <>
            <div className="import-summary"><div><span>参与玩家</span><strong>{game.players.length} → {pending.game.players.length} 人</strong></div><div><span>历史记录</span><strong>{pending.game.history.length} 条</strong></div></div>
            <div className="import-players">{pending.game.players.map(player => <div key={player.id}><span className="wind-seal">{player.wind}</span><span>{player.name}</span><strong>{player.score.toLocaleString()} 点</strong></div>)}</div>
            <p className="import-impact">将替换当前对局的玩家、点数、规则、技能手牌与历史。技能库、角色素材和表情库不会随此文件替换。</p>
          </> : <>
            <div className="import-summary"><div><span>技能卡数量</span><strong>{cards.length} → {pending.cards.length} 张</strong></div><div><span>原库不再包含</span><strong>{removed} 张</strong></div></div>
            <div className="import-card-names">{pending.cards.map(card => <span key={card.id}>{card.name}</span>)}</div>
            <p className="import-impact">将替换本机技能库，并清理玩家手牌、牌库、弃牌堆和场上效果中的失效引用。不会导入角色或表情素材。</p>
          </>}
          <Button variant="outline" className="import-backup" onClick={() => void backup(pending.kind, pending.kind === 'cards')}><Download /> 先备份当前{pending.kind === 'match' ? '对局' : '对局与技能库'}</Button>
        </> : <>
          <section className="data-section"><h3><Download /> 保存备份</h3><div className="data-actions">
            <button type="button" onClick={() => void backup('match')}><History /><span><strong>导出当前对局</strong><small>玩家、点数、规则与历史</small></span></button>
            <button type="button" onClick={() => void backup('cards')}><Library /><span><strong>导出技能库</strong><small>内置卡与自制卡资料</small></span></button>
          </div></section>
          <section className="data-section"><h3><Upload /> 从文件恢复</h3><p>选文件后会先显示预览，不会立即替换。</p><div className="data-actions">
            <label><History /><span><strong>导入对局备份</strong><small>核对玩家与点数后恢复</small></span><input type="file" disabled={busy} accept="application/json,.json" onChange={e => void choose('match', e)} /></label>
            <label><Library /><span><strong>导入技能库</strong><small>核对卡片与清理范围</small></span><input type="file" disabled={busy} accept="application/json,.json" onChange={e => void choose('cards', e)} /></label>
          </div></section><p className="data-scope">角色和表情素材请在各自的管理页面单独导出。</p>
        </>}
        {busy && <output>正在读取文件…</output>}{error && <p className="import-error" role="alert">{error}</p>}{notice && <output className="import-notice">{notice}</output>}
      </div>
      <DialogFooter><Button variant="outline" onClick={back}><ArrowLeft />{pending ? '取消导入' : '返回牌桌'}</Button>{pending && <Button className="gold-button" onClick={confirm}>{pending.kind === 'match' ? '确认替换对局' : '确认替换技能库'}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
