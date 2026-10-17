import assert from 'node:assert/strict';
import {
  parseLrc,
  lyricIndex,
  localLyricsSource,
  musicTime,
} from '../lib/music-lyrics';
const cues = parseLrc(
  '[ar:原创测试文本]\n[offset:-500]\n[00:01.50]第一行\n[00:01.500]同轴翻译\n[00:03][00:07.025]另一行\n[00:04.0]\n[00:90]非法时间',
);
assert.deepEqual(cues, [
  { time: 1, text: '第一行\n同轴翻译' },
  { time: 2.5, text: '另一行' },
  { time: 3.5, text: '' },
  { time: 6.525, text: '另一行' },
]);
assert.equal(lyricIndex(cues, 0), -1);
assert.equal(lyricIndex(cues, 1), 0);
assert.equal(lyricIndex(cues, 3.6), 2);
assert.equal(lyricIndex(cues, 100), 3);
assert.equal(lyricIndex(cues, 2), 0); // backward seeking
assert.equal(lyricIndex([], 12), -1);
assert.equal(
  localLyricsSource('/audio/nfc/setsuna-trip-zh.lrc'),
  '/audio/nfc/setsuna-trip-zh.lrc',
);
for (const path of [
  'https://a.test/song.lrc',
  '/audio/nfc/../secret.lrc',
  '/audio/nfc/a.lrc?q=1',
])
  assert.equal(localLyricsSource(path), null);
assert.equal(musicTime(Infinity), '00:00');
assert.equal(musicTime(248.704), '04:08');
console.log(
  'PASS timed lyrics: offsets, bilingual cues, repeat tags, seeking, interludes, local-only paths',
);
