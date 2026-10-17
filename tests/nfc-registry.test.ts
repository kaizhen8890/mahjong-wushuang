import assert from 'node:assert/strict';
import {
  NFC_IDENTITIES,
  identifyNfcUri,
  nfcSkill,
  nfcAudioSource,
  nfcCoverSource,
  nfcHasMusic,
} from '../lib/nfc-registry';
import catalog from '../data/skill-cards.json';
assert.equal(
  new Set(NFC_IDENTITIES.map((c) => c.code)).size,
  NFC_IDENTITIES.length,
);
for (const card of NFC_IDENTITIES) {
  assert.equal(identifyNfcUri(card.uri), card);
  assert.ok(nfcSkill(card, catalog.cards));
}
assert.equal(
  identifyNfcUri('mahjongwushuang://card/v1/MW-001').action,
  'skill',
);
const music = identifyNfcUri('mahjongwushuang://card/v1/MW-005');
assert.equal(music.action, 'music');
assert.equal(nfcAudioSource({ ...music, audioSrc: undefined }), null);
for (const uri of [
  null,
  42,
  'MW-001',
  'https://example.com/',
  'mahjongwushuang://card/v2/MW-001',
  'mahjongwushuang://card/v1/MW-999',
  'mahjongwushuang://card/v1/MW-001?activate=true',
  'mahjongwushuang://card/v1/MW-001#x',
  'mahjongwushuang://card/v1/%4DW-001',
  'mahjongwushuang://card/v1/MW-001/',
  ' mahjongwushuang://card/v1/MW-001',
])
  assert.throws(() => identifyNfcUri(uri));
assert.equal(
  nfcSkill(NFC_IDENTITIES[0], [
    { id: 41, name: 'custom', effectDescription: '' },
  ]),
  undefined,
);
assert.equal(
  nfcAudioSource({ ...music, audioSrc: 'https://example.com/song.mp3' }),
  null,
);
assert.equal(
  nfcAudioSource({ ...music, audioSrc: '/audio/nfc/../secret.mp3' }),
  null,
);
assert.equal(
  nfcAudioSource({ ...music, audioSrc: '/audio/nfc/setsuna-trip.mp3' }),
  '/audio/nfc/setsuna-trip.mp3',
);
console.log(
  'NFC registry: exact identities, missing media, external URL rejection and catalog mismatch passed',
);

assert.deepEqual(
  NFC_IDENTITIES.filter((c) => c.action === 'skill')
    .map((c) => c.skillId)
    .sort((a, b) => a - b),
  catalog.cards.map(c => c.id).sort((a, b) => a - b),
);

assert.equal(
  nfcAudioSource({ ...music, audioSrc: '/audio/nfc/setsuna-trip.mp4' }),
  '/audio/nfc/setsuna-trip.mp4',
);
for (const audioSrc of [
  '/audio/nfc/setsuna-trip.mp4?url=https://example.com',
  '/audio/nfc/%2e%2e/song.mp4',
  'https://example.com/song.mp4',
])
  assert.equal(nfcAudioSource({ ...music, audioSrc }), null);

assert.equal(
  nfcCoverSource({ ...music, coverSrc: '/audio/nfc/setsuna-trip-cover.webp' }),
  '/audio/nfc/setsuna-trip-cover.webp',
);
for (const coverSrc of [
  null,
  'https://example.com/a.webp',
  '/audio/nfc/../a.webp',
  '/audio/nfc/a.webp?x=1',
])
  assert.equal(nfcCoverSource({ ...music, coverSrc }), null);

// Contextual cards retain their old skill identities even when public media is absent.
for (const code of ['MW-002', 'MW-003']) {
  const identity = identifyNfcUri('mahjongwushuang://card/v1/' + code);
  assert.equal(identity.action, 'skill');
  assert.equal(nfcHasMusic(identity), true);
  assert.equal(nfcAudioSource({ ...identity, audioSrc: null }), null);
}
assert.equal(nfcHasMusic(NFC_IDENTITIES[0]), false);
const variant = identifyNfcUri('mahjongwushuang://card/v1/MW-006');
assert.equal(variant.skillId, music.skillId);
assert.equal(variant.skillName, music.skillName);
assert.equal(variant.action, music.action);
