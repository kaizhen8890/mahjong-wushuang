import assert from 'node:assert/strict';
import { createMusicDirector } from '../lib/music-priority';
import { startWushuangPlayback, type CinematicEnd } from '../lib/wushuang-playback';

class Audio extends EventTarget {
  paused = true; currentTime = 42; volume = 1; loop = false; preload = ''; plays = 0; src = 'source'; reject = false;
  play() { this.plays++; if (this.reject) return Promise.reject(Error('decode')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ''; }
  load() {}
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
let hidden = false, duck = 1, rejectNext = false;
const songs: Audio[] = [];
const director = createMusicDirector({ hidden: () => hidden, duck: () => duck, create: () => {
  const audio = new Audio(); audio.reject = rejectNext; rejectNext = false; songs.push(audio); return audio as unknown as HTMLAudioElement;
} });
const loop = new Audio(); loop.loop = true;
const remove = director.addRiichi(loop as unknown as HTMLAudioElement, () => .42);
await flush(); assert.equal(loop.paused, false);
assert.equal(director.startSkill('table', 'one', '/audio/nfc/desultory-signals.mp3'), true);
await flush(); assert.equal(loop.paused, true); assert.equal(songs[0].loop, false);
duck = .18; director.sync(); assert.equal(songs[0].volume, .55 * .18);
duck = 1; director.sync(); assert.equal(songs[0].volume, .55);
songs[0].dispatchEvent(new Event('ended')); await flush();
assert.equal(loop.paused, false); assert.equal(loop.currentTime, 42, 'Resume existing loop position');
assert.equal(director.startSkill('table', 'one', '/audio/nfc/desultory-signals.mp3'), false, 'Same event does not replay');
director.startSkill('table', 'two', '/audio/nfc/desultory-signals.mp3'); await flush();
const plays = loop.plays;
director.startSkill('table', 'three', '/audio/nfc/astral-judgement.mp3'); await flush();
assert.equal(loop.plays, plays, 'No riichi burst between replacements');
songs[1].dispatchEvent(new Event('ended')); assert.equal(songs[2].paused, false, 'Stale old ended cannot stop replacement');
const releaseHold = director.hold(); assert.equal(songs[2].paused, true); assert.equal(loop.paused, true);
releaseHold(); await flush(); assert.equal(songs[2].paused, false); assert.equal(loop.paused, true);
hidden = true; director.sync(); assert.equal(songs[2].paused, true);
hidden = false; director.sync(); await flush(); assert.equal(songs[2].paused, false);
director.stopSkill('other-table'); assert.equal(songs[2].paused, false);
songs[2].dispatchEvent(new Event('error')); await flush(); assert.equal(loop.paused, false);
rejectNext = true; director.startSkill('table', 'four', '/audio/nfc/astral-judgement.mp3'); await flush();
assert.equal(loop.paused, false, 'Failed autoplay cannot permanently block riichi');
director.startSkill('table', 'five', '/audio/nfc/astral-judgement.mp3'); await flush();
remove(); const lastPlays = loop.plays;
songs.at(-1)!.dispatchEvent(new Event('ended')); await flush(); assert.equal(loop.plays, lastPlays, 'No riichi left means silence');
assert.equal(director.startSkill('table', 'invalid', 'https://example.com/music.mp3'), false);

const doc = Object.assign(new EventTarget(), { hidden: false });
Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
class Video extends Audio { ended = false; error = null; }
const reasons: CinematicEnd[] = [];
function presentation() {
  const video = new Video();
  const dispose = startWushuangPlayback({ players: [video as unknown as HTMLVideoElement], sound: () => () => {}, stage: () => {}, reveal: () => {}, fallback: () => {}, complete: reason => reasons.push(reason), tailMs: 0 });
  return { video, dispose };
}
const natural = presentation(); natural.video.ended = true; natural.video.dispatchEvent(new Event('ended'));
await flush(); assert.deepEqual(reasons, ['ended']); natural.dispose();
const skipped = presentation(); skipped.dispose(); skipped.video.dispatchEvent(new Event('ended'));
await flush(); assert.deepEqual(reasons, ['ended']);
const background = presentation(); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(reasons.at(-1), 'interrupted'); background.dispose(); doc.hidden = false;
const failure = presentation(); failure.video.dispatchEvent(new Event('error'));
await new Promise(resolve => setTimeout(resolve, 2050)); assert.equal(reasons.at(-1), 'failed'); failure.dispose();
delete (globalThis as unknown as { document?: Document }).document;
console.log('PASS music priority: natural completion only, one-shot, resume position, no riichi, replacement, late events, foreground, explicit player hold, failure, cleanup and no remote URL.');
