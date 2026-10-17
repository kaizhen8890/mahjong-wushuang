import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import cardsData from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { activeEnvironment } from '../lib/skill-experience';
import { azoruFilm, azoruNumber, isAzoruCinematic } from '../lib/azoru-cinematic';
import { fitQuad, quadMatrix, sampleQuad } from '../lib/rulebook-cinematic';

// Exercise the real Host command, rather than assuming a presentation-only fixture
// matches the saved event's wording or the declared value.
const cards = cardsData.cards as SkillCard[];
for (let number=1;number<=9;number++) {
  const game=createGameState({...DEFAULT_SETTINGS,wushuang:true},cards.map(c=>c.id));
  const after=applyRemoteControllerCommand(game,cards,game.players[0].id,{kind:'skill.activate',input:{cardId:14,targetPlayerIds:[],duration:'hand',faceDown:false,environment:{number},activationId:`azoru-${number}`}}).nextGame;
  const event=after.experienceEvents!.at(-1)!;
  assert.ok(isAzoruCinematic(event));assert.equal(azoruNumber(event),number);assert.equal(activeEnvironment(after)?.number,number);
  assert.deepEqual(after.players.map(p=>p.score),game.players.map(p=>p.score),'The declaration alone does not score a hand');
  assert.ok(!isAzoruCinematic({...event,kind:'random'}));assert.ok(!isAzoruCinematic({...event,environment:'treasure'}));
  for(const label of ['数字 10 · 每两张追加一宝牌','数字 0 · 每两张追加一宝牌','每两张追加一宝牌','数字未确认 9']) assert.equal(azoruNumber({...event,label}),undefined);
}
for(const vertical of [false,true]) {
  const film=azoruFilm(vertical);
  for(const time of [3.60,3.65,3.8,4.3,5.35,5.99]) for(const [w,h] of [[1600,1000],[800,1280],[1920,1080],[1280,800],[390,844]]) {
    const quad=fitQuad(sampleQuad(film.anchors,time),film.width,film.height,w,h),m=quadMatrix(quad,640,960);
    for(const [i,[x,y]] of [[0,0],[640,0],[640,960],[0,960]].entries()) {
      const divisor=m[3]*x+m[7]*y+m[15],px=(m[0]*x+m[4]*y+m[12])/divisor,py=(m[1]*x+m[5]*y+m[13])/divisor;
      assert.ok(Math.abs(px-quad[i][0])<.001&&Math.abs(py-quad[i][1])<.001);
      assert.ok(px>=0&&py>=0&&px<=w&&py<=h,`Clipped declared number at ${w}x${h}`);
    }
  }
}
const manifest=JSON.parse(readFileSync('public/cinematics/azoru/v1/manifest.json','utf8'));
assert.equal(manifest.durationSeconds,azoruFilm(false).duration);
for(const asset of manifest.assets) assert.equal(createHash('sha256').update(readFileSync(`public/cinematics/azoru/v1/${asset.file}`)).digest('hex'),asset.sha256);
console.log('Azoru: all nine real Host declarations, no inferred digit, projection and packaged media hashes passed.');
