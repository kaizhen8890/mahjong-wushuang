import assert from 'node:assert/strict';
import { createGameState } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { assessHandInput } from '../lib/hand-analysis';
import type { RemoteWinDraft } from '../lib/lan-protocol';

const game=createGameState();
const actor=game.players[0],loser=game.players[1];
const tiles=(s:string)=>[...s.matchAll(/([0-9]+)([mpsz])/g)].flatMap(m=>m[1].split('').map(n=>n+m[2]));
const draft:RemoteWinDraft={
  winType:'ron',loserPlayerId:loser.id,tiles:tiles('23455m'),closed:false,fu:40,
  selectedYakuIds:['toitoi','chinitsu'],yakuOverrides:{},
  dora:0,uraDora:0,akaDora:0,flowerDora:0,bonusHan:0,extraPoints:0,
  analysis:{automatic:true,winningTile:'5m',meldText:''},
};
const commit=(d:RemoteWinDraft)=>applyRemoteControllerCommand(game,[],actor.id,{kind:'win.commit',draft:d});
// Reproduce the phone screenshot: partial 5-tile record + manually chosen 7 han 40 fu.
const automatic=commit(draft);
const manual=commit({...draft,analysis:{...draft.analysis!,automatic:false}});
assert.deepEqual(automatic.nextGame.players.map(p=>p.score),manual.nextGame.players.map(p=>p.score));
assert.equal(automatic.nextGame.players[0].score,actor.score+18000);
assert.equal(automatic.nextGame.players[1].score,loser.score-18000);
assert.equal(automatic.changed,true);
assert.equal(draft.selectedYakuIds.join(','),'toitoi,chinitsu');
// Full hands still get recomputed on the tablet rather than trusting the submitted fu/yaku.
const full:RemoteWinDraft={...draft,closed:true,tiles:tiles('123m12355p456789s'),fu:110,selectedYakuIds:['toitoi'],analysis:{automatic:true,winningTile:'6s',meldText:''}};
const scored=commit(full);
assert.equal(scored.nextGame.players[0].score,actor.score+1500); // pinfu 1 han 30 fu, dealer ron
const pending=assessHandInput({tiles:draft.tiles,winningTile:'5m',meldText:'',closed:false,winType:'ron',seatWind:'东',roundWind:'东',selected:draft.selectedYakuIds,bonusHan:0});
assert.equal(pending.status,'pending');
assert.equal(pending.best,undefined);
// Missing winning tile remains an optional record, and never erases manually confirmed values.
const unknown={...full,selectedYakuIds:['pinfu'],fu:30,analysis:{automatic:true,winningTile:'',meldText:''}};
assert.equal(commit(unknown).nextGame.players[0].score,actor.score+1500);
// Complete but impossible hands still fail automatic validation.
assert.throws(()=>commit({...full,tiles:tiles('112233m147p258s55z'),analysis:{automatic:true,winningTile:'5z',meldText:''}}),/无法拆成完整和牌/);
// A kan requires 15 physical tiles and keeps its automatic fu computation.
const kan={...full,tiles:tiles('1111m234p567789s55z'),selectedYakuIds:['riichi'],analysis:{automatic:true,winningTile:'9s',meldText:'暗杠1m'}};
assert.equal(commit(kan).preview?.label,'1 番 70 符');
assert.equal(commit({...draft,tiles:[]}).nextGame.players[0].score,actor.score+18000);
console.log('Remote win regressions passed: partial/manual parity, host recalculation, missing info, invalid hand, kan and empty record.');
