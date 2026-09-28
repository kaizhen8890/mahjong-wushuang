import { YAKU, WINDS, scoreBase, type Wind } from './mahjong';

export interface Meld { kind: 'chi' | 'pon' | 'kan' | 'ankan'; tile: number }
export interface HandContext {
  tiles: string[]; winningTile: string; melds: Meld[]; closed: boolean;
  winType: 'ron' | 'tsumo'; seatWind: Wind; roundWind: Wind;
  selected: string[]; bonusHan: number; overrides?: Record<string, number>;
  openTanyao?: boolean; kiriage?: boolean; kazoe?: boolean;
}
export interface HandCandidate { yaku: string[]; fu: number; details: string[]; groups: string; han: number; yakuman: number; points: number }
export interface HandAnalysis { error?: string; candidates: HandCandidate[]; certain: string[]; possible: string[]; best?: HandCandidate; complete: boolean }
export type HandAssistance = HandAnalysis & { status: 'pending' | 'ready' | 'invalid'; guidance: string };

/** Optional tile records must not turn manual scoring into a mandatory full-hand entry. */
export function assessHandInput(c: Omit<HandContext, 'melds'> & { meldText: string }): HandAssistance {
  const pending = (guidance: string): HandAssistance => ({status:'pending',guidance,candidates:[],certain:[],possible:[],complete:false});
  if (!c.tiles.length) return pending('未录入牌姿，本次按当前勾选的役与符数结算。');
  let melds: Meld[];
  try { melds = parseMelds(c.meldText); }
  catch (error) { const message=error instanceof Error?error.message:'副露输入错误';return {status:'invalid',guidance:message,error:message,candidates:[],certain:[],possible:[],complete:false}; }
  const expected = 14 + melds.filter(m=>m.kind.includes('kan')).length;
  if (c.tiles.length < expected) return pending(`已记录 ${c.tiles.length}／${expected} 张；尚不足以自动识别。本次按当前勾选的役与符数结算，也可补全牌姿后自动计算。`);
  if (!c.closed && !melds.some(m=>m.kind!=='ankan')) return pending('尚未标明吃、碰、明杠，本次按当前勾选的役与符数结算。');
  const result=analyzeHand({...c,melds});
  if (result.error) return {...result,status:'invalid',guidance:result.error};
  if (!result.complete) return {...result,status:'pending',guidance:'尚未选择最后和到的牌，本次按当前勾选的役与符数结算；下列可能役仅供参考。'};
  return {...result,status:'ready',guidance:`已找到 ${result.candidates.length} 个合法拆分／等待方案，采用最高得点方案。`};
}
const CONTEXT = new Set(['riichi', 'double-riichi', 'ippatsu', 'haitei', 'houtei', 'rinshan', 'chankan', 'tenhou', 'chiihou']);
export const STRUCTURAL_YAKU = new Set(YAKU.filter(y => !CONTEXT.has(y.id)).map(y => y.id));
export function tileIndex(tile: string) { if (!/^(?:[0-9][mps]|[1-7]z)$/.test(tile)) return -1; const s = 'mpsz'.indexOf(tile.slice(-1)); const n = Number(tile[0]) || 5; return s < 0 || n < 1 || n > (s === 3 ? 7 : 9) ? -1 : s * 9 + n - 1; }
export function tileCode(i: number) { return `${i % 9 + 1}${'mpsz'[Math.floor(i / 9)]}`; }
const terminal = (i: number) => i >= 27 || i % 9 === 0 || i % 9 === 8;
const tilesOf = (m: Meld) => m.kind === 'chi' ? [m.tile, m.tile + 1, m.tile + 2] : Array(m.kind.includes('kan') ? 4 : 3).fill(m.tile) as number[];
const groupText = (m: Meld) => `${tilesOf(m).map(tileCode).join(' ')}${m.kind === 'ankan' ? '（暗杠）' : ''}`;
export function parseMelds(text: string): Meld[] {
  if (!text.trim()) return [];
  return text.trim().split(/[,，;；\n]+/).map(raw => {
    const value = raw.trim(); const match = /^(吃|碰|杠|暗杠)\s*([1-9][mpsz])$/.exec(value);
    if (!match) throw Error('副露请按“吃1m,碰5z,暗杠9s”填写；吃填写顺子的第一张。');
    const tile = tileIndex(match[2]); const kind = ({ 吃: 'chi', 碰: 'pon', 杠: 'kan', 暗杠: 'ankan' } as const)[match[1] as '吃'];
    if (tile < 0 || (kind === 'chi' && (tile >= 27 || tile % 9 > 6))) throw Error('副露牌组不合法');
    return { kind, tile };
  });
}

export function analyzeHand(c: HandContext): HandAnalysis {
  const fail = (error: string): HandAnalysis => ({ error, candidates: [], certain: [], possible: [], complete: false });
  const counts = Array<number>(34).fill(0);
  for (const t of c.tiles) { const i = tileIndex(t); if (i < 0) return fail('存在无效牌张'); counts[i]++; }
  if (counts.some(n => n > 4)) return fail('同一种牌最多四张（赤五与普通五合并计算）');
  if (c.melds.length > 4) return fail('最多四组副露／杠');
  const kans = c.melds.filter(m => m.kind.includes('kan')).length;
  if (c.tiles.length !== 14 + kans) return fail(`请录入全部 ${14 + kans} 张牌，包含副露与杠牌；目前 ${c.tiles.length} 张。`);
  const concealed = [...counts];
  for (const m of c.melds) for (const t of tilesOf(m)) if (--concealed[t] < 0) return fail('副露／杠中的牌没有完整录入牌姿');
  const closed = !c.melds.some(m => m.kind !== 'ankan') && c.closed;
  if (!closed && !c.melds.some(m => m.kind !== 'ankan')) return fail('副露状态需要标明吃、碰、明杠，才能准确判断暗刻与符数。');
  const win = c.winningTile ? tileIndex(c.winningTile) : -1;
  if (c.winningTile && (win < 0 || concealed[win] < 1)) return fail('和牌张必须来自未副露的手牌');
  const used = counts.flatMap((n,i) => n ? [i] : []);
  const contextual = c.selected.filter(id => CONTEXT.has(id)).filter(id => {
    if (['riichi','double-riichi','ippatsu'].includes(id) && !closed) return false;
    if (id === 'ippatsu' && !c.selected.some(x => ['riichi','double-riichi'].includes(x))) return false;
    if (['haitei','rinshan','tenhou','chiihou'].includes(id) && c.winType !== 'tsumo') return false;
    if (['houtei','chankan'].includes(id) && c.winType !== 'ron') return false;
    if (id === 'tenhou' && c.seatWind !== '东') return false;
    if (id === 'chiihou' && c.seatWind === '东') return false;
    if (['tenhou','chiihou'].includes(id) && c.melds.length) return false;
    return !(id === 'riichi' && c.selected.includes('double-riichi'));
  });
  const candidates: HandCandidate[] = [];
  function emit(ids: string[], fu: number, details: string[], groups: string) {
    ids = [...new Set([...contextual, ...ids, ...(closed && c.winType === 'tsumo' ? ['menzen-tsumo'] : [])])];
    const yakuman = ids.reduce((s,id) => s + (YAKU.find(y=>y.id===id)?.yakuman || 0),0);
    if (yakuman) ids = ids.filter(id => YAKU.find(y=>y.id===id)?.yakuman);
    const han = ids.reduce((s,id)=> { const y=YAKU.find(y=>y.id===id); return s + (y && !y.yakuman ? c.overrides?.[id] ?? (closed ? y.closedHan : y.openHan) : 0); },0);
    const base = han || yakuman ? scoreBase(han+c.bonusHan,fu,yakuman,Boolean(c.kiriage),c.kazoe !== false).base : 0;
    const ceil = (n:number)=>Math.ceil(n/100)*100;
    const points = c.winType === 'ron' ? ceil(base*(c.seatWind==='东'?6:4)) : c.seatWind==='东' ? ceil(base*2)*3 : ceil(base*2)+ceil(base)*2;
    candidates.push({yaku:ids,fu,details,groups,han,yakuman,points});
  }
  function common(): string[] {
    const ids: string[] = [];
    if (used.every(t=>!terminal(t)) && (closed || c.openTanyao !== false)) ids.push('tanyao');
    const suits = new Set(used.filter(t=>t<27).map(t=>Math.floor(t/9)));
    if (suits.size===1) ids.push(used.some(t=>t>=27)?'honitsu':'chinitsu');
    if (used.every(terminal)) ids.push(used.every(t=>t>=27)?'tsuuiisou':used.every(t=>t<27)?'chinroutou':'honroutou');
    if (used.every(t=>[19,20,21,23,25,32].includes(t))) ids.push('ryuuiisou');
    return ids;
  }
  if (!c.melds.length && closed) {
    if (used.length===13 && used.every(terminal) && used.every(t=>counts[t]>=1)) {
      const wins = win>=0 ? [win] : used;
      for (const w of wins) emit([counts[w]===2?'kokushi-13':'kokushi'],30,['国士无双不计符'], '十三种幺九牌＋雀头');
    }
    if (used.length===7 && used.every(t=>counts[t]===2)) emit([...common(),'chiitoi'],25,['七对子固定 25 符，不进位'], '七组不同对子');
  }
  function evaluate(pair: number, groups: Meld[], winningGroup: number, unknownWin?: number) {
    const all = [...groups,...c.melds]; const ids=common(); const seq=all.filter(m=>m.kind==='chi'); const trips=all.filter(m=>m.kind!=='chi');
    const w=win>=0?win:unknownWin ?? pair;
    const wg=winningGroup>=0?groups[winningGroup]:null;
    const wait= !wg ? '单骑' : wg.kind!=='chi' ? '双碰' : w===wg.tile+1 ? '坎张' : (wg.tile%9===0&&w===wg.tile+2)||(wg.tile%9===6&&w===wg.tile) ? '边张' : '两面';
    const seat=27+WINDS.indexOf(c.seatWind), round=27+WINDS.indexOf(c.roundWind);
    const pairFu=(pair>=31?2:0)+(pair===seat?2:0)+(pair===round?2:0);
    for (const [t,id] of [[seat,'seat-wind'],[round,'round-wind'],[31,'haku'],[32,'hatsu'],[33,'chun']] as const) if(trips.some(m=>m.tile===t))ids.push(id);
    if (closed && seq.length===4 && pairFu===0 && wait==='两面') ids.push('pinfu');
    const seqCounts=new Map<number,number>(); for(const m of seq)seqCounts.set(m.tile,(seqCounts.get(m.tile)||0)+1);
    const duplicates=[...seqCounts.values()].reduce((s,n)=>s+Math.floor(n/2),0);
    if(closed&&duplicates)ids.push(duplicates>=2?'ryanpeikou':'iipeikou');
    if(!seq.length)ids.push('toitoi');
    const hiddenTrips=groups.filter((m,i)=>m.kind!=='chi' && !(c.winType==='ron'&&i===winningGroup)).length+c.melds.filter(m=>m.kind==='ankan').length;
    if(hiddenTrips>=3)ids.push(hiddenTrips===4?(wait==='单骑'?'suuankou-tanki':'suuankou'):'sanankou');
    if(kans>=3)ids.push(kans===4?'suukantsu':'sankantsu');
    for(let n=0;n<9;n++)if([0,9,18].every(s=>trips.some(m=>m.tile===s+n)))ids.push('sanshoku-doukou');
    for(let n=0;n<7;n++)if([0,9,18].every(s=>seq.some(m=>m.tile===s+n)))ids.push('sanshoku');
    for(const s of [0,9,18])if([0,3,6].every(n=>seq.some(m=>m.tile===s+n)))ids.push('ittsu');
    if(seq.length&&terminal(pair)&&all.every(m=>m.kind==='chi'?[0,6].includes(m.tile%9):terminal(m.tile)))ids.push(used.some(t=>t>=27)?'chanta':'junchan');
    const dragons=trips.filter(m=>m.tile>=31).length;
    if(dragons===3)ids.push('daisangen'); else if(dragons===2&&pair>=31)ids.push('shousangen');
    const winds=trips.filter(m=>m.tile>=27&&m.tile<=30).length;
    if(winds===4)ids.push('daisuushi'); else if(winds===3&&pair>=27&&pair<=30)ids.push('shousuushi');
    if(closed&&!c.melds.length&&used.every(t=>t<27&&Math.floor(t/9)===Math.floor(used[0]/9))) {
      const s=Math.floor(used[0]/9)*9; const base=[3,1,1,1,1,1,1,1,3];
      if(base.every((n,i)=>counts[s+i]>=n)) ids.push(base.every((n,i)=>counts[s+i]-(s+i===w?1:0)===n)?'junsei-chuuren':'chuuren');
    }
    const details=['底符 20']; let fu=20;
    if(closed&&c.winType==='ron'){fu+=10;details.push('门清荣和 +10');}
    if(pairFu){fu+=pairFu;details.push(`役牌雀头 +${pairFu}`);}
    if(['单骑','坎张','边张'].includes(wait)){fu+=2;details.push(`${wait} +2`);}
    else details.push(`${wait}等待 +0`);
    all.forEach((m,i)=>{if(m.kind==='chi')return;const hidden=i<groups.length?!(c.winType==='ron'&&i===winningGroup):m.kind==='ankan';const n=(m.kind.includes('kan')?8:2)*(hidden?2:1)*(terminal(m.tile)?2:1);fu+=n;details.push(`${tileCode(m.tile)} ${hidden?'暗':'明'}${m.kind.includes('kan')?'杠':'刻'} +${n}`);});
    if(c.winType==='tsumo'){fu+=2;details.push('自摸 +2');}
    if(ids.includes('pinfu')&&c.winType==='tsumo'){fu=20;details.splice(0,details.length,'平和自摸固定 20 符');}
    else {const raw=fu;fu=Math.max(30,Math.ceil(fu/10)*10);details.push(`${raw} → ${fu} 符`);}
    emit(ids,fu,details,`${all.map(groupText).join(' / ')} / 雀头 ${tileCode(pair)} / ${wait}`);
  }
  function split(left:number[], groups:Meld[],pair:number) {
    const i=left.findIndex(n=>n>0);
    if(i<0){if(groups.length+c.melds.length!==4)return;
      if(win<0){evaluate(pair,groups,-1);groups.forEach((m,j)=>{for(const t of tilesOf(m))evaluate(pair,groups,j,t);});}
      else {if(pair===win)evaluate(pair,groups,-1);groups.forEach((m,j)=>{if(tilesOf(m).includes(win))evaluate(pair,groups,j);});}return;}
    if(groups.length+c.melds.length>=4)return;
    if(left[i]>=3){left[i]-=3;split(left,[...groups,{kind:'pon',tile:i}],pair);left[i]+=3;}
    if(i<27&&i%9<7&&left[i+1]&&left[i+2]){left[i]--;left[i+1]--;left[i+2]--;split(left,[...groups,{kind:'chi',tile:i}],pair);left[i]++;left[i+1]++;left[i+2]++;}
  }
  for(let p=0;p<34;p++)if(concealed[p]>=2){concealed[p]-=2;split(concealed,[],p);concealed[p]+=2;}
  if(!candidates.length)return fail('这些牌无法拆成完整和牌：四面子一雀头、七对子或国士无双。不会自动勾选局部组合。');
  candidates.sort((a,b)=>b.points-a.points||b.han-a.han||b.fu-a.fu);
  const certain=candidates[0].yaku.filter(id=>candidates.every(v=>v.yaku.includes(id)));
  const possible=[...new Set(candidates.flatMap(v=>v.yaku))].filter(id=>!certain.includes(id));
  return {candidates,certain,possible,best:candidates[0],complete:win>=0};
}

export function manualFu(closed:boolean,tsumo:boolean,pair:number,wait:number,groups:number[],special:string) {
  if(special==='seven')return 25;
  if(special==='pinfu')return tsumo?20:30;
  if(special==='skip')return 30;
  return Math.max(30,Math.ceil((20+(closed&&!tsumo?10:0)+(tsumo?2:0)+pair+wait+groups.reduce((a,b)=>a+b,0))/10)*10);
}
