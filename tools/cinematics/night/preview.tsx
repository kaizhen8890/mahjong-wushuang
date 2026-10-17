import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExperiencePresentation, NightMode } from '../../../app/components/skill-experience';
import type { SkillExperienceEvent } from '../../../lib/skill-experience';
import { setTableSoundGain } from '../../../app/hooks/use-game-audio';
import '../witch/preview.css';
import { RemotePreview } from './remote-preview';
const settings=new URLSearchParams(location.search), restored=settings.has('restored'), hydrate=settings.has('hydrate');
const historical: SkillExperienceEvent={id:'historical-night',createdAt:Date.now(),kind:'environment',environment:'night',cardName:'暗夜之战',actorId:'p1',actorName:'玩家一',targets:[],label:'手机常显极暗操作 · 使用者光源可照任意位置'};
function Preview() {
  const [active,setActive]=useState(restored),[events,setEvents]=useState<SkillExperienceEvent[]>(restored?[historical]:[]),[context,setContext]=useState(restored?'restored-night':undefined),[phone,setPhone]=useState(settings.has('phone')),[ready,setReady]=useState(!hydrate);
  useEffect(()=>{if(hydrate){setActive(true);setEvents([historical]);setContext('hydrated-night');setReady(true);}},[]);
  const start=()=>{setContext(crypto.randomUUID());setActive(true);setEvents(e=>[...e,{...historical,id:crypto.randomUUID(),createdAt:Date.now()}]);};
  if(phone)return <RemotePreview restored={restored}/>;
  return <><nav className="preview-controls"><strong>暗夜之战 · v1.1.0-beta.5</strong><button onClick={start}>发动暗夜</button><button onClick={()=>setEvents([...events])}>重复快照</button><button onClick={()=>{setActive(false);setContext('replaced');}}>替换环境</button><button onClick={()=>{setActive(false);setContext(undefined);}}>结束环境</button><label><input type="checkbox" checked={phone} onChange={e=>setPhone(e.target.checked)}/>手机反馈</label><label><input type="checkbox" onChange={e=>setTableSoundGain(e.target.checked?0:1)}/>静音</label><output data-env-state={active?'active':'inactive'}>{active?'规则已生效':'未发动'}</output></nav>
    <main className="preview-table"><div className="preview-dial"><b>暗夜之战</b><span>日蚀降临</span><small>规则先生效，演出后熄光</small></div>{['玩家一','玩家二','玩家三','玩家四'].map((name,i)=><div className={`tablet-player-card preview-seat seat-${i}`} data-player-id={`p${i+1}`} key={name}><small>{['东','南','西','北'][i]}家</small><b>{name}</b><strong>25,000</strong></div>)}</main>
    <ExperiencePresentation events={events} dark={active} contextKey={context} phone={phone}/>
    {ready&&<NightMode active={active} events={events} effectId={context} leave={()=>{setActive(false);setContext(undefined);}}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
