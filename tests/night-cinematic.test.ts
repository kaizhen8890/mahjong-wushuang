import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { advanceNightIntro, initialNightIntro, NIGHT_FILM, type NightInput } from '../lib/night-cinematic';
import type { SkillExperienceEvent } from '../lib/skill-experience';
const now=100000,event:SkillExperienceEvent={id:'new-night',createdAt:now,kind:'environment',environment:'night',cardName:'暗夜之战',actorId:'a',actorName:'甲',targets:[],label:''};
const input:NightInput={active:false,events:[],minimal:false,visible:true};
const live:NightInput={...input,active:true,context:'night-effect',events:[event]};
let state=advanceNightIntro(initialNightIntro(input),live,now);assert.equal(state.intro?.id,event.id);
state=advanceNightIntro(state,{...live,events:[event]},now+1000);assert.equal(state.intro?.id,event.id);
// Completed movies stay dark across duplicate snapshots and undo/restore.
state={...state,intro:undefined};state=advanceNightIntro(state,live,now+2000);assert.equal(state.intro,undefined);
state=advanceNightIntro(state,input,now+2500);assert.equal(state.intro,undefined);
state=advanceNightIntro(state,live,now+3000);assert.equal(state.intro,undefined);
const fresh={...event,id:'night-two'};
state=advanceNightIntro(state,{...live,context:'effect-two',events:[event,fresh]},now+3000);assert.equal(state.intro?.id,'night-two');
assert.equal(advanceNightIntro(state,input,now+3001).intro,undefined);
// A new mount already in a night is restoration, including a recent event.
const restored=initialNightIntro(live);assert.equal(restored.intro,undefined);
assert.equal(advanceNightIntro(restored,{...live,events:[event]},now+50).intro,undefined);
for(const override of [{minimal:true},{visible:false}])assert.equal(advanceNightIntro(initialNightIntro(input),{...live,...override},now).intro,undefined);
assert.equal(advanceNightIntro(initialNightIntro(input),live,now+10001).intro,undefined);
assert.equal(advanceNightIntro(initialNightIntro(input),{...live,events:[{...event,environment:'witch'}]},now).intro,undefined);
const manifest=JSON.parse(readFileSync('public/cinematics/night/v1/manifest.json','utf8'));
assert.equal(manifest.durationSeconds,NIGHT_FILM.duration);
for(const asset of manifest.assets)assert.equal(createHash('sha256').update(readFileSync(`public/cinematics/night/v1/${asset.file}`)).digest('hex'),asset.sha256);
console.log('Night transition: fresh activation, snapshot dedup, restoration, replacement, phone/reduced motion, visibility and packaged media hashes passed.');
