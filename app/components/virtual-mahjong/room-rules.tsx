import type { ChangeEvent } from 'react';
import type { Rules } from '@/lib/virtual-mahjong/model';
import { defaultRules as defaultForPlayerCount } from '@/lib/virtual-mahjong/rules';

const enabled = (value: boolean) => value ? '开' : '关';
const multiRon = { all: '多家和', 'head-bump': '头跳', 'triple-abort': '三家和流局' } as const;

/** Public configuration only; this component never receives a Host checkpoint. */
export function RoomRuleSummary({ rules }: { rules: Rules }) {
  return <div className="vr-rule-summary" aria-label="房间规则摘要">
    <p><strong>{rules.players}人 · {rules.length === 'east' ? '东风战' : '半庄战'}</strong><span>起点 {rules.startingPoints.toLocaleString()} ／ 返点 {rules.returnPoints.toLocaleString()}</span></p>
    <p>出牌 {rules.timer.fixedMs / 1000}＋{rules.timer.bankMs / 1000} 秒 · 鸣牌 {rules.timer.responseMs / 1000} 秒 · {multiRon[rules.multiRon]}</p>
    <p>食断{enabled(rules.openTanyao)} · 赤牌{enabled(rules.redFives)} · 切上满贯{enabled(rules.kiriageMangan)} · 累计役满{enabled(rules.kazoeYakuman)} · 双倍役满{enabled(rules.doubleYakuman)} · 三麻自摸损{enabled(rules.sanmaTsumoLoss)}</p>
    <p>九种九牌{enabled(rules.abortiveDraws.nineTerminals)} · 四风连打{enabled(rules.abortiveDraws.fourWinds)} · 四杠散了{enabled(rules.abortiveDraws.fourKans)} · 四家立直{enabled(rules.abortiveDraws.fourRiichi)}</p>
    <p>负分结束{enabled(rules.match.bankruptcy)} · 庄家和牌终局{enabled(rules.match.dealerWinEnd)} · 庄家听牌终局{enabled(rules.match.dealerTenpaiEnd)} · 延长{rules.match.extension === 'one-wind' ? '一风' : '无'} · 顺位马 {rules.match.uma.join(' / ')}</p>
  </div>;
}

export function RoomRuleEditor({ rules, change, basics = false }: { rules: Rules; change: (next: Rules) => void; basics?: boolean }) {
  const bool = (key: 'openTanyao' | 'redFives' | 'kiriageMangan' | 'kazoeYakuman' | 'doubleYakuman' | 'sanmaTsumoLoss') =>
    (event: ChangeEvent<HTMLInputElement>) => change({ ...rules, [key]: event.target.checked });
  return <div className="vr-rule-editor">
    {basics && <div className="vr-rule-fields">
      <label>人数<select value={rules.players} onChange={event => change({ ...defaultForPlayerCount(Number(event.target.value) as 3 | 4) })}><option value={4}>四人麻将</option><option value={3}>三人麻将</option></select></label>
      <label>长度<select value={rules.length} onChange={event => change({ ...rules, length: event.target.value as Rules['length'] })}><option value="east">东风战</option><option value="hanchan">半庄战</option></select></label>
      <label>起始点数<input type="number" step={100} value={rules.startingPoints} onChange={event => change({ ...rules, startingPoints: Number(event.target.value) })} /></label>
      <label>返点<input type="number" step={100} value={rules.returnPoints} onChange={event => change({ ...rules, returnPoints: Number(event.target.value) })} /></label>
    </div>}
    <details><summary>和牌与流局规则</summary><div className="vr-rule-fields">
      {([['openTanyao', '食断'], ['redFives', '赤宝牌'], ['kiriageMangan', '切上满贯'], ['kazoeYakuman', '累计役满'], ['doubleYakuman', '双倍役满'], ['sanmaTsumoLoss', '三麻自摸损']] as const).map(([key, label]) => <label className="vr-rule-check" key={key}><input type="checkbox" checked={rules[key]} onChange={bool(key)} /><span>{label}</span><small>{rules[key] ? '开' : '关'}</small></label>)}
      <label>多家和牌<select value={rules.multiRon} onChange={event => change({ ...rules, multiRon: event.target.value as Rules['multiRon'] })}><option value="all">允许多家和</option><option value="head-bump">头跳</option><option value="triple-abort">三家和流局</option></select></label>
      {([['nineTerminals', '九种九牌'], ['fourWinds', '四风连打'], ['fourKans', '四杠散了'], ['fourRiichi', '四家立直']] as const).map(([key, label]) => <label className="vr-rule-check" key={key}><input type="checkbox" checked={rules.abortiveDraws[key]} onChange={event => change({ ...rules, abortiveDraws: { ...rules.abortiveDraws, [key]: event.target.checked } })} /><span>{label}</span><small>{rules.abortiveDraws[key] ? '开' : '关'}</small></label>)}
    </div></details>
    <details><summary>行动时间</summary><div className="vr-rule-fields">
      {([['fixedMs', '基本出牌秒数'], ['bankMs', '额外秒数'], ['responseMs', '鸣牌基本秒数']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={0} max={3600} step={1} value={rules.timer[key] / 1000} onChange={event => change({ ...rules, timer: { ...rules.timer, [key]: Number(event.target.value) * 1000 } })} /></label>)}
    </div></details>
    <details><summary>终局与顺位</summary><div className="vr-rule-fields">
      {([['bankruptcy', '负分结束'], ['dealerWinEnd', '庄家和牌终局'], ['dealerTenpaiEnd', '庄家听牌终局']] as const).map(([key, label]) => <label className="vr-rule-check" key={key}><input type="checkbox" checked={rules.match[key]} onChange={event => change({ ...rules, match: { ...rules.match, [key]: event.target.checked } })} /><span>{label}</span><small>{rules.match[key] ? '开' : '关'}</small></label>)}
      <label>延长局<select value={rules.match.extension} onChange={event => change({ ...rules, match: { ...rules.match, extension: event.target.value as Rules['match']['extension'] } })}><option value="none">无</option><option value="one-wind">一风</option></select></label>
      {rules.match.uma.map((value, index) => <label key={index}>{index + 1}位顺位马<input type="number" step={1} value={value} onChange={event => change({ ...rules, match: { ...rules.match, uma: rules.match.uma.map((entry, at) => at === index ? Number(event.target.value) : entry) } })} /></label>)}
      <small>顺位马总和必须为 0。</small>
    </div></details>
  </div>;
}

function ruleEntries(rules: Rules): Array<[string, string]> {
  return [
    ['人数', `${rules.players} 人`], ['长度', rules.length === 'east' ? '东风战' : '半庄战'],
    ['起始点数', rules.startingPoints.toLocaleString('zh-CN')], ['返点', rules.returnPoints.toLocaleString('zh-CN')],
    ...([['openTanyao', '食断'], ['redFives', '赤宝牌'], ['kiriageMangan', '切上满贯'], ['kazoeYakuman', '累计役满'], ['doubleYakuman', '双倍役满'], ['sanmaTsumoLoss', '三麻自摸损']] as const).map(([key, label]): [string, string] => [label, enabled(rules[key])]),
    ['多家和牌', multiRon[rules.multiRon]],
    ...([['nineTerminals', '九种九牌'], ['fourWinds', '四风连打'], ['fourKans', '四杠散了'], ['fourRiichi', '四家立直']] as const).map(([key, label]): [string, string] => [label, enabled(rules.abortiveDraws[key])]),
    ...([['fixedMs', '基本出牌时间'], ['bankMs', '额外时间'], ['responseMs', '鸣牌时间']] as const).map(([key, label]): [string, string] => [label, `${rules.timer[key] / 1000} 秒`]),
    ...([['bankruptcy', '负分结束'], ['dealerWinEnd', '庄家和牌终局'], ['dealerTenpaiEnd', '庄家听牌终局']] as const).map(([key, label]): [string, string] => [label, enabled(rules.match[key])]),
    ['延长局', rules.match.extension === 'one-wind' ? '一风' : '无'], ['顺位马', rules.match.uma.join(' / ')],
  ];
}

export function ruleChanges(before: Rules, after: Rules) {
  const previous = new Map(ruleEntries(before));
  return ruleEntries(after).filter(([label, value]) => previous.get(label) !== value).map(([label, value]) => ({ label, before: previous.get(label) ?? '', after: value }));
}
