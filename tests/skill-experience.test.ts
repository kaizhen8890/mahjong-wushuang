import assert from 'node:assert/strict';
import cardsData from '../data/skill-cards.json';
import { createGameState, DEFAULT_SETTINGS, type SkillCard } from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { activeEnvironment, applyEnvironmentAction, awardLastSurvivor, environmentBonus, finishSkillActivation } from '../lib/skill-experience';
import { createControllerSnapshot, createControllerSkillCatalog, createSkillCatalogRevision } from '../lib/controller-snapshot';
import { randomRuleTemplate, readRandomRule, rollSkill } from '../lib/skill-random';
import { LAN_PROTOCOL_VERSION, serializeWireMessage, parseServerMessage } from '../lib/lan-protocol';
const cards = cardsData.cards as SkillCard[];
const fresh = () => createGameState({ ...DEFAULT_SETTINGS, wushuang: true, teamsEnabled: true, bloodBattle: true }, cards.map(c => c.id));
let game = fresh(); const [a,b,c,d] = game.players.map(p => p.id);
const activate = (id: number, options = {}, state = fresh()) => applyRemoteControllerCommand(state, cards, a, { kind: 'skill.activate', input: { cardId: id, targetPlayerIds: [], duration: 'match', faceDown: false, environment: options, activationId: `activation-${id}` } }).nextGame;
game = activate(9);
let env = activeEnvironment(game)!;
const judge = (targetId: string, state = game) => applyRemoteControllerCommand(state, cards, a, { kind: 'environment.action', effectId: env.effectId, action: 'judge', targetId, confirmed: true }).nextGame;
assert.throws(() => judge(c), /敌方/);
assert.throws(() => applyEnvironmentAction(game, a, { kind: 'environment.action', effectId: env.effectId, action: 'judge', targetId: b, confirmed: false }));
game = judge(b); assert.equal(game.players[1].eliminationScope, 'hand');
for (const command of [{ kind: 'draw.confirm', turnStartedAt: game.turnStartedAt }, { kind: 'riichi.declare' }, { kind: 'skill.reveal', input: { effectId: 'x', targetPlayerIds: [a] } }] as const) assert.throws(() => applyRemoteControllerCommand(game, cards, b, command as any));
assert.throws(() => judge(b));
// The last unwon seat receives an outside reward once, including after another seat wins.
const before = { ...game, players: game.players.map(p => p.id === c ? { ...p, active: false, participation: 'won' as const } : p) };
game = judge(d, before); assert.equal(game.players[0].score, before.players[0].score + 4000); assert.equal(game.handEnded, true);
assert.equal(awardLastSurvivor(before, game).players[0].score, game.players[0].score);
assert.equal(game.history.filter(e => e.title === '魔女审判 · 最后幸存者').length, 1);
let silent = activate(11); env = activeEnvironment(silent)!;
const penalty = { kind: 'environment.action' as const, effectId: env.effectId, action: 'penalty' as const, targetId: b, confirmed: true };
assert.throws(() => applyEnvironmentAction(silent, a, penalty), /平板/);
assert.throws(() => applyRemoteControllerCommand(silent, cards, a, { kind: 'emote.send', emoteId: '1000' }), /寂静/);
const fined = applyEnvironmentAction(silent, a, penalty, true);
assert.equal(fined.players[1].score, silent.players[1].score - 3000); assert.equal(fined.riichiSticks, silent.riichiSticks);
assert.equal(fined.players.reduce((s,p) => s+p.score,0), silent.players.reduce((s,p) => s+p.score,0) - 3000);
const treasure = activate(12); env = activeEnvironment(treasure)!;
const turn = { kind: 'environment.action' as const, effectId: env.effectId, action: 'treasure' as const, confirmed: true };
assert.throws(() => applyEnvironmentAction(treasure, b, turn));
const opened = applyEnvironmentAction(treasure, a, turn); assert.equal(activeEnvironment(opened)?.confirmed, true); assert.throws(() => applyEnvironmentAction(opened, a, turn));
const night = activate(10); assert.equal(activeEnvironment(night)?.kind, 'night');
assert.throws(() => applyRemoteControllerCommand(night, cards, a, { kind: 'emote.send', emoteId: '1000' }), /暗夜/);
const replaced = activate(11, {}, night); assert.equal(activeEnvironment(replaced)?.kind, 'silence');
assert.equal(replaced.effects.filter(e => e.state !== 'resolved').length, 1); assert.equal(activeEnvironment({ ...night, handEnded: true }), undefined);
assert.throws(() => activate(13)); assert.throws(() => activate(13, { yakuId: 'kokushi' })); assert.throws(() => activate(14, { number: 10 }));
const yaku = activate(13, { yakuId: 'riichi' }); assert.equal(environmentBonus(yaku, ['riichi'], true).overrideId, 'riichi'); assert.equal(environmentBonus(yaku, ['riichi'], false).overrideId, undefined);
const number = activate(14, { number: 5 }); assert.equal(environmentBonus(number, [], true, 5).dora, 2); assert.equal(environmentBonus(night, [], true, 5).dora, 0);
const draft = { winType: 'ron' as const, loserPlayerId: b, tiles: [], closed: true, fu: 30, selectedYakuIds: ['riichi'], yakuOverrides: {}, dora: 0, uraDora: 0, akaDora: 0, flowerDora: 0, bonusHan: 0, extraPoints: 0 };
assert.equal(applyRemoteControllerCommand(yaku, cards, a, { kind: 'win.preview', draft }).preview?.label, '满贯');
assert.equal(applyRemoteControllerCommand(number, cards, a, { kind: 'win.preview', draft: { ...draft, environmentNumberCount: 4 } }).preview?.label, '3 番 30 符');
// Hidden random traps must not roll, broadcast their card, or leak a configured outcome.
const rule = randomRuleTemplate('coin'); rule.outcomes.forEach(o => { o.effect = { kind: 'score', target: 'actor', amount: 1000, text: '加点' }; });
const card = { ...cards[0], id: 100, randomRule: rule };
const request = { kind: 'skill.activate' as const, input: { cardId: 100, targetPlayerIds: [], duration: 'hand' as const, faceDown: true, activationId: 'one' } };
let trapped = applyRemoteControllerCommand(fresh(), [card], a, request).nextGame;
assert.equal(trapped.experienceEvents?.length ?? 0, 0); assert.equal(trapped.effects[0].randomResult, undefined);
assert.equal(createControllerSnapshot(trapped, [card], { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: b }).effects.length, 0);
trapped = applyRemoteControllerCommand(trapped, [card], a, { kind: 'skill.reveal', input: { effectId: trapped.effects[0].id, targetPlayerIds: [b] } }).nextGame;
assert.equal(trapped.players[0].score, fresh().players[0].score + 1000);
const restored = JSON.parse(JSON.stringify(trapped));
assert.equal(finishSkillActivation(restored, trapped.effects[0].id, card).players[0].score, trapped.players[0].score);
assert.equal(applyRemoteControllerCommand(restored, [card], a, request).changed, false);
// Later editing must neither introduce a random rule into an already armed ordinary trap,
// nor replace the rule captured when a random trap was armed.
const plainCard = { ...cards[0], id: 101, randomRule: undefined };
const plain = applyRemoteControllerCommand(fresh(), [plainCard], a, { ...request, input: { ...request.input, cardId: 101 } }).nextGame;
assert.equal(plain.effects[0].randomRule, null);
const editedPlain = applyRemoteControllerCommand(plain, [{ ...plainCard, randomRule: rule }], a, { kind: 'skill.reveal', input: { effectId: plain.effects[0].id, targetPlayerIds: [b] } }).nextGame;
assert.equal(editedPlain.effects[0].randomResult, undefined);
assert.equal(editedPlain.players[0].score, fresh().players[0].score);
const armed = applyRemoteControllerCommand(fresh(), [card], a, request).nextGame;
const changedRule = structuredClone(rule); changedRule.outcomes.forEach(o => { o.effect.amount = 9000; });
const revealedCaptured = applyRemoteControllerCommand(armed, [{ ...card, randomRule: changedRule }], a, { kind: 'skill.reveal', input: { effectId: armed.effects[0].id, targetPlayerIds: [b] } }).nextGame;
assert.equal(revealedCaptured.players[0].score, fresh().players[0].score + 1000);

assert.notEqual(createSkillCatalogRevision([card]), createSkillCatalogRevision([{ ...card, randomRule: undefined }])); assert.ok(createControllerSkillCatalog([card])[0].randomRule);
const snap = createControllerSnapshot(trapped, [card], { roomId: 'r', matchId: 'm', handId: 'h', revision: 1, playerId: b });
const parsed = parseServerMessage(serializeWireMessage({ type: 'state.snapshot', protocol: LAN_PROTOCOL_VERSION, roomId: 'r', sentAt: Date.now(), snapshot: snap } as any)); assert.equal(parsed.ok, true);
for (const kind of ['coin','dice','wheel'] as const) {
 const template = randomRuleTemplate(kind); assert.equal(readRandomRule(template).kind, kind);
 assert.equal(rollSkill(template, () => 0).result.outcomeId, template.outcomes[0].id);
 assert.equal(rollSkill(template, n => n-1).result.outcomeId, template.outcomes.at(-1)!.id);
}
assert.throws(() => readRandomRule({ ...rule, count: 2 }), /尚未指定/);
const duplicated = structuredClone(rule); duplicated.outcomes[1].values = [0]; assert.throws(() => readRandomRule(duplicated), /重复/);
console.log('PASS skill experience: six environments, host-only outside penalty, enemy/hand elimination, one reward, score bonuses, hidden traps, random dedup/recovery, weighted outcomes and private wire.');


