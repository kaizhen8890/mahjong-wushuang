import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExperiencePresentation } from '../../../app/components/skill-experience';
import type { SkillExperienceEvent } from '../../../lib/skill-experience';
import { setTableSoundGain } from '../../../app/hooks/use-game-audio';
import '../witch/preview.css';
const old: SkillExperienceEvent = { id:'historical',createdAt:Date.now(),kind:'environment',environment:'number',cardName:'偶氮玉红',actorId:'p1',actorName:'玩家一',targets:[],label:'数字 5 · 每两张追加一宝牌' };
function Preview() {
  const [events,setEvents]=useState([old]),[number,setNumber]=useState(5),[dark,setDark]=useState(false),[phone,setPhone]=useState(false),[context,setContext]=useState(0);
  const play=()=>setEvents(e=>[...e,{...old,id:crypto.randomUUID(),createdAt:Date.now(),label:`数字 ${number} · 每两张追加一宝牌`}]);
  return <><nav className="preview-controls"><strong>偶氮玉红 · v1.1.0-beta.4</strong><select aria-label="声明数字" value={number} onChange={e=>setNumber(Number(e.target.value))}>{Array.from({length:9},(_,i)=><option key={i+1}>{i+1}</option>)}</select><button onClick={play}>播放演出</button><button onClick={()=>setEvents([...events])}>重复快照</button><button onClick={()=>setContext(c=>c+1)}>替换环境</button><label><input type="checkbox" checked={phone} onChange={e=>setPhone(e.target.checked)}/>手机反馈</label><label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>暗夜</label><label><input type="checkbox" onChange={e=>setTableSoundGain(e.target.checked?0:1)}/>静音</label></nav>
    <main className="preview-table"><div className="preview-dial"><b>偶氮玉红</b><span>赤染炼成</span><small>本局声明数字 {number}</small></div>{['玩家一','玩家二','玩家三','玩家四'].map((n,i)=><div className={`tablet-player-card preview-seat seat-${i}`} data-player-id={`p${i+1}`} key={n}><small>{['东','南','西','北'][i]}家</small><b>{n}</b><strong>25,000</strong></div>)}</main>
    <ExperiencePresentation events={events} phone={phone} dark={dark} contextKey={`${context}`} /></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
