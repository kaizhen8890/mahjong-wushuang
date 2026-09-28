import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import data from '../data/skill-cards.json';
import manifest from '../public/skill-cards/manifest.json';
import { createGameState, type SkillCard } from '../lib/mahjong';
import { recordSkillTransitions } from '../lib/presentation';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { skillCardArt } from '../lib/skill-art';

const cards = data.cards as SkillCard[];
const game = createGameState(); game.settings.wushuang = true;
const actor = game.players[0].id, target = game.players[1].id;
for (const type of ['攻','团','单','陷']) {
  const card = cards.find(c=>c.type.code===type)!;
  const changed = applyRemoteControllerCommand(game,cards,actor,{kind:'skill.activate',input:{cardId:card.id,targetPlayerIds:[target],faceDown:type==='陷',duration:'hand',effectText:''}}).nextGame;
  const animated = recordSkillTransitions(game,changed,cards);
  if(type==='陷') {
    assert.equal(animated.presentations?.length ?? 0,0,'Face-down placement must have no card presentation');
    const reveal=applyRemoteControllerCommand(animated,cards,actor,{kind:'skill.reveal',input:{effectId:animated.effects.at(-1)!.id,targetPlayerIds:[target],effectText:''}}).nextGame;
    const shown=recordSkillTransitions(animated,reveal,cards);
    assert.equal(shown.presentations?.at(-1)?.skill?.type,'陷');
    assert.equal(recordSkillTransitions(shown,shown,cards).presentations?.length,1,'No repeated reveal');
  } else {
    assert.equal(animated.presentations?.at(-1)?.skill?.type,type);
    assert.deepEqual(animated.presentations?.at(-1)?.skill?.targetIds,type==='单'?[actor]:[target]);
    assert.equal(recordSkillTransitions(animated,animated,cards).presentations?.length,1,'No replay on unrelated edits');
    const snapshot=createControllerSnapshot(animated,cards,{roomId:'r',matchId:'m',handId:'h',revision:1,playerId:target});
    assert.equal(snapshot.presentations?.length,0,'Host visual payload must not enter controller protocol');
  }
  assert.deepEqual(animated.players,changed.players,'Animation never changes scoring or skill hands');
}
assert.equal(manifest.cards.length,41);
for(const card of cards) assert.ok(skillCardArt(card.id),`Missing card art ${card.id}`);
for(const entry of manifest.cards) assert.ok(existsSync('public'+entry.src),entry.src);
assert.equal(skillCardArt(99999),undefined);
console.log('Skill activation/reveal, no hidden placement/replay, snapshot boundary and 41 art assets passed.');
