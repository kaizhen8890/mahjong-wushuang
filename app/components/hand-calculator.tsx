'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assessHandInput, manualFu, parseMelds, type HandContext } from '@/lib/hand-analysis';
import { MahjongTile, HandDisplay, tileName } from './mahjong-tile';
import { tileIndex, tileCode } from '@/lib/hand-analysis';
import { YAKU } from '@/lib/mahjong';

type Props = Omit<HandContext, 'winningTile' | 'melds'> & { onApply: (ids: string[], fu?: number, closed?: boolean, analysis?: {winningTile:string;meldText:string;automatic:boolean}) => void };
const names = (ids:string[]) => ids.map(id=>YAKU.find(y=>y.id===id)?.name||id).join('、') || '暂无';
export function HandCalculator(props: Props) {
  const [winningTile,setWinningTile]=useState('');
  const [meldText,setMeldText]=useState('');
  const [meldKind,setMeldKind]=useState('吃');
  const [automatic,setAutomatic]=useState(true);
  const [pair,setPair]=useState(0), [wait,setWait]=useState(0);
  const [groups,setGroups]=useState([0,0,0,0]);
  const [special,setSpecial]=useState('normal');
  const callback=useRef(props.onApply);
  useEffect(()=>{callback.current=props.onApply;},[props.onApply]);
  const result=useMemo(()=>{
    return assessHandInput({...props,closed:props.closed || props.selected.some(id=>['riichi','double-riichi'].includes(id)),winningTile:props.tiles.includes(winningTile)?winningTile:'',meldText});
  },[props,winningTile,meldText]);
  const ids=result.complete&&result.best?result.best.yaku:props.selected;
  const fu=result.complete?result.best?.fu:undefined;
  const signature=JSON.stringify([ids,fu]);
  const selectedSignature=JSON.stringify(props.selected);
  useEffect(()=>{
    if(!automatic || result.status==='pending'){callback.current(props.selected,undefined,undefined,{winningTile,meldText,automatic:false});return;}
    const [nextIds,nextFu]=JSON.parse(signature) as [string[],number|null];
    callback.current(nextIds,nextFu??undefined,result.error ? undefined : parseMelds(meldText).some(m=>m.kind!=='ankan') ? false : props.selected.some(id=>['riichi','double-riichi'].includes(id)) ? true : undefined,{winningTile:props.tiles.includes(winningTile)?winningTile:'',meldText,automatic});
  },[signature,selectedSignature,automatic,props.tiles,props.selected,result.error,result.status,winningTile,meldText]);
  const recordedMelds = parseMelds(meldText);
  const meldTiles=(kind:string,t:number)=>kind==='吃'?[t,t+1,t+2]:Array<number>(kind.includes('杠')?4:3).fill(t);
  const remaining=Array<number>(34).fill(0);
  props.tiles.forEach(t=>{const i=tileIndex(t);if(i>=0)remaining[i]++;});
  recordedMelds.forEach(m=>meldTiles(m.kind==='chi'?'吃':m.kind==='pon'?'碰':'杠',m.tile).forEach(t=>remaining[t]--));
  const options=Array.from({length:34},(_,i)=>i).filter(i=>{
    if(meldKind==='吃'&&(i>=27||i%9>6))return false;
    const need=Array<number>(34).fill(0);meldTiles(meldKind,i).forEach(t=>need[t]++);
    return need.every((n,t)=>n<=remaining[t]);
  });
  const manual=manualFu(props.closed,props.winType==='tsumo',pair,wait,groups,special);
  return <section className="hand-calculator">
    <div className="calculator-heading"><h3>智能役与符计算</h3><label><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/> 自动勾选</label></div>
    <div className="visual-calculator-block">
      <h4>最后和到哪张牌？</h4><small>点选最后自摸或荣和的那张牌，用于判断等待方式。</small>
      <div className="tile-choice-row">{[...new Set(props.tiles)].map(t=><button type="button" key={t} aria-label={`和牌张：${tileName(t)}`} aria-pressed={winningTile===t} onClick={()=>setWinningTile(winningTile===t?'':t)}><MahjongTile tile={t}/></button>)}</div>
      {!props.tiles.length&&<p>先在牌张选择区录入麻将牌，再选最后和到的那张。</p>}
    </div>
    <div className="visual-calculator-block">
      <h4>哪些牌已经吃、碰或杠？</h4><small>先录入全部牌，再从下面点选已摆出的牌组。这里标记牌组，不会重复加牌。</small>
      <div className="meld-kind-tabs">{['吃','碰','杠','暗杠'].map(k=><button type="button" key={k} aria-pressed={meldKind===k} onClick={()=>setMeldKind(k)}>{k==='杠'?'明杠／加杠':k}</button>)}</div>
      <p>{meldKind==='吃'?'选择已吃出的三张顺子':meldKind==='碰'?'选择已碰出的三张相同牌':meldKind==='暗杠'?'选择四张相同牌；暗杠仍算门清':'选择已明杠或加杠的四张相同牌'}</p>
      <div className="meld-options">{options.map(i=><button type="button" key={i} aria-label={`标记${meldKind}：${tileName(tileCode(i))}`} onClick={()=>setMeldText(s=>s+(s?',':'')+meldKind+tileCode(i))}><HandDisplay tiles={meldTiles(meldKind,i).map(tileCode)}/><span>标记为{meldKind}</span></button>)}</div>
      {!options.length&&<small>当前牌姿没有可标记的{meldKind}牌组，请先在牌张选择区补齐对应牌张。</small>}
      <div className="recorded-melds">{recordedMelds.map((m,i)=><div key={i}><strong>{{chi:'吃',pon:'碰',kan:'明杠',ankan:'暗杠'}[m.kind]}</strong><HandDisplay tiles={meldTiles(m.kind==='chi'?'吃':m.kind==='pon'?'碰':'杠',m.tile).map(tileCode)}/><button type="button" aria-label={`取消第${i+1}组标记`} onClick={()=>setMeldText(s=>s.split(',').filter((_,j)=>j!==i).join(','))}>取消标记</button></div>)}</div>
    </div>
    <p aria-live="polite">{automatic ? result.guidance : '自动勾选已关闭，本次按当前勾选的役与符数结算。'}</p>
    {result.candidates.length>0&&<><p>所有拆法都成立：{names(result.certain)}</p>{result.possible.length>0&&<p>取决于拆法／等待：{names(result.possible)}</p>}{result.complete&&result.best&&<div className="calculator-result"><strong>{names(result.best.yaku)} · {result.best.fu} 符</strong>{!/[1-9][mpsz]/.test(result.best.groups)&&<HandDisplay tiles={props.tiles}/>}<div className="result-groups">{result.best.groups.split(' / ').map((group,i)=><div key={i}><HandDisplay tiles={group.includes('雀头') ? (group.match(/[1-9][mpsz]/g)||[]).flatMap(t=>[t,t]) : group.match(/[1-9][mpsz]/g)||[]}/><small>{group.includes('雀头')?'雀头':group.includes('暗杠')?'暗杠':group.match(/[1-9][mpsz]/)?'面子':group}</small></div>)}</div><small>{result.best.details.join('；').replace(/[1-9][mpsz]/g,tileName)}</small>{result.best.han===0&&!result.best.yakuman&&<p>牌型成立但尚无役；宝牌不能单独构成和牌。</p>}</div>}</>}
    <details><summary>不录入完整牌姿？按现场选项计算符数</summary>
      <div className="calculator-fields">
        <label>特殊处理<select value={special} onChange={e=>setSpecial(e.target.value)}><option value="normal">一般形</option><option value="seven">七对子（25符）</option><option value="pinfu">已确认平和</option><option value="skip">五番以上／役满，跳过（30符）</option></select></label>
        <label>雀头<select value={pair} onChange={e=>setPair(Number(e.target.value))}><option value={0}>普通对子 0符</option><option value={2}>白发中／自风／场风 2符</option><option value={4}>自风与场风相同 4符</option></select></label>
        <label>等待<select value={wait} onChange={e=>setWait(Number(e.target.value))}><option value={0}>两面／双碰 0符</option><option value={2}>边张／坎张／单骑 2符</option></select></label>
        {groups.map((v,i)=><label key={i}>面子 {i+1}<select value={v} onChange={e=>setGroups(a=>a.map((n,j)=>j===i?Number(e.target.value):n))}>{[[0,'顺子／无'],[2,'中张明刻'],[4,'中张暗刻／幺九明刻'],[8,'幺九暗刻／中张明杠'],[16,'中张暗杠／幺九明杠'],[32,'幺九暗杠']].map(([n,label])=><option key={n} value={n}>{label} +{n}</option>)}</select></label>)}
      </div><p>按上方{props.closed?'门清':'副露'}、{props.winType==='tsumo'?'自摸':'荣和'}计算：{manual} 符。荣和补成的刻子按明刻计符；暗杠不破门清。</p>
      <button type="button" onClick={()=>{setAutomatic(false);callback.current(props.selected,manual,undefined,{winningTile,meldText,automatic:false});}}>采用 {manual} 符（切换为手动）</button>
    </details>
  </section>;
}
