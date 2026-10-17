import assert from 'node:assert/strict';
import data from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { godCardCost } from '../lib/god-card-cost';
const cards = data.cards as SkillCard[];
for (const id of [42,43,44]) {
 const game = createGameState({...DEFAULT_SETTINGS,wushuang:true});
 const actor=game.players[0].id;
 const input={cardId:id,targetPlayerIds:[game.players[1].id],duration:'match' as const,faceDown:false,activationId:'cost-'+id};
 const saved=JSON.stringify(game);
 assert.throws(()=>applyRemoteControllerCommand(game,cards,actor,{kind:'skill.activate',input}),/实体代价/);
 assert.equal(JSON.stringify(game),saved);
 const command={kind:'skill.activate' as const,input:{...input,wushuangCostConfirmed:true}};
 const next=applyRemoteControllerCommand(game,cards,actor,command).nextGame;
 assert.equal(next.effects.at(-1)?.duration,'match','User-selected duration remains unchanged');
 assert.equal(next.history.filter(e=>e.title==='神卡代价确认').length,1);
 assert.deepEqual(next.players.map(p=>p.score),game.players.map(p=>p.score));
 assert.deepEqual(next.players.map(p=>p.skillHand),game.players.map(p=>p.skillHand));
 assert.equal(applyRemoteControllerCommand(next,cards,actor,command).changed,false);
}
assert.equal(godCardCost({id:900,name:'断序杂音'}),undefined);
console.log('God cost: missing confirmation rejected without mutation, one receipt, no unknown card deduction, duration preserved and replay safe.');
