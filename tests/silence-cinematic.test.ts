import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import cardsData from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { applyEnvironmentAction, activeEnvironment } from '../lib/skill-experience';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { isSilenceCinematic, silenceFilm } from '../lib/silence-cinematic';

const cards = cardsData.cards as SkillCard[];
const initial = createGameState({ ...DEFAULT_SETTINGS, wushuang: true }, cards.map(card => card.id));
const [actor, target] = initial.players.map(player => player.id);
const command = { kind: 'skill.activate' as const, input: { cardId: 11, targetPlayerIds: [], duration: 'hand' as const, faceDown: false, activationId: 'silence-real-card-v2' } };
const activated = applyRemoteControllerCommand(initial, cards, actor, command).nextGame;
const env = activeEnvironment(activated)!;
const event = activated.experienceEvents!.at(-1)!;
assert.equal(env.kind, 'silence');
assert.ok(isSilenceCinematic(event));
assert.deepEqual(activated.players.map(player => player.score), initial.players.map(player => player.score));
assert.equal(activated.wallCount, initial.wallCount);
const again = applyRemoteControllerCommand(activated, cards, actor, command).nextGame;
assert.equal(again.experienceEvents!.length, activated.experienceEvents!.length, 'duplicate activation must not replay a film');
const action = { kind: 'environment.action' as const, effectId: env.effectId, action: 'penalty' as const, targetId: target, confirmed: true };
assert.throws(() => applyEnvironmentAction(activated, actor, action, false));
const fined = applyEnvironmentAction(activated, actor, action, true);
const penalty = fined.experienceEvents!.at(-1)!;
assert.ok(isSilenceCinematic(penalty));
assert.equal(penalty.kind, 'penalty');
assert.deepEqual(penalty.targets, [target]);
assert.equal(fined.players[1].score, activated.players[1].score - 3000);
assert.equal(fined.players[0].score, activated.players[0].score);
assert.equal(fined.riichiSticks, activated.riichiSticks);
assert.equal(fined.players.reduce((sum, player) => sum + player.score, 0), activated.players.reduce((sum, player) => sum + player.score, 0) - 3000);
const view = createControllerSnapshot(fined, cards, { roomId: 'test-room', matchId: 'test-match', handId: 'test-hand', revision: 2, playerId: target });
assert.equal(view.environment?.kind, 'silence');
assert.ok(view.experienceEvents?.some(item => item.id === penalty.id && isSilenceCinematic(item)));
for (const kind of ['random', 'skill', 'judgement', 'treasure'] as const) assert.ok(!isSilenceCinematic({ ...event, kind }));
assert.ok(!isSilenceCinematic({ ...event, environment: 'night' }));
const manifest = JSON.parse(readFileSync('public/cinematics/silence/v2/manifest.json', 'utf8'));
assert.equal(manifest.frames, 192);
assert.equal(manifest.assets.length, 4);
for (const portrait of [false, true]) {
  const film = silenceFilm(portrait);
  assert.equal(film.duration, manifest.durationSeconds);
  assert.equal(film.silence, manifest.silenceSeconds);
  assert.equal(film.title, manifest.titleSeconds);
  assert.equal(film.reveal, film.duration);
  assert.equal(film.tail, 800);
  assert.ok(film.src.includes(portrait ? 'portrait' : 'landscape'));
}
for (const asset of manifest.assets) {
  const data = readFileSync(`public/cinematics/silence/v2/${asset.file}`);
  assert.equal(data.length, asset.bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
}
console.log('Silence v2: actual card activation, deduplication, Host-only penalty, unchanged rule boundaries, snapshots, timing and media hashes passed.');
