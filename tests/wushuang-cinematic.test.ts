import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import cardsData from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { randomRuleTemplate } from '../lib/skill-random';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { recordSkillTransitions } from '../lib/presentation';
import { wushuangOutcome, wushuangFilms } from '../lib/wushuang-cinematic';
import { startWushuangPlayback } from '../lib/wushuang-playback';

const cards = cardsData.cards as SkillCard[];
const card = { ...cards[0], id: 10001, name: '麻将无双', randomRule: randomRuleTemplate('coin') };
const before = createGameState({ ...DEFAULT_SETTINGS, wushuang: true });
const actor = before.players[0].id;
const request = { kind: 'skill.activate' as const, input: { cardId: card.id, targetPlayerIds: [before.players[1].id], duration: 'hand' as const, faceDown: false, activationId: 'cinematic-test' } };
const after = applyRemoteControllerCommand(before, [card], actor, request).nextGame;
const event = after.experienceEvents!.at(-1)!;
assert.equal(wushuangOutcome(event), event.random!.faces[0] ? 'heads' : 'tails');
assert.deepEqual(after.players.map(p => p.score), before.players.map(p => p.score));
assert.equal(applyRemoteControllerCommand(after, [card], actor, request).changed, false);
assert.equal(recordSkillTransitions(before, after, [card]).presentations?.length ?? 0, 0, 'No generic skill animation underneath');
const snapshot = createControllerSnapshot(after, [card], { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: actor });
assert.equal(wushuangOutcome(snapshot.experienceEvents!.at(-1)!), wushuangOutcome(event));
for (const face of [0, 1]) {
  const fixture = { ...event, random: { ...event.random!, faces: [face], total: face, label: 'An unrelated label' } };
  assert.equal(wushuangOutcome(fixture), face ? 'heads' : 'tails');
  assert.equal(wushuangOutcome({ ...fixture, cardName: 'Other card' }), undefined);
  assert.equal(wushuangOutcome({ ...fixture, random: { ...fixture.random, faces: [face, face] } }), undefined);
  assert.equal(wushuangOutcome({ ...fixture, random: { ...fixture.random, total: 9 } }), undefined);
}
for (const outcome of ['heads', 'tails'] as const) for (const portrait of [true, false]) {
  const films = wushuangFilms(outcome, portrait);
  assert.equal(films[0].duration + films[1].duration, 16);
  for (const film of films) for (const src of [film.src, film.poster]) assert.ok(existsSync('public' + src), src);
}

// Exercise the actual coordinator with media events, including late events after skip.
class Video extends EventTarget {
  currentTime = 0; error = null; ended = false; muted = false; plays = 0; pauses = 0; cleared = false;
  play() { this.plays++; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.pauses++; }
  removeAttribute() { this.cleared = true; }
  load() {}
}
const doc = Object.assign(new EventTarget(), { hidden: false });
Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
const setup = () => {
  const videos = [new Video(), new Video()]; let activeSound = 0, stage = 0, fallback = 0, completed = 0;
  const dispose = startWushuangPlayback({ players: videos as unknown as HTMLVideoElement[],
    sound: () => { assert.equal(++activeSound, 1); return () => { activeSound--; }; },
    stage: i => { stage = i; }, reveal: () => {}, fallback: () => { fallback++; }, complete: () => { completed++; } });
  return { videos, dispose, status: () => ({ activeSound, stage, fallback, completed }) };
};
const normal = setup();
normal.videos[0].dispatchEvent(new Event('ended'));
assert.equal(normal.status().stage, 1); assert.equal(normal.videos[1].plays, 1);
normal.videos[0].dispatchEvent(new Event('ended'));
assert.equal(normal.videos[1].plays, 1);
normal.dispose();
normal.videos[1].dispatchEvent(new Event('playing'));
assert.equal(normal.status().activeSound, 0);
assert.ok(normal.videos.every(v => v.cleared && v.pauses > 0));
const failed = setup(); failed.videos[0].dispatchEvent(new Event('error'));
assert.equal(failed.status().fallback, 1); assert.equal(failed.status().activeSound, 0); assert.equal(failed.videos[1].plays, 0); failed.dispose();
const hidden = setup(); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(hidden.status().completed, 1); assert.equal(hidden.status().activeSound, 0); assert.equal(hidden.videos[1].plays, 0); hidden.dispose();
delete (globalThis as any).document;
console.log('PASS Wushuang: Host result, snapshot, no reroll/scoring, no double animation, assets, sequence, skip, failure and background cleanup.');
