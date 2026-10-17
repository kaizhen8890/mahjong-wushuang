import assert from 'node:assert/strict';
import cardsData from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { decideSkillCoin, randomRuleTemplate, type CoinDecision } from '../lib/skill-random';
import { finishSkillActivation, usesDecisionCoin } from '../lib/skill-experience';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import { createCommandRequest, LAN_PROTOCOL_VERSION, parseClientMessage, parseServerMessage, serializeWireMessage, type ControllerCommand } from '../lib/lan-protocol';
import { wushuangFilms, wushuangOutcome } from '../lib/wushuang-cinematic';
import { specialFilms } from '../lib/special-cinematic';

const cards = cardsData.cards as SkillCard[];
const fresh = () => createGameState({ ...DEFAULT_SETTINGS, wushuang: true });
const snapshot = (game: ReturnType<typeof fresh>, playerId = game.players[0].id, library = cards) => createControllerSnapshot(game, library, { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId });
const wireCommand = (game: ReturnType<typeof fresh>, command: ControllerCommand) => {
  const parsed = parseClientMessage(serializeWireMessage(createCommandRequest(snapshot(game), command)));
  assert.ok(parsed.ok, JSON.stringify(parsed));
  if (!parsed.ok || parsed.value.type !== 'command.request') throw new Error('No parsed command');
  return parsed.value.command;
};
const restoreWire = (game: ReturnType<typeof fresh>, library = cards) => {
  const parsed = parseServerMessage(serializeWireMessage({ protocol: LAN_PROTOCOL_VERSION, type: 'state.snapshot', sentAt: Date.now(), roomId: 'r', snapshot: snapshot(game, game.players[0].id, library) }));
  assert.ok(parsed.ok, JSON.stringify(parsed));
  if (!parsed.ok || parsed.value.type !== 'state.snapshot') throw new Error('No parsed snapshot');
  return parsed.value.snapshot;
};
const originalRandom = crypto.getRandomValues.bind(crypto);
let draws = 0;
for (const name of ['麻将无双', '听天问剑']) for (const decision of ['heads', 'tails', 'toss'] as CoinDecision[]) {
  const before = fresh(), card = cards.find(c => c.name === name)!, actor = before.players[0].id;
  assert.ok(usesDecisionCoin(card));
  const request: ControllerCommand = { kind: 'skill.activate', input: { cardId: card.id, wushuangCostConfirmed: true, targetPlayerIds: [before.players[1].id], duration: 'hand', faceDown: false, activationId: `${name}-${decision}`, coinDecision: decision } };
  const parsed = wireCommand(before, request);
  draws = 0;
  crypto.getRandomValues = ((array: Uint32Array) => { if (array instanceof Uint32Array && array.length === 1) { draws++; array.fill(1); return array; } return originalRandom(array); }) as typeof crypto.getRandomValues;
  let after;
  try { after = applyRemoteControllerCommand(before, cards, actor, parsed).nextGame; } finally { crypto.getRandomValues = originalRandom; }
  const event = after.experienceEvents!.at(-1)!, result = event.random!;
  assert.equal(result.faces[0], decision === 'tails' ? 0 : 1);
  assert.equal(result.source, decision === 'toss' ? undefined : 'manual');
  assert.equal(draws, decision === 'toss' ? 1 : 0, 'Only toss may call the random source');
  assert.deepEqual(after.players.map(p => p.score), before.players.map(p => p.score));
  assert.equal(after.riichiSticks, before.riichiSticks);
  assert.equal(after.players[0].usedSkillsThisTurn, before.players[0].usedSkillsThisTurn + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(restoreWire(after).experienceEvents!.at(-1)!.random)), result);
  for (const portrait of [false, true]) {
    const films = name === '麻将无双' ? wushuangFilms(wushuangOutcome(event)!, portrait, result.source === 'manual') : specialFilms(event, portrait);
    assert.equal(films.length, decision === 'toss' ? 2 : 1);
    assert.equal(films[0].src.includes('/wushuang-coin/'), decision === 'toss');
    assert.ok(films.at(-1)!.src.includes(decision === 'tails' ? 'tails' : 'heads'));
  }
  const restored = JSON.parse(JSON.stringify(after));
  assert.equal(applyRemoteControllerCommand(restored, cards, actor, request).changed, false);
  assert.equal(applyRemoteControllerCommand(restored, cards, actor, { ...request, input: { ...request.input, coinDecision: decision === 'tails' ? 'heads' : 'tails' } }).changed, false, 'A retry cannot change the accepted face');
  assert.deepEqual(finishSkillActivation(restored, after.effects.at(-1)!.id, card), restored);
  assert.equal(after.history.at(-1)!.title, decision === 'toss' ? '技能随机判定' : '技能硬币判定');
}
// Existing automatic calls remain valid; choices cannot be forged outside a single coin.
assert.throws(() => decideSkillCoin(randomRuleTemplate('dice'), 'heads'), /单枚硬币/);
assert.throws(() => decideSkillCoin(randomRuleTemplate('wheel'), 'heads'), /单枚硬币/);
const twoCoins = { ...randomRuleTemplate('coin'), count: 2 }; twoCoins.outcomes[0].values = [0, 1]; twoCoins.outcomes[1].values = [2];
assert.equal(usesDecisionCoin({ name: '双币', randomRule: twoCoins }), false); assert.throws(() => decideSkillCoin(twoCoins, 'heads'), /单枚硬币/);
assert.throws(() => decideSkillCoin(randomRuleTemplate('coin'), 'fake' as CoinDecision), /请选择/);
const before = fresh(), basic = cards.find(c => !usesDecisionCoin(c) && c.type.code === '单')!;
assert.throws(() => applyRemoteControllerCommand(before, cards, before.players[0].id, { kind: 'skill.activate', input: { cardId: basic.id, targetPlayerIds: [], duration: 'hand', faceDown: false, coinDecision: 'heads' } }), /硬币判定/);
const malformed = createCommandRequest(snapshot(before), { kind: 'skill.activate', input: { cardId: 41, targetPlayerIds: [], duration: 'hand', faceDown: false, coinDecision: 'heads' } });
assert.equal(parseClientMessage(JSON.stringify({ ...malformed, command: { ...malformed.command, input: { ...(malformed.command as any).input, coinDecision: 1 } } })).ok, false);
assert.equal(parseClientMessage(JSON.stringify({ ...malformed, protocol: 6 })).ok, false, 'An old Host must not silently replace a declaration with RNG');

// Hidden coin traps retain their captured rules; neither outcome nor prompt leaks.
const rule = randomRuleTemplate('coin');
rule.outcomes[0].effect = { kind: 'score', target: 'targets', amount: -1000, text: '扣一千' };
rule.outcomes[1].effect = { kind: 'score', target: 'actor', amount: 2000, text: '加两千' };
const trap: SkillCard = { ...cards[0], id: 10001, name: '实体硬币陷阱', type: { ...cards[0].type, code: '陷' }, randomRule: rule };
const actor = before.players[0].id, target = before.players[1].id;
const armedRequest: ControllerCommand = { kind: 'skill.activate', input: { cardId: trap.id, targetPlayerIds: [], duration: 'hand', faceDown: true, activationId: 'trap' } };
assert.throws(() => applyRemoteControllerCommand(before, [trap], actor, { ...armedRequest, input: { ...armedRequest.input, coinDecision: 'heads' } }), /揭示时/);
const armed = applyRemoteControllerCommand(before, [trap], actor, armedRequest).nextGame;
assert.equal(armed.effects[0].randomResult, undefined); assert.equal(armed.experienceEvents?.length ?? 0, 0);
assert.equal(snapshot(armed, target, [trap]).effects.length, 0);
assert.equal(restoreWire(armed, [trap]).effects[0].coinDecisionAvailable, true);
const edited = { ...trap, randomRule: randomRuleTemplate('dice') };
const reveal: ControllerCommand = { kind: 'skill.reveal', input: { effectId: armed.effects[0].id, targetPlayerIds: [target], coinDecision: 'tails' } };
const revealed = applyRemoteControllerCommand(armed, [edited], actor, wireCommand(armed, reveal)).nextGame;
assert.equal(revealed.players[1].score, before.players[1].score - 1000);
assert.equal(revealed.players[0].score, before.players[0].score);
assert.equal(revealed.effects[0].randomResult?.source, 'manual');
assert.throws(() => applyRemoteControllerCommand(armed, [trap], target, reveal), /自己/);
assert.throws(() => applyRemoteControllerCommand(revealed, [trap], actor, reveal), /自己/);
const plain = { ...trap, randomRule: undefined };
const plainArmed = applyRemoteControllerCommand(before, [plain], actor, armedRequest).nextGame;
assert.equal(snapshot(plainArmed, actor, [trap]).effects[0].coinDecisionAvailable, false, 'Editing must not introduce a coin into a captured plain trap');
console.log('PASS coin choice: manual faces use no RNG; toss uses Host RNG; wire, outcome films, effects, history, dedup/recovery, hidden traps, permissions and old-protocol rejection.');



