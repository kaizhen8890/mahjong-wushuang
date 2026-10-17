import assert from 'node:assert/strict';
import data from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { wushuangOutcome } from '../lib/wushuang-cinematic';
import { specialFilms } from '../lib/special-cinematic';
import { parseServerMessage, serializeWireMessage, LAN_PROTOCOL_VERSION } from '../lib/lan-protocol';
const cards = data.cards as SkillCard[];
const original = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
try {
  for (const face of [0, 1]) {
    Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: (words: Uint32Array) => { words.fill(face); return words; } });
    for (const id of [41, 42, 43, 44]) {
      const game = createGameState({ ...DEFAULT_SETTINGS, wushuang: true, teamsEnabled: true });
      const actor = game.players[0].id, target = game.players[1].id;
      const command = { kind: 'skill.activate' as const, input: { cardId: id, wushuangCostConfirmed: true, coinDecision: id === 41 ? 'toss' as const : undefined, targetPlayerIds: [target], duration: 'hand' as const, faceDown: false, activationId: `actual-${id}-${face}` } };
      const after = applyRemoteControllerCommand(game, cards, actor, command).nextGame;
      const event = after.experienceEvents!.at(-1)!;
      assert.ok(event, 'Actual bundled card must emit a cinematic event without an editor random rule');
      if (id === 41) {
        assert.equal(wushuangOutcome(event), face ? 'heads' : 'tails');
        assert.deepEqual(event.targets, [face ? actor : target]);
      }
      if (id === 42) assert.deepEqual(event.targets, game.players.filter(p => p.active && p.team === game.players[0].team).map(p => p.id));
      if (id === 43) assert.deepEqual(event.targets, [target]);
      if (id !== 41) assert.ok(specialFilms(event, false).at(-1)!.reveal < specialFilms(event, false).at(-1)!.duration);
      assert.deepEqual(after.players.map(p => p.score), game.players.map(p => p.score));
      assert.equal(applyRemoteControllerCommand(after, cards, actor, command).changed, false);
      const snapshot = createControllerSnapshot(after, cards, { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: actor });
      assert.deepEqual(snapshot.experienceEvents!.at(-1), event);
      assert.equal(parseServerMessage(serializeWireMessage({ type: 'state.snapshot', protocol: LAN_PROTOCOL_VERSION, roomId: 'r', sentAt: Date.now(), snapshot })).ok, true);
    }
  }
} finally {
  if (original) Object.defineProperty(crypto, 'getRandomValues', original);
  else Reflect.deleteProperty(crypto, 'getRandomValues');
}
console.log('Actual four god cards: both coin outcomes, targets, no replay or scoring mutation, snapshot and wire passed.');
