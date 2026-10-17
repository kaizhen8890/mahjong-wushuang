import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExperiencePresentation } from '../../../app/components/skill-experience';
import type { SkillExperienceEvent } from '../../../lib/skill-experience';
import { setTableSoundGain } from '../../../app/hooks/use-game-audio';
import './preview.css';
const old: SkillExperienceEvent = { id: 'historical', createdAt: Date.now(), kind: 'environment', environment: 'witch', cardName: '魔女审判', actorId: 'p1', actorName: '玩家一', targets: [], label: '碰牌后，可审判一名未和牌敌方玩家' };
function Preview() {
  const [events,setEvents]=useState([old]), [target,setTarget]=useState('p2'), [dark,setDark]=useState(false), [phone,setPhone]=useState(false), [context,setContext]=useState('witch');
  const play=(kind:'environment'|'judgement')=>setEvents(e=>[...e,{...old,id:crypto.randomUUID(),createdAt:Date.now(),kind,targets:kind==='judgement'?[target]:[],label:kind==='judgement'?`${names[Number(target.slice(1))-1]} · 退出本局`:old.label}]);
  const names=['玩家一','玩家二','玩家三','玩家四'];
  return <><nav className="preview-controls"><strong>魔女审判 · v1.1.0-beta.1</strong><button onClick={()=>play('environment')}>播放开场</button><select aria-label="审判目标" value={target} onChange={e=>setTarget(e.target.value)}>{names.map((n,i)=><option key={n} value={`p${i+1}`}>{n}</option>)}</select><button onClick={()=>play('judgement')}>审判目标</button><button onClick={()=>setEvents([...events])}>重复快照</button><button onClick={()=>setContext(c=>c==='witch'?'new-environment':'witch')}>替换环境</button><label><input type="checkbox" checked={phone} onChange={e=>setPhone(e.target.checked)}/>手机反馈</label><label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>暗夜</label><label><input type="checkbox" onChange={e=>setTableSoundGain(e.target.checked?0:1)}/>静音</label></nav>
    <main className="preview-table"><div className="preview-dial"><b>魔女审判</b><span>环境演出预览</span><small>审判落点跟随各方向的真实名牌边界</small></div>{names.map((name,i)=><div className={`tablet-player-card preview-seat seat-${i}`} data-player-id={`p${i+1}`} key={name}><small>{['东','南','西','北'][i]}家</small><b>{name}</b><strong>25,000</strong></div>)}</main>
    <ExperiencePresentation events={events} phone={phone} dark={dark} contextKey={context}/></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
