import assert from 'node:assert/strict';
import catalog from '../data/skill-cards.json';
import baseline from '../data/skill-maintenance-baseline.json';
import { NFC_IDENTITIES, nfcSkill, identifyNfcUri } from '../lib/nfc-registry';
import { skillCardArt } from '../lib/skill-art';
import { createGameState, drawSkills, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { migrateSkillLibrary, SKILL_CATALOG_REVISION } from '../lib/skill-catalog';

const cards=catalog.cards as unknown as SkillCard[];
for(const old of baseline.cards) assert.equal(cards.find(c=>c.id===old.id)?.name,old.name,`原有身份改变：${old.name}`);
for(const old of baseline.identities) {
  const now=identifyNfcUri(old.uri);
  for(const key of ['code','uri','action','skillId','skillName'] as const) assert.equal(now[key],old[key],`旧NFC身份改变：${old.code}`);
}
for(const code of baseline.reservedNfcCodes) assert.ok(!NFC_IDENTITIES.some(n=>n.code===code),`退役/保留NFC被复用：${code}`);
const ids=new Set(cards.map(c=>c.id));
assert.equal(ids.size,cards.length);
for(const id of catalog.retiredCardIds) assert.ok(!ids.has(id));
for(const id of catalog.addedCardIds) assert.ok(ids.has(id),`迁移新增项缺失：${id}`);
const additions=cards.filter(c=>!baseline.cards.some(b=>b.id===c.id));
for(const card of additions) {
  assert.ok(skillCardArt(card.id),`新卡缺卡面：${card.name}`);
  assert.ok(catalog.addedCardIds.includes(card.id),`新卡未登记迁移：${card.name}`);
  const identity=NFC_IDENTITIES.filter(n=>n.action==='skill'&&n.skillId===card.id);
  assert.equal(identity.length,1);assert.equal(nfcSkill(identity[0],[card]),card);
  const game=createGameState();game.settings.wushuang=true;game.skillDeck=[card.id];
  const actor=game.players[0].id,target=game.players[1].id;
  const drawn=drawSkills(game,actor,1,[card.id]);assert.ok(drawn.players[0].skillHand.includes(card.id));
  const next=applyRemoteControllerCommand(drawn,cards,actor,{kind:'skill.activate',input:{cardId:card.id,targetPlayerIds:[target],duration:'hand',faceDown:false}}).nextGame;
  assert.equal(next.effects.at(-1)?.cardId,card.id);assert.equal(next.effects.at(-1)?.effectText,card.effectDescription);
  assert.deepEqual(next.players.map(p=>p.score),drawn.players.map(p=>p.score),'手动卡不能隐式结算');
  const migrated=migrateSkillLibrary(cards.filter(c=>c.id!==card.id),'2026-10-01');
  assert.ok(migrated.some(c=>c.id===card.id));
  assert.ok(!migrateSkillLibrary(cards.filter(c=>c.id!==card.id),SKILL_CATALOG_REVISION).some(c=>c.id===card.id));
}
console.log('Stable historical identities, retired IDs, NFC coverage, added card draw/activation/migration passed.');
