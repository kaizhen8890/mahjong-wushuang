import assert from 'node:assert/strict';
import catalog from '../data/skill-cards.json';
import { NFC_IDENTITIES, identifyNfcUri, nfcSkill } from '../lib/nfc-registry';
import { nfcCodeRows, nfcCodeExport, unregisteredNfcCards } from '../lib/nfc-code-catalog';
const expected = [['001', 41, 'skill'], ['002', 42, 'skill'], ['003', 43, 'skill'], ['004', 44, 'skill'], ['005', 40, 'music'], ['006', 40, 'music']] as const;
for (const [code, id, action] of expected) {
  const identity = identifyNfcUri('mahjongwushuang://card/v1/MW-' + code);
  assert.equal(identity.skillId, id); assert.equal(identity.action, action);
}
assert.ok(NFC_IDENTITIES.length >= catalog.cards.length);
assert.equal(new Set(NFC_IDENTITIES.map(c => c.uri)).size, NFC_IDENTITIES.length);
assert.equal(identifyNfcUri('mahjongwushuang://card/v1/MW-006').aliasOf, 'MW-005');
const ordinary = identifyNfcUri('mahjongwushuang://card/v1/MW-140');
assert.equal(ordinary.skillId, 40); assert.equal(ordinary.action, 'skill');
for (const card of catalog.cards) {
  const codes = NFC_IDENTITIES.filter(c => c.action === 'skill' && c.skillId === card.id);
  assert.equal(codes.length, 1, card.name);
  assert.equal(nfcSkill(codes[0], [card]), card);
  assert.equal(nfcSkill(codes[0], [{ ...card, custom: true }]), undefined);
  assert.equal(nfcSkill(codes[0], [{ ...card, name: card.name + '改名' }]), undefined);
  assert.equal(nfcSkill(codes[0], []), undefined);
}
for (const retired of ['123', '138']) assert.throws(() => identifyNfcUri('mahjongwushuang://card/v1/MW-' + retired));
assert.equal(nfcCodeRows(' mw-005 ', 'all')[0].card.name, '刹那旅程');
assert.equal(nfcCodeRows('断序', 'skill')[0].identity.code, 'MW-002');
assert.equal(nfcCodeRows('', 'skill').length, catalog.cards.length);
assert.equal(nfcCodeRows('', 'music').length, 1);
assert.equal(nfcCodeRows('', 'alias').length, 1);
assert.equal(nfcCodeRows('not-a-card', 'all').length, 0);
assert.deepEqual(unregisteredNfcCards(catalog.cards), []);
const custom = { ...catalog.cards[0], id: 901, name: '自定义技能', custom: true };
assert.deepEqual(unregisteredNfcCards([...catalog.cards].reverse().concat(custom)), [custom]);
const exported = nfcCodeExport();
assert.equal(exported.cards.length, NFC_IDENTITIES.length);
assert.ok(exported.cards.every(c => identifyNfcUri(c.uri).skillName === c.skillName));
assert.ok(exported.cards.every(c => Object.keys(c).every(k => ['code', 'name', 'uri', 'action', 'skillId', 'skillName', 'aliasOf'].includes(k))));
console.log('NFC codes: complete coverage, requested mapping, compatibility, local edits and minimal export passed');
