import {
  addEvent,
  nextActiveIndex,
  stopTurnClock,
  YAKU,
  type GameState,
  type ActiveSkillEffect,
} from './mahjong';
import { recordWin } from './presentation';
import { decideSkillCoin, randomRuleTemplate } from './skill-random';
import {
  validateWushuangGroups,
  type WushuangCommand,
  type WushuangSession,
} from './wushuang-session';

export const pendingWushuang = (game: GameState) =>
  game.effects.filter(
    (e) =>
      e.wushuang?.status === 'pending' &&
      e.state !== 'resolved' &&
      e.status !== 'resolved',
  );
function ownedSession(game: GameState, actorId: string, effectId: string) {
  const effect = game.effects.find(
    (e) =>
      e.id === effectId &&
      e.ownerId === actorId &&
      e.wushuang?.actorId === actorId,
  );
  if (!effect?.wushuang) throw Error('只能处理自己已发动的麻将无双');
  return effect as ActiveSkillEffect & { wushuang: WushuangSession };
}
function ensurePending(
  game: GameState,
  effect: ActiveSkillEffect & { wushuang: WushuangSession },
  revision: number,
) {
  if (effect.wushuang.status !== 'pending') throw Error('本次无双已经入账');
  if (
    effect.state === 'resolved' ||
    effect.status === 'resolved' ||
    game.handEnded
  )
    throw Error('本次无双已不在当前局中');
  const actor = game.players.find((p) => p.id === effect.ownerId);
  if (!actor?.active || actor.participation !== 'playing')
    throw Error('使用者已退出本局，请由牌桌核对');
  if (
    actor.wind !== effect.wushuang.seatWind ||
    game.roundWind !== effect.wushuang.roundWind
  )
    throw Error('座次或场风已改变，请由牌桌核对本次技能');
  if (revision !== effect.wushuang.revision)
    throw Error('牌组已被另一端修改，请查看最新内容后重试');
}
/** One atomic ledger entry. The Host derives every point from the saved groups. */
export function settleWushuang(
  game: GameState,
  actorId: string,
  command: Extract<WushuangCommand, { kind: 'wushuang.commit' }>,
): GameState {
  const effect = ownedSession(game, actorId, command.effectId),
    session = effect.wushuang;
  if (session.status === 'settled') return game;
  ensurePending(game, effect, command.revision);
  const actor = game.players.find((p) => p.id === actorId)!;
  if (
    command.expectedDeposits !== game.riichiSticks ||
    command.expectedScore !== actor.score
  )
    throw Error('分数或供托已变化，请核对更新后的预览再确认');
  const heads = session.face === 'heads';
  if (
    heads &&
    (!session.groups.length || command.physicalTilesConfirmed !== true)
  )
    throw Error('请先保存和牌组，并一次核对实体牌不重复使用');
  if (!heads && !isWushuangTarget(game, actorId, session.targetId))
    throw Error('目标已变化，请重新选择仍在局中的敌方');
  const results = heads ? validateWushuangGroups(session, session.groups) : [];
  const points = heads
    ? results.reduce((n, r) => n + r.points, 0)
    : session.seatWind === '东'
      ? 36000
      : 24000;
  const deposits = game.riichiSticks,
    gain = points + deposits * 1000;
  const deltas: Record<string, number> = { [actorId]: gain };
  if (!heads) deltas[session.targetId!] = -points;
  let players = game.players.map((p) => ({
    ...p,
    score: p.score + (deltas[p.id] ?? 0),
    ...(p.id === actorId
      ? { active: false, participation: 'won' as const, riichi: false }
      : {}),
  }));
  if (
    players.some(
      (p) =>
        !Number.isSafeInteger(p.score) || Math.abs(p.score) > 1_000_000_000,
    )
  )
    throw Error('点数超出可保存范围');
  const ended =
    heads ||
    players.filter((p) => p.active && p.participation === 'playing').length <=
      1;
  if (ended) players = players.map((p) => ({ ...p, riichi: false }));
  const currentActor = game.players[game.turnIndex]?.id === actorId;
  const nextSession: WushuangSession = {
    ...session,
    status: 'settled',
    revision: session.revision + 1,
    result: {
      points: gain,
      deposits,
      groupPoints: results.map((r) => r.points),
      settledAt: new Date().toISOString(),
    },
  };
  const detail = heads
    ? `${actor.name}正面合计 ${points} 点；${results.map((r, i) => `第${i + 1}组 ${r.yakuman ? `${r.yakuman}倍役满` : `${r.han + session.groups[i].dora}番${r.fu}符`} ${r.points}点（${r.yaku.map((id) => YAKU.find((y) => y.id === id)?.name ?? id).join('、')}）`).join('；')}`
    : `${actor.name}反面固定三倍满，${game.players.find((p) => p.id === session.targetId)?.name}支付 ${points} 点`;
  const summary = `${detail}；供托一次领取 ${deposits * 1000} 点，本场加点不计，其他技能不修正。${ended ? '本局结束，整场保留' : '其余玩家继续本局'}`;
  const clock = ended || currentActor ? stopTurnClock(game) : game;
  let next: GameState = {
    ...clock,
    players,
    handEnded: ended,
    riichiSticks: 0,
    turnIndex:
      !ended && currentActor
        ? nextActiveIndex(players, game.turnIndex)
        : game.turnIndex,
    phase: !ended && currentActor ? 'skill' : game.phase,
    dealerRepeat: heads ? actor.wind === '东' : game.dealerRepeat,
    honba: heads ? (actor.wind === '东' ? game.honba + 1 : 0) : game.honba,
    effects: game.effects.map((e) =>
      e.id === effect.id
        ? { ...e, wushuang: nextSession, status: 'resolved', state: 'resolved' }
        : e,
    ),
  };
  next = addEvent(next, '麻将无双结算', summary, deltas);
  return recordWin(
    game,
    next,
    {
      winnerId: actorId,
      loserId: heads ? undefined : session.targetId,
      winType: 'ron',
      han: heads ? 0 : 11,
      fu: 30,
      yakuman: 0,
      honba: 0,
      riichiSticks: deposits,
      dealer: actor.wind === '东',
      playerCount: game.settings.playerCount,
      kiriageMangan: session.rules.kiriageMangan,
      kazoeYakuman: session.rules.kazoeYakuman,
      sanmaTsumoLoss: game.settings.sanmaTsumoLoss,
    },
    {
      label: heads ? '无双结算' : '三倍满',
      basePoints: heads ? 0 : 6000,
      winnerGain: gain,
      payments: heads ? {} : { [session.targetId!]: points },
      summary,
    },
    heads
      ? [`${results.length} 组和牌 · 实体牌不重复`]
      : ['麻将无双 · 指定荣和'],
  );
}
export function isWushuangTarget(
  game: GameState,
  actorId: string,
  targetId?: string,
) {
  const actor = game.players.find((p) => p.id === actorId),
    target = game.players.find((p) => p.id === targetId);
  return Boolean(
    actor &&
    target &&
    target.id !== actorId &&
    target.active &&
    target.participation === 'playing' &&
    (!game.settings.teamsEnabled || target.team !== actor.team),
  );
}
export function startWushuangSession(
  game: GameState,
  effectId: string,
  activationId: string,
): GameState {
  const effect = game.effects.find((e) => e.id === effectId)!,
    actor = game.players.find((p) => p.id === effect.ownerId)!;
  if (effect.wushuang) return game;
  const random = effect.randomResult;
  if (
    random?.kind !== 'coin' ||
    random.faces.length !== 1 ||
    ![0, 1].includes(random.faces[0])
  )
    throw Error('麻将无双需要有效的单枚硬币结果');
  const { playerCount, akaDora, openTanyao, kiriageMangan, kazoeYakuman } =
    game.settings;
  const session: WushuangSession = {
    effectId,
    actorId: actor.id,
    activationId,
    face: random.faces[0] === 1 ? 'heads' : 'tails',
    source: random.source === 'manual' ? 'manual' : 'toss',
    revision: 0,
    status: 'pending',
    groups: [],
    targetId: isWushuangTarget(game, actor.id, effect.targetId)
      ? effect.targetId
      : undefined,
    seatWind: actor.wind,
    roundWind: game.roundWind,
    rules: { playerCount, akaDora, openTanyao, kiriageMangan, kazoeYakuman },
  };
  return {
    ...game,
    effects: game.effects.map((e) =>
      e.id === effectId ? { ...e, wushuang: session, duration: 'hand' } : e,
    ),
  };
}
export function updateWushuang(
  game: GameState,
  actorId: string,
  command: Extract<WushuangCommand, { kind: 'wushuang.update' }>,
): GameState {
  const effect = ownedSession(game, actorId, command.effectId);
  ensurePending(game, effect, command.revision);
  if (effect.wushuang.face === 'tails' && command.groups.length)
    throw Error('反面无需录入牌组');
  validateWushuangGroups(effect.wushuang, command.groups);
  if (command.targetId && !isWushuangTarget(game, actorId, command.targetId))
    throw Error('请选择一名仍在局中的敌方');
  const session = {
    ...effect.wushuang,
    revision: effect.wushuang.revision + 1,
    groups: command.groups.map((g) => ({
      ...g,
      tiles: [...g.tiles],
      selected: [...g.selected],
    })),
    targetId: command.targetId,
  };
  return {
    ...game,
    effects: game.effects.map((e) =>
      e.id === effect.id ? { ...e, wushuang: session } : e,
    ),
  };
}
/** Host correction only: deliberately absent from the remote command union. */
export function correctWushuang(
  game: GameState,
  effectId: string,
  face: 'heads' | 'tails',
): GameState {
  const source = game.effects.find((e) => e.id === effectId);
  if (!source) throw Error('找不到本次技能');
  const effect = ownedSession(game, source.ownerId, effectId);
  ensurePending(game, effect, effect.wushuang.revision);
  if (effect.wushuang.source !== 'manual')
    throw Error('游戏内随机结果不能重掷或改面');
  if (!['heads', 'tails'].includes(face)) throw Error('币面无效');
  if (effect.wushuang.face === face) return game;
  const randomResult = decideSkillCoin(randomRuleTemplate('coin'), face).result;
  const session: WushuangSession = {
    ...effect.wushuang,
    face,
    revision: effect.wushuang.revision + 1,
    groups: [],
    targetId: undefined,
  };
  return addEvent(
    {
      ...game,
      effects: game.effects.map((e) =>
        e.id === effect.id
          ? {
              ...e,
              randomResult,
              wushuang: session,
              targetId: undefined,
              targetPlayerIds: [],
              affectedPlayerIds: [],
              effectText: `麻将无双 · 主机修正为${face === 'heads' ? '正面' : '反面'}，待结算`,
            }
          : e,
      ),
    },
    '无双币面修正',
    `主机将实体硬币记录修正为${face === 'heads' ? '正面' : '反面'}；原牌组与目标已清除，代价不重复支付`,
  );
}
