import assert from 'node:assert/strict';
import { PerspectiveCamera, Matrix4, Vector3, Vector4 } from 'three';
import {centerProjection,CENTER_HALF,CENTER_HEIGHT,CENTER_PIXELS} from '../app/components/virtual-mahjong/three/center-projection';
import {createTableScenario} from './helpers/virtual-table-scenarios';
import {tableClock} from '../lib/virtual-mahjong/table-clock';
import {readRoomSnapshot} from '../lib/virtual-mahjong/room-wire';
for(const [w,h] of [[844,390],[780,360],[390,844],[1920,1080]]) {
 const camera=new PerspectiveCamera(38,w/h,.1,500);camera.position.set(0,30,32);camera.lookAt(0,0,1.5);camera.updateMatrixWorld(true);
 const matrix=new Matrix4().fromArray(centerProjection(camera,w,h));
 for(const [x,y] of [[0,0],[300,0],[0,300],[300,300],[150,150]]) {
  const actual=new Vector4(x,y,0,1).applyMatrix4(matrix);
  const expected=new Vector3(-CENTER_HALF+x/CENTER_PIXELS*CENTER_HALF*2,CENTER_HEIGHT,-CENTER_HALF+y/CENTER_PIXELS*CENTER_HALF*2).project(camera);
  assert(Math.abs(actual.x/actual.w-(expected.x+1)*w/2)<1e-8);
  assert(Math.abs(actual.y/actual.w-(1-expected.y)*h/2)<1e-8);
 }
}
const h=createTableScenario('chi'),v=h.view();
assert.deepEqual(tableClock(v,h.now),{total:35,fixed:5,extra:30});
assert.deepEqual(tableClock(v,h.now+6000),{total:29,fixed:0,extra:29});
assert.deepEqual(tableClock(v,h.now+36000),{total:0,fixed:0,extra:0});
const snapshot={revision:1,configurationRevision:1,hostPlayerId:'a',serverNow:h.now,rules:v.rules,seats:v.players.map(p=>({playerId:p.id,name:p.name,seat:p.seat,connected:true,ready:true})),game:v};
assert.deepEqual(readRoomSnapshot(snapshot,h.viewerId),snapshot);
const foreign=structuredClone(snapshot);foreign.game.players.find(p=>p.id!==h.viewerId)!.furiten=true;
assert.throws(()=>readRoomSnapshot(foreign,h.viewerId),/HIDDEN_HAND/);
const malformed=structuredClone(snapshot);malformed.game.phase.responseClock!.bankMs++;
assert.throws(()=>readRoomSnapshot(malformed,h.viewerId));
const spectator=h.engine.view({role:'spectator'});
assert(spectator.players.every(p=>p.furiten===undefined));assert.equal(spectator.phase.responseClock,undefined);
console.log('PASS checkpoint17: perspective corners at 4 aspect ratios, 5+30 countdown, private furiten/response clock and wire rejection');
