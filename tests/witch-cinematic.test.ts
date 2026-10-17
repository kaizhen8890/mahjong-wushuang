import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { isWitchCinematic, targetRect, witchFilm } from '../lib/witch-cinematic';
import type { SkillExperienceEvent } from '../lib/skill-experience';
const event: SkillExperienceEvent = { id: 'test', createdAt: 0, kind: 'environment', environment: 'witch', cardName: '魔女审判', actorId: 'a', actorName: '甲', targets: [], label: '' };
assert.ok(isWitchCinematic(event));
assert.ok(isWitchCinematic({ ...event, kind: 'judgement' }));
assert.ok(!isWitchCinematic({ ...event, kind: 'random' }));
assert.ok(!isWitchCinematic({ ...event, environment: 'silence' }));
// getBoundingClientRect already accounts for a seat's rotation. Do not rotate it twice.
assert.deepEqual(targetRect({ left: 100, top: 200, width: 160, height: 420 }, 800, 1280), { x: 22.5, y: 32.03125, width: 160, height: 420, found: true });
assert.equal(targetRect(undefined, 0, 0).found, false);
for (const portrait of [false, true]) for (const kind of ['environment', 'judgement'] as const) {
  const film = witchFilm({ ...event, kind }, portrait);
  assert.ok(film.reveal < film.duration);
  assert.ok(existsSync(`public${film.src}`), film.src);
  assert.ok(existsSync(`public${film.poster}`), film.poster);
}
const manifest = JSON.parse(readFileSync('public/cinematics/witch/v1/manifest.json', 'utf8'));
assert.equal(manifest.introSeconds, witchFilm(event, false).duration);
assert.equal(manifest.judgementSeconds, witchFilm({ ...event, kind: 'judgement' }, false).duration);
console.log('Witch cinematic routing, rotated-seat bounds and packaged media passed.');
