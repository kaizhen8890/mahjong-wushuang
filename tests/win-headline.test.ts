import assert from 'node:assert/strict';
import { winHeadline } from '../lib/presentation';
for (const [yakuman, limit, han, expected] of [
  [0, '跳满', 6, '跳满'], [0, '三倍满', 11, '三倍满'],
  [1, '役满', 0, '役满'], [2, '2 倍役满', 0, '两倍役满'],
  [0, '累计役满', 13, '累计役满'], [0, '3 番 40 符', 3, '3 番'],
] as const) assert.equal(winHeadline({yakuman,limit,han}), expected);
console.log('Win headline: real limits, multiple yakuman and below-mangan fallback passed.');
