import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fitQuad, isRulebookCinematic, quadMatrix, rulebookFilm, sampleQuad } from '../lib/rulebook-cinematic';
import type { SkillExperienceEvent } from '../lib/skill-experience';
const event: SkillExperienceEvent = { id:'a',createdAt:0,kind:'environment',environment:'yaku',cardName:'规则怪谈',actorId:'a',actorName:'甲',targets:[],label:'立直 · 固定 5 番' };
assert.ok(isRulebookCinematic(event));
assert.ok(!isRulebookCinematic({...event,kind:'random'}));
assert.ok(!isRulebookCinematic({...event,environment:'witch'}));
// Verify projected text corners against the exported Blender camera, including
// rotations with letterboxing. A wrong matrix can silently invert/crop the text.
for(const vertical of [false,true]) {
  const film=rulebookFilm(vertical);
  for(const time of [3.6,3.75,3.82,4.3,5.59]) for(const [w,h] of [[1600,1000],[800,1280],[1920,1080],[1280,800]]) {
    const quad=fitQuad(sampleQuad(film.anchors,time),film.width,film.height,w,h),m=quadMatrix(quad);
    for(const [i,[x,y]] of [[0,0],[640,0],[640,320],[0,320]].entries()) {
      const divisor=m[3]*x+m[7]*y+m[15],px=(m[0]*x+m[4]*y+m[12])/divisor,py=(m[1]*x+m[5]*y+m[13])/divisor;
      assert.ok(Math.abs(px-quad[i][0])<.001&&Math.abs(py-quad[i][1])<.001);
      assert.ok(px>=0&&py>=0&&px<=w&&py<=h,`Clipped rule declaration at ${w}x${h}`);
    }
  }
}
const manifest=JSON.parse(readFileSync('public/cinematics/rulebook/v1/manifest.json','utf8'));
assert.equal(manifest.durationSeconds,rulebookFilm(false).duration);
for(const asset of manifest.assets) assert.equal(createHash('sha256').update(readFileSync(`public/cinematics/rulebook/v1/${asset.file}`)).digest('hex'),asset.sha256);
console.log('Rulebook page projection in both orientations, rotation containment and packaged media hashes passed.');
