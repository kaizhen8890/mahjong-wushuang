import React, { useState } from 'react';
import { RemoteController } from '../../../app/components/remote-controller';
import { createGameState, DEFAULT_SETTINGS, type GameState, type SkillCard } from '../../../lib/mahjong';
import { applyRemoteControllerCommand } from '../../../lib/remote-command';
import { createControllerSnapshot } from '../../../lib/controller-snapshot';
import { activeEnvironment } from '../../../lib/skill-experience';
import cardsData from '../../../data/skill-cards.json';
const cards=cardsData.cards as SkillCard[];
const activate=(game:GameState)=>applyRemoteControllerCommand(game,cards,game.players[0].id,{kind:'skill.activate',input:{cardId:10,targetPlayerIds:[],duration:'hand',faceDown:false,activationId:crypto.randomUUID()}}).nextGame;
export function RemotePreview({ restored }: { restored: boolean }) {
  const [game,setGame]=useState(()=>{const state=createGameState({...DEFAULT_SETTINGS,wushuang:true},cards.map(c=>c.id));return restored?activate(state):state;});
  const [commands,setCommands]=useState<string[]>([]),[revision,setRevision]=useState(1);
  const active=activeEnvironment(game)?.kind==='night';
  const snapshot=createControllerSnapshot(game,cards,{roomId:'night-test',matchId:'match',handId:'hand',revision,playerId:game.players[0].id});
  return <div className="night-phone-preview"><link rel="stylesheet" href="/globals.css"/>
    <nav className="preview-controls"><button onClick={()=>setGame(activate(game))}>发动暗夜</button><button onClick={()=>setRevision(n=>n+1)}>重复快照</button><button onClick={()=>setGame({...game,effects:game.effects.map(e=>({...e,state:'resolved'}))})}>结束环境</button>
      <output data-env-state={active?'active':'inactive'} data-wall={game.wallCount} data-remote-commands={commands.join(',')}>{active?'暗夜生效':'正常显示'}</output></nav>
    <RemoteController connectionState="connected" snapshot={snapshot} discoveredRooms={[]} skillCards={cards} joinRoom={()=>{}} refreshRooms={()=>{}} acknowledgeNotification={()=>{}} disconnect={()=>{}} backToMode={()=>{}}
      sendCommand={command=>{const result=applyRemoteControllerCommand(game,cards,game.players[0].id,command);setGame(result.nextGame);setRevision(n=>n+1);setCommands(values=>[...values,command.kind]);}}/>
  </div>;
}
