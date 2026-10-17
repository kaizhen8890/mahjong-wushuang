'use client';
import { manualFu } from '@/lib/hand-analysis';
import { HandDisplay } from './mahjong-tile';

const groups = [
  { name: '顺子／无', fu: 0, tiles: ['2p', '3p', '4p'] },
  { name: '中张明刻', fu: 2, tiles: ['5p', '5p', '5p'] },
  { name: '中张暗刻', fu: 4, tiles: ['5p', '5p', '5p'] },
  { name: '幺九明刻', fu: 4, tiles: ['1p', '1p', '1p'] },
  { name: '幺九暗刻', fu: 8, tiles: ['1p', '1p', '1p'] },
  { name: '中张明杠', fu: 8, tiles: ['5p', '5p', '5p', '5p'] },
  { name: '中张暗杠', fu: 16, tiles: ['5p', '5p', '5p', '5p'] },
  { name: '幺九明杠', fu: 16, tiles: ['1p', '1p', '1p', '1p'] },
  { name: '幺九暗杠', fu: 32, tiles: ['1p', '1p', '1p', '1p'] },
] as const;
export interface ManualFuDraft { special: string; pair: number; wait: number; groups: number[] }
export const blankManualFu = (): ManualFuDraft => ({ special: 'normal', pair: 0, wait: 0, groups: [0, 0, 0, 0] });

export function ManualFuPanel({ value, change, closed, tsumo, currentFu, apply }: {
  value: ManualFuDraft; change: (next: ManualFuDraft) => void; closed: boolean; tsumo: boolean;
  currentFu?: number; apply: (fu: number) => void;
}) {
  const chosen = value.groups.map(index => groups[index] ?? groups[0]);
  const result = manualFu(closed, tsumo, value.pair, value.wait, chosen.map(group => group.fu), value.special);
  const sources: [string, number][] = [['副底', 20], ['门清荣和', closed && !tsumo ? 10 : 0], ['自摸', tsumo ? 2 : 0], ['雀头', value.pair], ['等待', value.wait], ['四组面子', chosen.reduce((sum, group) => sum + group.fu, 0)]];
  const raw = sources.reduce((sum, [, fu]) => sum + fu, 0);
  return <div className="manual-fu-panel">
    <div className="calculator-context"><strong>{closed ? '门清' : '副露'} · {tsumo ? '自摸' : '荣和'}</strong><span>沿用上方基本情况</span></div>
    <p>不必录入整副手牌。按现场情况选择，核对后再采用符数；役种仍由你勾选。</p>
    <label className="fu-special">计算方式<select aria-label="算符方式" value={value.special} onChange={e => change({ ...value, special: e.target.value })}>
      <option value="normal">一般形 · 逐项计算</option><option value="seven">七对子 · 固定 25 符</option><option value="pinfu">已确认平和</option><option value="skip">五番以上／役满 · 不依赖符数</option>
    </select></label>
    {value.special === 'normal' ? <>
      <div className="fu-pair-wait">
        <label>雀头<select aria-label="雀头符数" value={value.pair} onChange={e => change({ ...value, pair: Number(e.target.value) })}><option value={0}>普通对子 · 0 符</option><option value={2}>白发中／自风／场风 · 2 符</option><option value={4}>自风与场风相同 · 4 符</option></select></label>
        <label>等待<select aria-label="等待符数" value={value.wait} onChange={e => change({ ...value, wait: Number(e.target.value) })}><option value={0}>两面／双碰 · 0 符</option><option value={2}>边张／坎张／单骑 · 2 符</option></select></label>
      </div>
      <div className="fu-groups">{chosen.map((group, index) => <article key={index}>
        <label>面子 {index + 1}<select aria-label={`面子 ${index + 1}`} value={value.groups[index]} onChange={e => change({ ...value, groups: value.groups.map((old, i) => i === index ? Number(e.target.value) : old) })}>{groups.map((option, i) => <option key={option.name} value={i}>{option.name} · +{option.fu} 符</option>)}</select></label>
        <div className="fu-group-example"><HandDisplay tiles={[...group.tiles]} /><strong>+{group.fu}<small> 符</small></strong></div><small>牌图示意 · {group.name}</small>
      </article>)}</div>
      <p className="calculator-note">中张为 2–8 数牌，幺九包括 1、9 与字牌。荣和补成的刻子按明刻计符；暗杠不破门清。</p>
    </> : <p className="calculator-note">{value.special === 'seven' ? '七对子固定 25 符，不叠加雀头、等待或面子的符。役种请同时勾选七对子。' : value.special === 'pinfu' ? `仅在已确认平和成立时使用：自摸 20 符，荣和 30 符。当前按${tsumo ? '自摸' : '荣和'}计算。` : '五番以上或役满不依赖符数；沿用原规则填入 30 符作为记录值，番数与役满仍以当前勾选为准。'}</p>}
    <section className="fu-review" aria-label="符数核对">
      <div><span>本次算符结果</span><output>{result}<small> 符</small></output><small>{currentFu === undefined ? '采用前不会修改符数' : `当前表单 ${currentFu} 符 · 采用后才更新`}</small></div>
      {value.special === 'normal' && <div className="fu-sources"><dl>{sources.filter(([, fu]) => fu > 0).map(([label, fu]) => <div key={label}><dt>{label}</dt><dd>+{fu}</dd></div>)}</dl><p>合计 {raw} 符 → {result} 符{raw !== result && (raw < 30 ? '（一般形至少 30 符）' : '（进位至整十）')}</p></div>}
    </section>
    <button type="button" className="fu-apply" onClick={() => apply(result)}>采用 {result} 符</button>
    <small className="calculator-note">仅更新本次表单，不会直接结算。采用后自动识别关闭，仍可返回牌姿页重新开启。</small>
  </div>;
}
