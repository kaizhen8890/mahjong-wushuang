import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExperiencePresentation } from '../../../app/components/skill-experience';
import { setTableSoundGain } from '../../../app/hooks/use-game-audio';
import { createGameState, DEFAULT_SETTINGS, type GameState, type SkillCard } from '../../../lib/mahjong';
import { applyRemoteControllerCommand } from '../../../lib/remote-command';
import { activeEnvironment } from '../../../lib/skill-experience';
import cardsData from '../../../data/skill-cards.json';
import '../witch/preview.css';
const cards=cardsData.cards as SkillCard[],settings=new URLSearchParams(location.search);
const activate=(game:GameState)=>applyRemoteControllerCommand(game,cards,game.players[0].id,{kind:'skill.activate',input:{cardId:12,targetPlayerIds:[],duration:'hand',faceDown:false,activationId:crypto.randomUUID()}}).nextGame;
function Preview() {
  const [game,setGame]=useState(()=>{const initial=createGameState({...DEFAULT_SETTINGS,wushuang:true},cards.map(c=>c.id));return settings.has('restored')?activate(initial):initial;});
  const [dark,setDark]=useState(false),[phone,setPhone]=useState(settings.has('phone'));
  const env=activeEnvironment(game);
  const confirm=()=>{if(env)setGame(applyRemoteControllerCommand(game,cards,game.players[0].id,{kind:'environment.action',effectId:env.effectId,action:'treasure',confirmed:true}).nextGame);};
  return <><nav className="preview-controls"><strong>宝箱猎人 · v1.1.0-beta.6</strong><button onClick={()=>setGame(activate(game))}>发动宝箱猎人</button><button disabled={!env||env.confirmed} onClick={confirm}>确认现实翻牌</button><button onClick={()=>setGame({...game})}>重复快照</button><button onClick={()=>setGame({...game,effects:game.effects.map(e=>({...e,state:'resolved'}))})}>替换环境</button><label><input type="checkbox" checked={phone} onChange={e=>setPhone(e.target.checked)}/>手机反馈</label><label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>暗夜</label><label><input type="checkbox" onChange={e=>setTableSoundGain(e.target.checked?0:1)}/>静音</label><output data-confirmed={Boolean(env?.confirmed)} data-env-active={Boolean(env)} data-scores={game.players.map(p=>p.score).join(',')}>{env?.confirmed?'已确认翻牌':env?'待现实翻牌':'未发动'}</output></nav>
    <main className="preview-table"><div className="preview-dial"><b>宝箱猎人</b><span>古墓解封</span><small>{env?.confirmed?'已确认翻牌':'现实翻开所有指示器'}</small></div>{game.players.map((p,i)=><div className={`tablet-player-card preview-seat seat-${i}`} data-player-id={p.id} key={p.id}><small>{['东','南','西','北'][i]}家</small><b>{p.name}</b><strong>{p.score.toLocaleString()}</strong></div>)}</main>
    <ExperiencePresentation events={game.experienceEvents} phone={phone} dark={dark} contextKey={env?.effectId}/></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
