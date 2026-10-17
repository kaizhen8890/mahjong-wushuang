import { LAN_PROTOCOL_VERSION } from '../lib/lan-protocol';
import assert from 'node:assert/strict';
import { createGameState } from '../lib/mahjong';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { createCommandRequest, parseClientMessage, serializeWireMessage, parseServerMessage } from '../lib/lan-protocol';
import { applyRemoteControllerCommand } from '../lib/remote-command';
const game = createGameState();
const player = game.players[0];
const context = {roomId:'room',matchId:'match',handId:'hand',revision:1,playerId:player.id};
const snapshot = createControllerSnapshot(game,[],context);
const tiles = '11122233344455'.split('').map(n=>n+'m');
const draft = {winType:'ron' as const,loserPlayerId:game.players[1].id,tiles,closed:true,fu:50,
 selectedYakuIds:['chinitsu','toitoi','sanankou'],yakuOverrides:{},dora:0,uraDora:0,akaDora:0,flowerDora:0,bonusHan:0,extraPoints:0,
 analysis:{winningTile:'4m',meldText:'',automatic:true}};
const direct = applyRemoteControllerCommand(game,[],player.id,{kind:'win.commit',draft});
const request = createCommandRequest(snapshot,{kind:'win.commit',draft});
const parsed = parseClientMessage(serializeWireMessage(request));
assert.ok(parsed.ok,JSON.stringify(parsed));
if (!parsed.ok || parsed.value.type !== 'command.request') throw Error('No command');
assert.deepEqual(parsed.value.command.kind === 'win.commit' && parsed.value.command.draft.tiles,tiles);
const transmitted = applyRemoteControllerCommand(game,[],player.id,parsed.value.command);
assert.deepEqual(transmitted.nextGame.players.map(p=>p.score),direct.nextGame.players.map(p=>p.score));
assert.deepEqual(transmitted.nextGame.presentations![0].tiles,tiles);
const received = createControllerSnapshot(transmitted.nextGame,[],context);
const roundtrip = parseServerMessage(serializeWireMessage({protocol: LAN_PROTOCOL_VERSION,type:'state.snapshot',roomId:'room',sentAt:Date.now(),snapshot:received}));
assert.ok(roundtrip.ok);
if(roundtrip.ok && roundtrip.value.type==='state.snapshot')assert.deepEqual(roundtrip.value.snapshot.presentations![0].tiles,tiles);
// Every suit, red fives, partial records and empty records retain multiplicity.
for(const tiles of [[],['0m','0m','5m','5m'],['7z','7z','7z','2p','2p','3s','3s']]){
 const parsed=parseClientMessage(serializeWireMessage(createCommandRequest(snapshot,{kind:'win.preview',draft:{...draft,tiles}})));
 assert.ok(parsed.ok);
 if(parsed.ok&&parsed.value.type==='command.request'&&parsed.value.command.kind==='win.preview')assert.deepEqual(parsed.value.command.draft.tiles,tiles);
 const withTiles={...received,presentations:received.presentations!.map(p=>({...p,tiles}))};
 const shown=parseServerMessage(serializeWireMessage({protocol: LAN_PROTOCOL_VERSION,type:'state.snapshot',roomId:'room',sentAt:Date.now(),snapshot:withTiles}));
 assert.ok(shown.ok);
 if(shown.ok&&shown.value.type==='state.snapshot')assert.deepEqual(shown.value.snapshot.presentations![0].tiles,tiles);
}
console.log('Wire regression: all 14 duplicate tiles survive phone -> host -> animation; scores match direct input.');
