import assert from 'node:assert/strict';
import data from '../data/skill-cards.json';
import {
  createGameState,
  DEFAULT_SETTINGS,
  type GameState,
  type SkillCard,
} from '../lib/mahjong';
import { applyRemoteControllerCommand } from '../lib/remote-command';
import { correctWushuang, pendingWushuang } from '../lib/wushuang';
import { newWushuangGroup, type WushuangGroup } from '../lib/wushuang-session';
import { awardLastSurvivor } from '../lib/skill-experience';
import { createControllerSnapshot } from '../lib/controller-snapshot';
import {
  createCommandRequest,
  parseClientMessage,
  parseServerMessage,
  serializeWireMessage,
  LAN_PROTOCOL_VERSION,
  type ControllerCommand,
} from '../lib/lan-protocol';

const cards = data.cards as SkillCard[];
const fresh = () => ({
  ...createGameState(
    { ...DEFAULT_SETTINGS, startingSkillCards: 0 },
    cards.map((c) => c.id),
  ),
  honba: 2,
  riichiSticks: 2,
});
const seven = (): WushuangGroup => ({
  ...newWushuangGroup(),
  tiles: [
    '1m',
    '1m',
    '2m',
    '2m',
    '3p',
    '3p',
    '4p',
    '4p',
    '5s',
    '5s',
    '6s',
    '6s',
    '7z',
    '7z',
  ],
  winningTile: '7z',
});
const run = (g: GameState, c: ControllerCommand, actor = g.players[0].id) =>
  applyRemoteControllerCommand(g, cards, actor, c).nextGame;
const start = (
  g: GameState,
  face: 'heads' | 'tails' | 'toss' = 'heads',
  actor = g.players[0].id,
) =>
  run(
    g,
    {
      kind: 'skill.activate',
      input: {
        cardId: 41,
        coinDecision: face,
        wushuangCostConfirmed: true,
        activationId: 'test-activation',
        targetPlayerIds: face === 'tails' ? [g.players[1].id] : [],
        duration: 'hand',
        faceDown: false,
      },
    },
    actor,
  );
const session = (g: GameState) => g.effects.find((e) => e.wushuang)!.wushuang!;
const save = (g: GameState, groups: WushuangGroup[]) =>
  run(g, {
    kind: 'wushuang.update',
    effectId: session(g).effectId,
    revision: session(g).revision,
    groups,
    targetId: session(g).targetId,
  });
const commit = (g: GameState): ControllerCommand => ({
  kind: 'wushuang.commit',
  effectId: session(g).effectId,
  revision: session(g).revision,
  physicalTilesConfirmed: true,
  expectedDeposits: g.riichiSticks,
  expectedScore: g.players.find((p) => p.id === session(g).actorId)!.score,
});

const original = fresh();
const initial = start(original);
assert.deepEqual(
  initial.players.map((p) => p.score),
  original.players.map((p) => p.score),
);
assert.equal(initial.riichiSticks, 2);
assert.equal(pendingWushuang(initial).length, 1);
assert.equal(
  initial.history.filter((e) => e.title === '无双代价确认').length,
  1,
);
assert.throws(
  () =>
    run(original, {
      kind: 'skill.activate',
      input: {
        cardId: 41,
        activationId: 'bad',
        coinDecision: 'heads',
        targetPlayerIds: [],
        duration: 'hand',
        faceDown: false,
      },
    }),
  /代价/,
);
const ready = save(initial, [seven(), seven()]);
const ended = run(ready, commit(ready));
assert.equal(ended.players[0].score, 31800);
assert.deepEqual(
  ended.players.slice(1).map((p) => p.score),
  [25000, 25000, 25000],
);
assert.equal(session(ended).result!.points, 6800);
assert.deepEqual(session(ended).result!.groupPoints, [2400, 2400]);
assert.equal(ended.riichiSticks, 0);
assert.equal(ended.handEnded, true);
assert.equal(ended.dealerRepeat, true);
assert.equal(ended.honba, 3);
assert.equal(session(ended).status, 'settled');
assert.equal(pendingWushuang(ended).length, 0);
const restored = JSON.parse(JSON.stringify(ended));
assert.strictEqual(
  run(restored, commit(ready)),
  restored,
  'Saved receipt prevents a second payment even after restart',
);
assert.throws(
  () =>
    run(ready, {
      ...commit(ready),
      physicalTilesConfirmed: false,
    } as ControllerCommand),
  /实体牌/,
);
assert.throws(
  () => run({ ...ready, riichiSticks: 3 }, commit(ready)),
  /供托已变化/,
);
assert.throws(
  () => run(ready, { ...commit(ready), revision: 0 } as ControllerCommand),
  /另一端/,
);
assert.throws(() => save(ready, [...session(ready).groups, seven()]), /四张/);
assert.throws(() => run(ready, commit(ready), ready.players[1].id), /自己/);
assert.throws(
  () =>
    run(ready, {
      kind: 'effect.resolve-own',
      effectId: session(ready).effectId,
    }),
  /专属面板/,
);
assert.throws(() => save({ ...ready, handEnded: true }, [seven()]), /当前局/);

const nonDealerId = original.players[2].id;
const nonDealer = start(original, 'heads', nonDealerId);
const nonSession = session(nonDealer);
const ndReady = run(
  nonDealer,
  {
    kind: 'wushuang.update',
    effectId: nonSession.effectId,
    revision: 0,
    groups: [seven()],
  },
  nonDealerId,
);
const ndEnd = run(ndReady, commit(ndReady), nonDealerId);
assert.equal(ndEnd.players[2].score, 28600);
assert.equal(ndEnd.dealerRepeat, false);
assert.equal(ndEnd.honba, 0);

const tail = start(fresh(), 'tails'),
  tailEnd = run(tail, commit(tail));
assert.deepEqual(
  tailEnd.players.map((p) => p.score),
  [63000, -11000, 25000, 25000],
);
assert.equal(tailEnd.players[0].participation, 'won');
assert.equal(tailEnd.players[0].active, false);
assert.equal(tailEnd.handEnded, false);
assert.equal(tailEnd.turnIndex, 1);
assert.equal(tailEnd.riichiSticks, 0);
assert.equal(tailEnd.honba, 2);
assert.strictEqual(run(tailEnd, commit(tail)), tailEnd);
for (const targetId of [tail.players[0].id, tail.players[2].id, 'missing'])
  assert.throws(
    () =>
      run(tail, {
        kind: 'wushuang.update',
        effectId: session(tail).effectId,
        revision: 0,
        groups: [],
        targetId,
      }),
    /敌方/,
  );
const targetGone = {
  ...tail,
  players: tail.players.map((p, i) =>
    i === 1 ? { ...p, active: false, participation: 'won' as const } : p,
  ),
};
assert.throws(() => run(targetGone, commit(tail)), /目标已变化/);
const two = {
  ...tail,
  players: tail.players.map((p, i) =>
    i > 1 ? { ...p, active: false, participation: 'won' as const } : p,
  ),
  effects: [
    ...tail.effects,
    {
      id: 'witch',
      cardId: 9,
      cardName: '魔女审判',
      ownerId: tail.players[1].id,
      faceDown: false,
      status: 'active' as const,
      scope: 'table' as const,
      environment: { kind: 'witch' as const },
    },
  ],
};
const protectedEnd = awardLastSurvivor(two, run(two, commit(two)));
assert.equal(protectedEnd.handEnded, true);
assert.equal(
  protectedEnd.players[1].score,
  -11000,
  'No last-survivor reward may modify this skill settlement',
);

const corrected = correctWushuang(ready, session(ready).effectId, 'tails');
assert.equal(session(corrected).face, 'tails');
assert.equal(session(corrected).groups.length, 0);
assert.equal(session(corrected).revision, 2);
assert.deepEqual(
  corrected.players.map((p) => p.score),
  ready.players.map((p) => p.score),
);
assert.equal(corrected.players[0].usedSkillsThisTurn, 1);
assert.equal(corrected.history.at(-1)!.title, '无双币面修正');
const tossed = start(fresh(), 'toss');
assert.throws(
  () => correctWushuang(tossed, session(tossed).effectId, 'heads'),
  /随机结果/,
);
assert.throws(
  () => correctWushuang(ended, session(ended).effectId, 'tails'),
  /已经入账/,
);

const snapshot = (g: GameState, playerId = g.players[0].id) =>
  createControllerSnapshot(g, cards, {
    roomId: 'room',
    matchId: 'match',
    handId: 'hand',
    revision: 3,
    playerId,
  });
const own = snapshot(ready),
  other = snapshot(ready, ready.players[1].id);
assert.equal(own.wushuangSessions!.length, 1);
assert.equal(other.wushuangSessions!.length, 0);
assert.ok(
  !JSON.stringify(other).includes(session(ready).groups[0].id),
  'Other phones must never receive these hand-entry drafts',
);
assert.ok(!JSON.stringify(other).includes('skillHand'));
const wire = serializeWireMessage({
  type: 'state.snapshot',
  protocol: LAN_PROTOCOL_VERSION,
  roomId: 'room',
  sentAt: Date.now(),
  snapshot: own,
});
const parsed = parseServerMessage(wire);
assert.ok(parsed.ok, JSON.stringify(parsed));
if (parsed.ok && parsed.value.type === 'state.snapshot')
  assert.deepEqual(
    parsed.value.snapshot.wushuangSessions,
    own.wushuangSessions,
  );
const commandFrame = createCommandRequest(own, commit(ready));
assert.equal(parseClientMessage(serializeWireMessage(commandFrame)).ok, true);
assert.equal(
  parseClientMessage(JSON.stringify({ ...commandFrame, protocol: 7 })).ok,
  false,
);
assert.equal(
  parseClientMessage(
    JSON.stringify({
      ...commandFrame,
      command: { ...commit(ready), expectedDeposits: 2.5 },
    }),
  ).ok,
  false,
);
assert.throws(() => save(initial, [{ ...seven(), dora: Infinity }]), /无效/);
assert.throws(
  () => save(initial, [{ ...seven(), selected: ['riichi'] }]),
  /现场役/,
);
assert.throws(
  () =>
    save(initial, [
      { ...seven(), mode: 'manual', selected: ['honitsu', 'chinitsu'], fu: 30 },
    ]),
  /高低位/,
);
assert.throws(
  () =>
    save(initial, [
      { ...seven(), mode: 'manual', selected: ['chiitoi'], fu: 30 },
    ]),
  /25 符/,
);
const redSeven = {
  ...seven(),
  tiles: seven().tiles.map((t, i) => (i === 8 ? '0s' : t)),
};
assert.throws(() => save(initial, [redSeven]), /赤宝牌/);
const redReady = save(initial, [{ ...redSeven, dora: 1 }]);
assert.equal(
  session(run(redReady, commit(redReady))).result!.groupPoints[0],
  4800,
);
console.log(
  'PASS wushuang: atomic heads/tails, dealer/non-dealer, deposits once, immutable toss, Host correction, revision conflicts, target legality, duplicate physical tiles, restart idempotency, skill immunity, seat-private snapshots and wire validation.',
);
