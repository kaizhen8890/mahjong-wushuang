'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { assessHandInput, parseMelds, type HandContext } from '@/lib/hand-analysis';
import { MahjongTile, HandDisplay, tileName } from './mahjong-tile';
import { tileIndex, tileCode } from '@/lib/hand-analysis';
import { YAKU } from '@/lib/mahjong';
import { ManualFuPanel, blankManualFu, type ManualFuDraft } from './manual-fu-panel';
import './hand-calculator.css';

export interface HandCalculatorState { winningTile: string; meldText: string; automatic: boolean }
export interface HandCalculatorDraft { analysis: HandCalculatorState; manual: ManualFuDraft; panel: 'tiles' | 'manual'; meldKind: string }
type Props = Omit<HandContext, 'winningTile' | 'melds'> & { presentation?: 'analysis' | 'manual'; children?: ReactNode; currentFu?: number; initialDraft?: HandCalculatorDraft; onDraftChange?: (value: HandCalculatorDraft) => void; winningTileLabel?: string; initialAnalysis?: HandCalculatorState; onAnalysisChange?: (value: HandCalculatorState) => void; automaticOnly?: boolean; hideMelds?: boolean; onApply: (ids: string[], fu?: number, closed?: boolean, analysis?: {winningTile:string;meldText:string;automatic:boolean}) => void };
const names = (ids:string[]) => ids.map(id=>YAKU.find(y=>y.id===id)?.name||id).join('、') || '暂无';
export function HandCalculator(props: Props) {
  const [winningTile,setWinningTile]=useState(props.initialDraft?.analysis.winningTile ?? props.initialAnalysis?.winningTile ?? '');
  const [meldText,setMeldText]=useState(props.initialDraft?.analysis.meldText ?? props.initialAnalysis?.meldText ?? '');
  const [meldKind,setMeldKind]=useState(props.initialDraft?.meldKind ?? '吃');
  const [automatic,setAutomatic]=useState(Boolean(props.automaticOnly || (props.initialDraft?.analysis.automatic ?? props.initialAnalysis?.automatic) !== false));
  const analysisCallback=useRef(props.onAnalysisChange);
  const draftCallback=useRef(props.onDraftChange);
  useLayoutEffect(()=>{analysisCallback.current=props.onAnalysisChange;draftCallback.current=props.onDraftChange;},[props.onAnalysisChange,props.onDraftChange]);
  useEffect(()=>{analysisCallback.current?.({winningTile,meldText,automatic});},[winningTile,meldText,automatic]);
  const [manual,setManual]=useState(props.initialDraft?.manual ?? blankManualFu());
  const [panel,setPanel]=useState<'tiles'|'manual'>(props.automaticOnly ? 'tiles' : props.initialDraft?.panel ?? 'tiles');
  useEffect(()=>{draftCallback.current?.({analysis:{winningTile,meldText,automatic},manual,panel,meldKind});},[winningTile,meldText,automatic,manual,panel,meldKind]);
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
  const shownPanel=props.presentation==='analysis'?'tiles':props.presentation==='manual'?'manual':panel;
  const statusTitle=!automatic ? '当前按手动选择结算' : result.complete ? '牌姿识别完成' : result.error ? '请检查牌姿' : '等待补充牌姿';
  const guidance=automatic ? props.automaticOnly && !result.complete ? result.error || (props.tiles.length<14?`已录入 ${props.tiles.length}／14 张，请补齐本组牌。`:'请选择本组和牌张。') : result.guidance : '保留当前役种与符数；开启自动识别后，系统会根据完整牌姿更新。';
  return <section className="hand-calculator calculator-workspace">
    {!props.presentation&&<div className="calculator-heading"><div><small>役种与符数助手</small><h3>{props.automaticOnly ? '核对本组牌姿' : '选择适合现场的计算方式'}</h3></div>{props.currentFu!==undefined&&<span className="calculator-current">当前表单<strong>{props.currentFu} 符</strong></span>}</div>}
    {!props.presentation&&!props.automaticOnly&&<div className="calculator-modes" aria-label="计算方式"><button type="button" aria-pressed={panel==='tiles'} onClick={()=>setPanel('tiles')}><strong>按牌姿识别</strong><small>录牌 → 选和牌张 → 自动识别</small></button><button type="button" aria-pressed={panel==='manual'} onClick={()=>setPanel('manual')}><strong>现场算符</strong><small>看牌组 → 核对符数 → 手动采用</small></button></div>}
    {(!props.presentation||props.presentation==='analysis')&&<div className="calculator-status" data-state={automatic?result.status:'manual'} aria-live="polite"><strong>{statusTitle}</strong><span>{guidance}</span></div>}
    <div className="calculator-tiles-panel" hidden={shownPanel!=='tiles'}>
    {!props.automaticOnly&&<label className="calculator-auto" aria-label="自动采用识别结果"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/><span><strong>自动采用识别结果</strong><small>牌姿完整后，更新下方役种与符数</small></span></label>}
    {props.children}
    <div className="visual-calculator-block">
      <h4>{props.winningTileLabel??'最后和到哪张牌？'}</h4><small>{props.winningTileLabel?'用于判断等待与符数；重组后的牌按门清荣和计分。':'点选最后自摸或荣和的那张牌，用于判断等待方式。'}</small>
      <div className="tile-choice-row">{[...new Set(props.tiles)].map(t=><button type="button" key={t} aria-label={`和牌张：${tileName(t)}`} aria-pressed={winningTile===t} onClick={()=>setWinningTile(winningTile===t?'':t)}><MahjongTile tile={t}/></button>)}</div>
      {!props.tiles.length&&<p>先在牌张选择区录入麻将牌，再选最后和到的那张。</p>}
    </div>
    {!props.hideMelds&&<div className="visual-calculator-block">
      <h4>哪些牌已经吃、碰或杠？</h4><small>先录入全部牌，再从下面点选已摆出的牌组。这里标记牌组，不会重复加牌。</small>
      <div className="meld-kind-tabs">{['吃','碰','杠','暗杠'].map(k=><button type="button" key={k} aria-pressed={meldKind===k} onClick={()=>setMeldKind(k)}>{k==='杠'?'明杠／加杠':k}</button>)}</div>
      <p>{meldKind==='吃'?'选择已吃出的三张顺子':meldKind==='碰'?'选择已碰出的三张相同牌':meldKind==='暗杠'?'选择四张相同牌；暗杠仍算门清':'选择已明杠或加杠的四张相同牌'}</p>
      <div className="meld-options">{options.map(i=><button type="button" key={i} aria-label={`标记${meldKind}：${tileName(tileCode(i))}`} onClick={()=>setMeldText(s=>s+(s?',':'')+meldKind+tileCode(i))}><HandDisplay tiles={meldTiles(meldKind,i).map(tileCode)}/><span>标记为{meldKind}</span></button>)}</div>
      {!options.length&&<small>当前牌姿没有可标记的{meldKind}牌组，请先在牌张选择区补齐对应牌张。</small>}
      <div className="recorded-melds">{recordedMelds.map((m,i)=><div key={i}><strong>{{chi:'吃',pon:'碰',kan:'明杠',ankan:'暗杠'}[m.kind]}</strong><HandDisplay tiles={meldTiles(m.kind==='chi'?'吃':m.kind==='pon'?'碰':'杠',m.tile).map(tileCode)}/><button type="button" aria-label={`取消第${i+1}组标记`} onClick={()=>setMeldText(s=>s.split(',').filter((_,j)=>j!==i).join(','))}>取消标记</button></div>)}</div>
    </div>}
    {result.candidates.length>0&&<>{(!props.automaticOnly||result.possible.length>0)&&<p>所有拆法都成立：{names(result.certain)}</p>}{result.possible.length>0&&<p>取决于拆法／等待：{names(result.possible)}</p>}{result.complete&&result.best&&<div className="calculator-result"><strong>{names(result.best.yaku)} · {result.best.fu} 符</strong>{!/[1-9][mpsz]/.test(result.best.groups)&&<HandDisplay tiles={props.tiles}/>}<div className="result-groups">{result.best.groups.split(' / ').map((group,i)=><div key={i}><HandDisplay tiles={group.includes('雀头') ? (group.match(/[1-9][mpsz]/g)||[]).flatMap(t=>[t,t]) : group.match(/[1-9][mpsz]/g)||[]}/><small>{group.includes('雀头')?'雀头':group.includes('暗杠')?'暗杠':group.match(/[1-9][mpsz]/)?'面子':group}</small></div>)}</div><small>{result.best.details.join('；').replace(/[1-9][mpsz]/g,tileName)}</small>{result.best.han===0&&!result.best.yakuman&&<p>牌型成立但尚无役；宝牌不能单独构成和牌。</p>}</div>}</>}
    </div>
    {!props.automaticOnly&&shownPanel==='manual'&&<ManualFuPanel value={manual} change={setManual} closed={props.closed} tsumo={props.winType==='tsumo'} currentFu={props.currentFu} apply={value=>{setAutomatic(false);callback.current(props.selected,value,undefined,{winningTile,meldText,automatic:false});}}/>}
  </section>;
}
