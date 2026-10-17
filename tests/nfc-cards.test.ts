import assert from 'node:assert/strict';
import {
  NFC_BINDINGS_KEY,
  bindNfcCard,
  normalizeNfcUid,
  parseNfcBindings,
  resolveNfcCard,
  nfcCardArtwork,
} from '../lib/nfc-cards';
const map = new Map<string, string>();
const storage = {
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => {
    map.set(key, value);
  },
};
const card = { id: 41, name: '麻将无双', effectDescription: 'test' };
const first = bindNfcCard(storage, '04aa0011223344', card);
assert.equal(normalizeNfcUid('04aa0011223344'), '04AA0011223344');
assert.equal(resolveNfcCard(first, '04aa0011223344', [card]).card, card);
assert.equal(
  resolveNfcCard(first, '04aa0011223344', [{ ...card, name: '另一张自定义卡' }])
    .card,
  undefined,
);
assert.equal(resolveNfcCard(first, '04aa0011223344', []).card, undefined);
const old = storage.getItem(NFC_BINDINGS_KEY);
const second = bindNfcCard(storage, '04aa0011223344', {
  ...card,
  id: 42,
  name: '断序杂音',
});
assert.equal(second.bindings.length, 1);
assert.equal(storage.getItem(NFC_BINDINGS_KEY + ':previous'), old);
assert.equal(
  bindNfcCard(storage, '04BB0011223344', card).bindings.length,
  2,
  'Several chips can identify the same skill',
);
assert.throws(() => normalizeNfcUid('https://example.com'), /编号无效/);
assert.throws(() => normalizeNfcUid(''), /编号无效/);
map.set(NFC_BINDINGS_KEY, 'invalid json');
assert.throws(
  () => bindNfcCard(storage, '04aa0011223344', card),
  /原资料已保留/,
);
assert.equal(map.get(NFC_BINDINGS_KEY), 'invalid json');
map.set(NFC_BINDINGS_KEY, old!);
assert.throws(
  () =>
    bindNfcCard(
      {
        ...storage,
        setItem: () => {
          throw Error('quota');
        },
      },
      '04aa0011223344',
      card,
    ),
  /quota/,
);
assert.equal(storage.getItem(NFC_BINDINGS_KEY), old);
assert.throws(
  () => parseNfcBindings(JSON.stringify({ version: 2, bindings: [] })),
  /不支持/,
);
assert.throws(
  () =>
    parseNfcBindings(
      JSON.stringify({
        version: 1,
        bindings: [...first.bindings, ...first.bindings],
      }),
    ),
  /不完整/,
);
assert.equal(nfcCardArtwork({ ...card, name: '不同的自制卡' }), undefined);
assert.ok(nfcCardArtwork(card));
console.log(
  'NFC binding: canonical UID, missing/changed cards, multi-tag, rebind backup, corrupt data and quota preservation, artwork identity passed.',
);
