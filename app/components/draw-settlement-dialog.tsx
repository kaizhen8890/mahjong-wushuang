'use client';
import { Check, ListRestart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GameState } from '@/lib/mahjong';
import { CharacterAvatar } from './character-picker';
import './point-flows.css';

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; game: GameState;
  tenpaiIds: string[]; onTenpaiChange: (ids: string[]) => void;
  nagashiIds: string[]; onNagashiChange: (ids: string[]) => void;
  pool: number; onPoolChange: (value: number) => void;
  deltas: Record<string, number>; issue: string; onConfirm: () => void;
};
const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];

export function DrawSettlementDialog({ open, onOpenChange, game, tenpaiIds, onTenpaiChange, nagashiIds, onNagashiChange, pool, onPoolChange, deltas, issue, onConfirm }: Props) {
  const playing = game.players.filter(player => player.active && player.participation === 'playing');
  const tenpaiCount = playing.filter(player => tenpaiIds.includes(player.id)).length;
  const nagashiCount = playing.filter(player => nagashiIds.includes(player.id)).length;
  const dealer = game.players.find(player => player.wind === '东');
  const repeats = Boolean(dealer?.active && tenpaiIds.includes(dealer.id));
  const selectionSummary = nagashiCount ? `${nagashiCount} 人流局满贯，替代未听罚符` : !tenpaiCount ? '无人听牌，不转移罚符' : tenpaiCount === playing.length ? '全员听牌，不转移罚符' : `${tenpaiCount} 人听牌，${playing.length - tenpaiCount} 人未听`;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="draw-dialog draw-workspace">
      <DialogHeader><DialogTitle>流局结算</DialogTitle><DialogDescription>点选听牌玩家，核对点数后确认。振听也算听牌。</DialogDescription></DialogHeader>
      <div className="draw-workspace-body">
        <section className="draw-selection-panel">
          <div className="draw-section-heading"><h3>谁已听牌？</h3><span>{tenpaiCount} / {playing.length} 人</span></div>
          <div className="draw-seat-grid" aria-label="听牌玩家">{playing.map(player => {
            const selected = tenpaiIds.includes(player.id);
            return <button type="button" key={player.id} aria-label={`听牌：${player.wind} · ${player.name}`} aria-pressed={selected} onClick={() => onTenpaiChange(toggle(tenpaiIds, player.id))}>
              <CharacterAvatar choice={player.character} /><span className="draw-seat-name"><strong>{player.wind} · {player.name}</strong><small>{player.score.toLocaleString('zh-CN')} 点</small></span><span className="draw-seat-state">{selected && <Check />}{selected ? '听牌' : '未听'}</span>
            </button>;
          })}</div>
          <div className="draw-selection-shortcuts"><button type="button" onClick={() => onTenpaiChange(playing.map(player => player.id))}>全员听牌</button><button type="button" onClick={() => onTenpaiChange([])}>全部未听</button></div>
          <Label className="draw-pool-field">未听罚符总额<Input aria-label="未听罚符总额" disabled={nagashiCount > 0} type="number" min={0} step={100} value={pool} onChange={event => onPoolChange(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} /><small>{nagashiCount ? '本次按流局满贯结算，不使用未听罚符。' : '只有部分玩家听牌时，才在听牌与未听玩家之间转移。'}</small></Label>
          <details className="draw-special"><summary><span>特殊结算 · 流局满贯</span><small>{nagashiCount ? `已选 ${nagashiCount} 人` : '需要时展开'}</small></summary>
            <div><p>牌河全部为幺九牌且未被他家鸣牌时，勾选成立玩家。按满贯自摸支付，替代未听罚符。</p>
              <div className="draw-nagashi-grid" aria-label="流局满贯玩家">{playing.map(player => <button type="button" key={player.id} aria-label={`流局满贯：${player.wind} · ${player.name}`} aria-pressed={nagashiIds.includes(player.id)} onClick={() => onNagashiChange(toggle(nagashiIds, player.id))}><CharacterAvatar choice={player.character} /><span>{player.wind} · {player.name}</span>{nagashiIds.includes(player.id) && <Check />}</button>)}</div>
              <p>供托保留、本场加一；是否连庄仍按上方的听牌选择。</p>
            </div>
          </details>
        </section>
        <section className="draw-payment-panel" aria-label="流局支付预览">
          <div className="draw-section-heading"><h3>本次点数变化</h3><span>确认后记账</span></div>
          <p className="draw-selection-summary" aria-live="polite">{selectionSummary}</p>
          <div className="draw-payment-list">{playing.map(player => {
            const delta = deltas[player.id] || 0;
            return <div key={player.id} data-player-id={player.id}><CharacterAvatar choice={player.character} /><span><strong>{player.wind} · {player.name}</strong><small>{nagashiIds.includes(player.id) ? '流局满贯' : tenpaiIds.includes(player.id) ? '听牌' : '未听'} · 结算后 {(player.score + delta).toLocaleString('zh-CN')}</small></span><b className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}>{delta > 0 ? '+' : ''}{delta.toLocaleString('zh-CN')}</b></div>;
          })}</div>
          <dl className="draw-next-summary"><div><dt>庄家</dt><dd>{repeats ? '听牌 · 下一局连庄' : '未听 · 下一局换庄'}</dd></div><div><dt>本场</dt><dd>{game.honba} → {game.honba + 1}</dd></div><div><dt>供托</dt><dd>{game.riichiSticks} 根保留</dd></div></dl>
        </section>
      </div>
      <DialogFooter className="draw-workspace-footer"><output className="flow-feedback" aria-live="polite">{issue || '确认后结束本局；回到牌桌点击“下一局”继续。'}</output><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button className="gold-button" disabled={Boolean(issue)} onClick={onConfirm}><ListRestart />确认流局</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
