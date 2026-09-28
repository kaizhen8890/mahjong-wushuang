import assert from 'node:assert/strict';
import {canAnimateTable,motionProgress,MOTION_MS} from '../app/components/virtual-mahjong/three/motion';
import {layoutTable} from '../app/components/virtual-mahjong/three/table-layout';
import {relativeSeat} from '../lib/virtual-mahjong/table-view';
import {createTableScenario} from './helpers/virtual-table-scenarios';
import {extendedTableLayout} from './helpers/virtual-table-layout';
const before=createTableScenario('chi').view(),after={...before,revision:before.revision+1};
assert(canAnimateTable(before,after,true,false));
for(const next of [before,{...after,revision:before.revision+3},{...after,roundId:'new'},{...after,viewerId:'other'},{...after,turnId:before.turnId+3}])assert(!canAnimateTable(before,next,true,false));
assert(!canAnimateTable(before,after,false,false));assert(!canAnimateTable(before,after,true,true));
assert.equal(motionProgress(-1,200),0);assert.equal(motionProgress(999,200),1);assert(motionProgress(100,200)>0.5);assert(Math.max(MOTION_MS.draw,MOTION_MS.discard,MOTION_MS.meld)<=240);
assert(MOTION_MS.deal + 330 < 1000);
for(const count of [1,2,3,4]) for(const kind of ['ankan','daiminkan'] as const) {
 const view=extendedTableLayout('multi');const own=view.players.find(p=>p.id===view.viewerId)!;
 for(const p of view.players){p.melds=p.melds.slice(0,count).map((m,i)=>({...m,kind,tiles:Array.from({length:4},(_,n)=>({...m.tiles[0],id:3000+p.seat*100+i*4+n})),addedTileId:null,calledTileId:kind==='ankan'?null:3000+p.seat*100+i*4,sourcePlayerId:kind==='ankan'?null:view.players.find(q=>q.id!==p.id)!.id}));p.handCount=14-3*count;}
 const layout=layoutTable(view,{selected:null,legal:[],riichi:false,highlight:null});
 for(const p of view.players.filter(p=>p.id!==own.id)) {
  const seat=relativeSeat(p.seat,own.seat,view.players.length),angle=seat*Math.PI/2;
  const melds=layout.filter(t=>p.melds.some(m=>t.key.startsWith(`meld:${m.id}:`)));
  const left=Math.min(...melds.map(t=>t.x*Math.cos(angle)-t.z*Math.sin(angle)-(t.sideways?1.4:1)/2));
  const right=-10.5+(p.handCount-1)*1.06+0.5;
  assert(left>right+0.25,`${kind},${count} melds, seat${seat}: ${left}/${right}`);
 }
}
console.log('PASS motion gating/interpolation and 3 opponents: 1–4 kans never overlap concealed hands');
