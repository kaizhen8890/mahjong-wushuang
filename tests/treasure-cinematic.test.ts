import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import cardsData from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { activeEnvironment } from '../lib/skill-experience';
import { isTreasureCinematic, treasureConfirmed, treasureFilm } from '../lib/treasure-cinematic';

const cards=cardsData.cards as SkillCard[],initial=createGameState({...DEFAULT_SETTINGS,wushuang:true},cards.map(c=>c.id));
const actor=initial.players[0].id,other=initial.players[1].id;
const activated=applyRemoteControllerCommand(initial,cards,actor,{kind:'skill.activate',input:{cardId:12,targetPlayerIds:[],duration:'hand',faceDown:false,activationId:'treasure-film-test'}}).nextGame;
const env=activeEnvironment(activated)!,intro=activated.experienceEvents!.at(-1)!;
assert.ok(isTreasureCinematic(intro));assert.equal(treasureConfirmed(intro),false);assert.equal(env.kind,'treasure');assert.ok(!env.confirmed);
assert.deepEqual(activated.players.map(p=>p.score),initial.players.map(p=>p.score),'The film does not award the pictured coins');
assert.equal(activated.wallCount,initial.wallCount,'There is no automatic real-world tile operation');
const action={kind:'environment.action' as const,effectId:env.effectId,action:'treasure' as const,confirmed:true};
assert.throws(()=>applyRemoteControllerCommand(activated,cards,other,action),'Only the environment owner can confirm remotely');
assert.throws(()=>applyRemoteControllerCommand(activated,cards,actor,{...action,confirmed:false}));
const revealed=applyRemoteControllerCommand(activated,cards,actor,action).nextGame,confirmation=revealed.experienceEvents!.at(-1)!;
assert.ok(isTreasureCinematic(confirmation));assert.ok(treasureConfirmed(confirmation));assert.equal(activeEnvironment(revealed)?.confirmed,true);
assert.throws(()=>applyRemoteControllerCommand(revealed,cards,actor,action),'No second confirmation event');
assert.deepEqual(revealed.players.map(p=>p.score),initial.players.map(p=>p.score));assert.equal(revealed.wallCount,initial.wallCount);
const snapshot=createControllerSnapshot(revealed,cards,{roomId:'test-room',matchId:'test-match',handId:'test-hand',revision:3,playerId:other});
assert.equal(snapshot.environment?.confirmed,true);assert.ok(snapshot.experienceEvents?.some(event=>event.id===confirmation.id&&treasureConfirmed(event)));
for(const kind of ['judgement','penalty','random'] as const)assert.ok(!isTreasureCinematic({...intro,kind}));
assert.ok(!isTreasureCinematic({...intro,environment:'number'}));assert.ok(!treasureConfirmed({...confirmation,environment:'night'}));
for(const portrait of [false,true]){const film=treasureFilm(portrait);assert.equal(film.duration,6.4);assert.ok(film.reveal<film.duration);assert.ok(film.src.includes(portrait?'portrait':'landscape'));}
const manifest=JSON.parse(readFileSync('public/cinematics/treasure/v1/manifest.json','utf8'));
assert.equal(manifest.durationSeconds,treasureFilm(false).duration);assert.equal(manifest.frames,192);assert.equal(manifest.assets.length,5);
for(const asset of manifest.assets){const bytes=readFileSync(`public/cinematics/treasure/v1/${asset.file}`);assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
console.log('Treasure: real Host activation and owner-only one-time confirmation, remote snapshots, unchanged scores/wall, event routing and all packaged media hashes passed.');
