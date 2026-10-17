import assert from 'node:assert/strict';
import { cardFacets, coinRevealDelay, preludeTheme } from '../lib/cinematic-motion';
import { ENVIRONMENTS, type SkillExperienceEvent } from '../lib/skill-experience';

const base: SkillExperienceEvent = { id: 'event', createdAt: 1000, kind: 'environment', actorId: 'a', actorName: 'A', cardName: '', targets: [], label: '' };
for (const [environment, cardName] of Object.entries(ENVIRONMENTS)) {
  const event = { ...base, environment: environment as keyof typeof ENVIRONMENTS, cardName };
  assert.equal(preludeTheme(event), 'environment', 'All six environments share one prelude');
  for (const kind of ['penalty', 'judgement', 'treasure'] as const) assert.equal(preludeTheme({ ...event, kind }), undefined, 'Subsequent environment actions do not replay the prelude');
}
for (const cardName of ['麻将无双', '听天问剑']) {
  const coin = { ...base, kind: 'random' as const, cardName, random: { kind: 'coin' as const, faces: [0], total: 0, outcomeId: 'tails', label: '反面', description: '' } };
  assert.equal(preludeTheme(coin), preludeTheme({ ...coin, random: { ...coin.random, faces: [1], total: 1 } } as SkillExperienceEvent));
  assert.equal(coinRevealDelay(coin, 1000), 10350, 'Controller must include the Host prelude before revealing a rolled coin');
  assert.equal(coinRevealDelay(coin, 12000), 0);
  assert.equal(coinRevealDelay({ ...coin, random: { ...coin.random, source: 'manual' } }, 1000), 0, 'Physical coin choice does not wait for a virtual toss');
}
assert.equal(preludeTheme({ ...base, kind: 'skill', cardName: '普通技能' }), undefined);
// Texture fragments must tile the entire face without holes or duplicated area.
const facets = cardFacets();
const area = facets.reduce((sum, [a, b, c]) => sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2, 0);
assert.ok(Math.abs(area - 1) < 1e-12);
assert.ok(facets.flat().every(p => Math.abs(p.x) <= .5 && Math.abs(p.y) <= .5));
console.log('PASS cinematic motion: common environment prelude, neutral coin faces, reveal timing, secondary-action bypass, gap-free textured mesh.');
