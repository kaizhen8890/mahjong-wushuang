import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import data from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { specialCinematic, specialFilms } from '../lib/special-cinematic';
import { parseServerMessage, serializeWireMessage, LAN_PROTOCOL_VERSION } from '../lib/lan-protocol';
const cards = data.cards as SkillCard[];
for (const id of [42, 43, 44]) {
 const before = createGameState({ ...DEFAULT_SETTINGS, wushuang: true });
 const card = cards.find(c => c.id === id)!; const actor = before.players[0].id;
 const request = { kind: 'skill.activate' as const, input: { cardId: id, wushuangCostConfirmed: true, targetPlayerIds: [before.players[1].id], duration: 'hand' as const, faceDown: false, activationId: `film-${id}` } };
 const after = applyRemoteControllerCommand(before, cards, actor, request).nextGame;
 const event = after.experienceEvents!.at(-1)!;
 assert.equal(specialCinematic(event)?.name, card.name);
 assert.deepEqual(after.players.map(p => p.score), before.players.map(p => p.score));
 assert.equal(applyRemoteControllerCommand(after, cards, actor, request).changed, false);
 const snap = createControllerSnapshot(after, cards, { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: actor });
 assert.deepEqual(snap.experienceEvents!.at(-1), event);
 assert.equal(parseServerMessage(serializeWireMessage({ type: 'state.snapshot', protocol: LAN_PROTOCOL_VERSION, roomId: 'r', sentAt: Date.now(), snapshot: snap })).ok, true);
 for (const portrait of [false, true]) for (const film of specialFilms(event, portrait)) {
  assert.ok(existsSync('public' + film.src)); assert.ok(existsSync('public' + film.poster));
 }
 if (id === 44) {
  for (const face of [0, 1]) {
   const e = { ...event, random: { ...event.random!, faces: [face], total: face } };
   assert.equal(specialFilms(e, false)[1].src.includes(face ? 'heads' : 'tails'), true);
   assert.equal(specialCinematic({ ...e, random: { ...e.random, total: 9 } }), undefined);
  }
 } else assert.equal(specialFilms(event, false).length, 1);
}
console.log('Special cinematic activation, replay, projection and asset routes passed');
