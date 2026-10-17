import assert from 'node:assert/strict';
import data from '../data/skill-cards.json';
import { sortSkillCatalog, skillRarity, type CatalogCard } from '../lib/skill-catalog-order';
import { createControllerSkillCatalog, createSkillCatalogRevision, createControllerSnapshot } from '../lib/controller-snapshot';
import { createGameState, type SkillCard } from '../lib/mahjong';
import { LAN_PROTOCOL_VERSION, parseServerMessage, serializeWireMessage } from '../lib/lan-protocol';
const cards = data.cards as SkillCard[];
const before = JSON.stringify(cards);
const mixed: CatalogCard[] = [
  { id: 908, name: '无双神', rarity: '无双', typeCode: '神', effectDescription: '' },
  { id: 904, name: '普通陷', rarity: '普通', typeCode: '陷', effectDescription: '' },
  { id: 905, name: '稀有单', rarity: '稀有', typeCode: '单', effectDescription: '' },
  { id: 902, name: '普通团', rarity: '普通', typeCode: '团', effectDescription: '' },
  { id: 901, name: '普通单', rarity: '普通', typeCode: '单', effectDescription: '' },
  { id: 903, name: '普通攻', rarity: '普通', typeCode: '攻', effectDescription: '' },
  { id: 907, name: '史诗单', rarity: '史诗', typeCode: '单', effectDescription: '' },
  { id: 906, name: '稀有神', rarity: '稀有', typeCode: '神', effectDescription: '' },
  { id: 909, name: '自定义未标注', typeCode: '单', custom: true, effectDescription: '' },
];
const inputOrder = mixed.map(card => card.id);
assert.deepEqual(sortSkillCatalog(mixed).map(card => card.id), [901,902,903,904,905,906,907,908,909]);
assert.deepEqual(mixed.map(card => card.id), inputOrder);
const catalog = createControllerSkillCatalog(cards);
assert.deepEqual(sortSkillCatalog(cards).map(card => card.id), sortSkillCatalog(catalog).map(card => card.id));
const { rarity: _rarity, ...legacy } = catalog[0];
assert.equal(skillRarity(legacy), cards[0].rarity);
assert.equal(skillRarity({ ...legacy, name: '未知同编号' }), '未标注');
assert.equal(skillRarity({ ...legacy, custom: true }), '未标注');
const wire = (entries: unknown[]) => parseServerMessage(serializeWireMessage({ protocol: LAN_PROTOCOL_VERSION, type: 'catalog.snapshot', sentAt: 1, roomId: 'r', revision: 'v1', cards: entries } as never));
const parsed = wire(catalog); assert.ok(parsed.ok);
if (parsed.ok && parsed.value.type === 'catalog.snapshot') assert.equal(parsed.value.cards[0].rarity, cards[0].rarity);
assert.ok(wire([legacy]).ok, 'Older hosts remain readable');
assert.ok(!wire([{ ...catalog[0], rarity: 100 }]).ok);
assert.ok(!wire([{ ...catalog[0], rarity: 'x'.repeat(33) }]).ok);
const custom = { ...cards[0], id: 901, name: '自制卡', custom: true, rarity: '普通', artwork: 'data:image/png;base64,PRIVATE' };
assert.equal(createControllerSkillCatalog([custom])[0].rarity, '普通');
assert.ok(!JSON.stringify(createControllerSkillCatalog([custom])).includes('PRIVATE'));
assert.notEqual(createSkillCatalogRevision([custom]), createSkillCatalogRevision([{ ...custom, rarity: '稀有' }]));
const game = createGameState();
game.effects.push({ id: 'private-trap', cardId: custom.id, cardName: '绝密卡名', effectText: '绝密说明', ownerId: game.players[1].id, faceDown: true, visibility: 'face-down', status: 'active', state: 'armed' });
const snapshot = createControllerSnapshot(game, [custom], { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: game.players[0].id });
assert.ok(!JSON.stringify(snapshot).includes('绝密'));
assert.equal(JSON.stringify(cards), before, 'Sorting never mutates the source library or draw order');
console.log('PASS rarity/type order, immutable catalog, host/remote parity, custom and legacy metadata, cache revision, wire validation and hidden-trap boundary.');
