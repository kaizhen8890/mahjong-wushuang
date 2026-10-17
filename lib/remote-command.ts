import { godCardCost } from './god-card-cost';
import { readRandomRule, randomRuleTemplate } from './skill-random';
import { isWushuangCard } from './wushuang-session';
import { pendingWushuang, startWushuangSession, updateWushuang, settleWushuang, isWushuangTarget } from './wushuang';
import { recordWin } from './presentation';
import { activeEnvironment, applyEnvironmentAction, makeEnvironment, usesDecisionCoin, finishSkillActivation, environmentBonus, awardLastSurvivor } from './skill-experience';
import {
  YAKU,
  addEvent,
  calculateSettlement,
  nextActiveIndex,
  startTurnClock,
  stopTurnClock,
  type ActiveSkillEffect,
  type GameState,
  type SettlementInput,
  type SettlementResult,
  type SkillCard,
} from '@/lib/mahjong';
import { GAME_EMOTES_BY_ID } from '@/lib/emotes';
import { characterChoice, validCharacterChoice } from '@/lib/characters';
import { assessHandInput } from '@/lib/hand-analysis';
import {
  createProtocolId,
  type ControllerCommand,
  type ControllerNotification,
  type RemoteWinDraft,
  type RequestErrorCode,
  type ScorePreview,
} from '@/lib/lan-protocol';

export interface RemoteNotificationDelivery {
  playerId: string;
  notification: ControllerNotification;
}

export interface RemoteCommandOutcome {
  nextGame: GameState;
  changed: boolean;
  message: string;
  preview?: ScorePreview;
  notifications: RemoteNotificationDelivery[];
  realtimeEvent?: {
    kind: 'emote' | 'draw';
    actorPlayerId: string;
    actorName: string;
    emoteId?: string;
  };
}

export class RemoteCommandError extends Error {
  constructor(
    readonly code: RequestErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const DURATION_LABELS = {
  once: '单次结算',
  hand: '本局有效',
  match: '整场有效',
  manual: '手动解除',
} as const;

function isLiveEffect(effect: ActiveSkillEffect) {
  return effect.state !== 'resolved' && effect.status !== 'resolved';
}

function effectSourceId(effect: ActiveSkillEffect) {
  return effect.sourcePlayerId || effect.ownerId;
}

function effectTargets(effect: ActiveSkillEffect) {
  if (effect.affectedPlayerIds?.length) return effect.affectedPlayerIds;
  if (effect.targetPlayerIds?.length) return effect.targetPlayerIds;
  return effect.targetId ? [effect.targetId] : [];
}

function makeNotice(
  eventId: string,
  title: string,
  body: string,
  requiresAck: boolean,
  sourceLabel?: string,
  effectId?: string,
  durationLabel?: string,
): ControllerNotification {
  return {
    notificationId: createProtocolId('notice'),
    eventId,
    kind: effectId ? 'skill-affected' : 'score-changed',
    title,
    body,
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(effectId ? { effectId } : {}),
    ...(durationLabel ? { durationLabel } : {}),
    requiresAck,
    createdAt: new Date().toISOString(),
  };
}

function skillNotices(
  game: GameState,
  actorId: string,
  effect: ActiveSkillEffect,
  hidden: boolean,
): RemoteNotificationDelivery[] {
  const actor = game.players.find((player) => player.id === actorId);
  if (!actor) return [];
  const targets = new Set(effect.scope === 'table' ? game.players.map((player) => player.id) : effectTargets(effect));
  const eventId = createProtocolId('event');
  if (hidden) {
    return [{
      playerId: actorId,
      notification: makeNotice(eventId, '陷阱已暗置', '只有你能看到这张暗置记录；触发时再揭示并选择目标。', false),
    }];
  }
  return game.players.map((player) => {
    const affected = targets.has(player.id) && player.id !== actorId;
    return {
      playerId: player.id,
      notification: makeNotice(
        eventId,
        affected ? `你受到「${effect.cardName || '技能'}」影响` : `${actor.wind}家发动「${effect.cardName || '技能'}」`,
        effect.effectText || '请按实体技能卡说明执行。',
        affected,
        `${actor.wind}家 · ${actor.name}`,
        effect.id,
        DURATION_LABELS[effect.duration ?? 'hand'],
      ),
    };
  });
}

function validateWinDraft(game: GameState, actorId: string, draft: RemoteWinDraft) {
  const actor = game.players.find((player) => player.id === actorId);
  if (!actor || !actor.active || actor.participation !== 'playing') {
    throw new RemoteCommandError('NOT_ALLOWED', '该玩家当前不能和牌');
  }
  if (game.handEnded) throw new RemoteCommandError('HAND_CHANGED', '本局已经结算');
  if (draft.winType === 'ron') {
    const loser = game.players.find((player) => player.id === draft.loserPlayerId);
    if (!loser || loser.id === actorId || !loser.active) {
      throw new RemoteCommandError('INVALID_TARGET', '请选择仍在本局中的放铳者');
    }
  }

  if (draft.analysis?.automatic && draft.tiles.length) {
    const bonus = environmentBonus(game, draft.selectedYakuIds, draft.closed, draft.environmentNumberCount ?? 0);
    const envYaku = activeEnvironment(game);
    const adjusted = envYaku?.kind === 'yaku' && envYaku.yakuId ? { ...draft.yakuOverrides, [envYaku.yakuId]: 5 } : draft.yakuOverrides;
    const result = assessHandInput({tiles:draft.tiles,winningTile:draft.analysis.winningTile,meldText:draft.analysis.meldText,closed:draft.closed,winType:draft.winType,seatWind:actor.wind,roundWind:game.roundWind,selected:draft.selectedYakuIds,bonusHan:draft.dora+draft.uraDora+draft.akaDora+draft.flowerDora+draft.bonusHan+bonus.dora,overrides:adjusted,openTanyao:game.settings.openTanyao,kiriage:game.settings.kiriageMangan,kazoe:game.settings.kazoeYakuman});
    if(result.status==='invalid') throw new RemoteCommandError('INVALID_PAYLOAD',result.guidance);
    if(result.status==='ready' && result.best) draft = {...draft,selectedYakuIds:result.best.yaku,fu:result.best.fu};
  }
  const selected = draft.selectedYakuIds.map((id) => {
    const yaku = YAKU.find((entry) => entry.id === id);
    if (!yaku) throw new RemoteCommandError('INVALID_PAYLOAD', `未知役种：${id}`);
    const invalidOpen = !draft.closed && !yaku.yakuman && (yaku.openHan === 0 || (yaku.id === 'tanyao' && !game.settings.openTanyao));
    const invalidWinType =
      (['menzen-tsumo', 'haitei', 'rinshan'].includes(yaku.id) && draft.winType !== 'tsumo') ||
      (['houtei', 'chankan'].includes(yaku.id) && draft.winType !== 'ron');
    if (invalidOpen || invalidWinType) throw new RemoteCommandError('INVALID_PAYLOAD', `当前条件不能使用「${yaku.name}」`);
    return yaku;
  });
  const yakuman = selected.reduce((sum, yaku) => sum + (yaku.yakuman ?? 0), 0);
  const environment = environmentBonus(game, draft.selectedYakuIds, draft.closed, draft.environmentNumberCount ?? 0);
  const yakuHan = selected.reduce((sum, yaku) => {
    if (yaku.yakuman) return sum;
    return sum + (environment.overrideId === yaku.id ? 5 : draft.yakuOverrides[yaku.id] ?? (draft.closed ? yaku.closedHan : yaku.openHan));
  }, 0);
  if (yakuman === 0 && yakuHan + draft.bonusHan <= 0) {
    throw new RemoteCommandError('INVALID_PAYLOAD', '仅有宝牌不能和牌，请至少选择一个役或填写技能加番');
  }
  const han = yakuHan + draft.dora + draft.uraDora + draft.akaDora + draft.flowerDora + draft.bonusHan + environment.dora;
  const input: SettlementInput = {
    winnerId: actorId,
    ...(draft.winType === 'ron' ? { loserId: draft.loserPlayerId } : {}),
    winType: draft.winType,
    han,
    fu: draft.fu,
    yakuman,
    honba: game.honba,
    riichiSticks: game.riichiSticks,
    dealer: actor.wind === '东',
    playerCount: game.settings.playerCount,
    kiriageMangan: game.settings.kiriageMangan,
    kazoeYakuman: game.settings.kazoeYakuman,
    sanmaTsumoLoss: game.settings.sanmaTsumoLoss,
    teamsEnabled: game.settings.teamsEnabled,
    extraPoints: draft.extraPoints,
  };
  return { input, result: calculateSettlement(input, game.players), han, yakuman, yakuNames: selected.map(yaku => yaku.name), tiles: draft.tiles };
}

function applySettlement(state: GameState, input: SettlementInput, result: SettlementResult) {
  state = stopTurnClock(state);
  const deltas: Record<string, number> = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  for (const [payerId, payment] of Object.entries(result.payments)) deltas[payerId] = (deltas[payerId] ?? 0) - payment;
  deltas[input.winnerId] = (deltas[input.winnerId] ?? 0) + result.winnerGain;
  let players = state.players.map((player) => ({
    ...player,
    score: player.score + (deltas[player.id] ?? 0),
    riichi: state.settings.bloodBattle && player.id !== input.winnerId ? player.riichi : false,
    participation: player.id === input.winnerId ? 'won' as const : player.participation,
  }));
  if (state.settings.bloodBattle) {
    players = players.map((player) => player.id === input.winnerId
      ? { ...player, active: false, participation: 'won' as const }
      : player);
  }
  const activeCount = players.filter((player) => player.active).length;
  const shouldContinue = state.settings.bloodBattle && activeCount > 1;
  const winnerWasDealer = state.players.find((player) => player.id === input.winnerId)?.wind === '东';
  let next = addEvent({
    ...state,
    players,
    turnIndex: shouldContinue ? nextActiveIndex(players, state.turnIndex) : state.turnIndex,
    turnStartedAt: Date.now(),
    phase: 'skill' as const,
    handEnded: !state.settings.bloodBattle || activeCount <= 1,
    dealerRepeat: !state.settings.bloodBattle && Boolean(winnerWasDealer),
    honba: state.settings.bloodBattle ? state.honba : winnerWasDealer ? state.honba + 1 : 0,
    riichiSticks: 0,
  }, '和牌结算', result.summary, deltas);
  if (state.settings.bloodBattle && activeCount <= 1) {
    next = addEvent(next, '本局结束', '血战到底只剩一名未和牌玩家，可开始下一局');
  }
  return next;
}

function scorePreview(result: SettlementResult, input: SettlementInput, han: number, yakuman: number): ScorePreview {
  return {
    label: result.label,
    totalHan: han,
    yakuman,
    winnerGain: result.winnerGain,
    payments: Object.entries(result.payments).map(([playerId, amount]) => ({ playerId, amount })),
  };
}

export function applyRemoteControllerCommand(
  game: GameState,
  cards: readonly SkillCard[],
  actorId: string,
  command: ControllerCommand,
): RemoteCommandOutcome {
  const actor = game.players.find((player) => player.id === actorId);
  if (!actor) throw new RemoteCommandError('AUTH_FAILED', '遥控器没有绑定有效玩家');
  if (command.kind === 'wushuang.update' || command.kind === 'wushuang.commit') {
    try { const nextGame=command.kind==='wushuang.update'?updateWushuang(game,actorId,command):settleWushuang(game,actorId,command);
      const message=command.kind==='wushuang.update'?'无双牌组已保存':nextGame===game?'本次无双已入账，无需重复':'无双结算已入账';
      const notifications=command.kind==='wushuang.commit'&&nextGame!==game?game.players.map(p=>({playerId:p.id,notification:makeNotice(nextGame.history.at(-1)!.id,'麻将无双结算',nextGame.history.at(-1)!.detail,p.id!==actorId)})):[];
      return {nextGame,changed:nextGame!==game,message,notifications}; }
    catch(error){throw new RemoteCommandError('NOT_ALLOWED',error instanceof Error?error.message:'无双操作无效');}
  }
  if (command.kind === 'environment.action') {
    try { return { nextGame: applyEnvironmentAction(game, actorId, command), changed: true, message: '环境操作已同步', notifications: [] }; }
    catch (error) { throw new RemoteCommandError('NOT_ALLOWED', error instanceof Error ? error.message : '环境操作无效'); }
  }

  if (command.kind === 'character.select') {
    if (!validCharacterChoice(command.character)) throw new RemoteCommandError('INVALID_PAYLOAD', '角色资料无效');
    return { nextGame: { ...game, players: game.players.map(player => player.id === actorId ? { ...player, character: characterChoice(command.character) } : player) },
      changed: true, message: `已选择${command.character.name}`, notifications: [] };
  }

  if (command.kind === 'draw.confirm') {
    if (game.handEnded || !actor.active || actor.participation !== 'playing') {
      throw new RemoteCommandError('NOT_ALLOWED', '该玩家当前不能确认摸牌');
    }
    const actorIndex = game.players.findIndex((player) => player.id === actorId);
    if (game.timerPaused) throw new RemoteCommandError('NOT_ALLOWED', '计时已全局暂停，请平板恢复后再摸牌');
    if (command.turnStartedAt !== game.turnStartedAt) throw new RemoteCommandError('NOT_ALLOWED', '牌桌操作已更新，请确认现场状态后再点');
    if (game.turnState === 'thinking' && actorIndex === game.turnIndex) throw new RemoteCommandError('NOT_ALLOWED', '已经确认摸牌，请出牌后点“我已出牌”');
    if (game.wallCount <= 0) throw new RemoteCommandError('NOT_ALLOWED', '牌山已空，请在平板核对牌数或结算流局');
    const wallCount = Math.max(0, game.wallCount - 1);
    const turnState = startTurnClock(game, actorIndex);
    const nextGame = addEvent({
      ...turnState,
      wallCount,
      players: turnState.players.map((player) => player.id === actorId ? { ...player, usedSkillsThisTurn: 0 } : player),
      status: wallCount === 0 ? '牌山已空；需要时请手动按“流局”结算' : `${actor.name}已确认摸牌`,
    }, '遥控摸牌', `${actor.name}确认摸牌，牌山减 1`);
    return {
      nextGame,
      changed: true,
      message: '摸牌已同步，牌山 −1',
      notifications: [],
      realtimeEvent: { kind: 'draw', actorPlayerId: actor.id, actorName: actor.name },
    };
  }

  if (command.kind === 'discard.confirm') {
    if (game.handEnded || !actor.active || actor.participation !== 'playing' || game.turnState !== 'thinking' || game.players[game.turnIndex]?.id !== actorId || command.turnStartedAt !== game.turnStartedAt) {
      throw new RemoteCommandError('NOT_ALLOWED', '这巡已结束或操作已更新，请查看当前按钮');
    }
    return {
      nextGame: addEvent(stopTurnClock(game), '确认出牌', `${actor.name}已出牌；等待下一位确认摸牌，计时停止`),
      changed: true, message: '已出牌，等待下一位摸牌', notifications: [],
    };
  }

  if (command.kind === 'emote.send') {
    const environment = activeEnvironment(game);
    if (environment?.kind === 'night' || environment?.kind === 'silence') throw new RemoteCommandError('NOT_ALLOWED', environment.kind === 'night' ? '暗夜期间暂停表情' : '寂静之地期间暂停表情交流');
    if (!GAME_EMOTES_BY_ID.has(command.emoteId)) throw new RemoteCommandError('INVALID_PAYLOAD', '这个表情不在当前表情清单中');
    return {
      nextGame: game,
      changed: false,
      message: '表情已发送',
      notifications: [],
      realtimeEvent: { kind: 'emote', actorPlayerId: actor.id, actorName: actor.name, emoteId: command.emoteId },
    };
  }

  if (command.kind === 'riichi.declare') {
    if (game.handEnded || !actor.active || actor.participation !== 'playing') throw new RemoteCommandError('NOT_ALLOWED', '该玩家当前不能立直');
    if (actor.riichi) throw new RemoteCommandError('ALREADY_RIICHI', '你已经立直');
    if (actor.score < 1_000) throw new RemoteCommandError('INSUFFICIENT_POINTS', '点数不足，不能支付立直棒');
    const nextGame = addEvent({
      ...game,
      riichiSticks: game.riichiSticks + 1,
      players: game.players.map((player) => player.id === actorId ? { ...player, score: player.score - 1_000, riichi: true } : player),
    }, '立直', `${actor.name}通过手机支付 1,000 点立直`, { [actorId]: -1_000 });
    const eventId = createProtocolId('event');
    const notifications = game.players.map((player) => ({
      playerId: player.id,
      notification: makeNotice(eventId, `${actor.wind}家立直`, `${actor.name}支付 1,000 点，供托增加 1 根。`, false),
    }));
    return { nextGame, changed: true, message: '立直已同步，扣除 1,000 点', notifications };
  }

  if (command.kind === 'score.adjust') {
    if (!actor.active || actor.participation !== 'playing') {
      throw new RemoteCommandError('NOT_ALLOWED', '该玩家当前不能调整点数');
    }
    const amount = Math.trunc(command.input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      throw new RemoteCommandError('INVALID_PAYLOAD', '请输入 1 到 1,000,000 之间的点数');
    }
    const counterparty = command.input.counterpartyPlayerId
      ? game.players.find((player) => player.id === command.input.counterpartyPlayerId)
      : undefined;
    if (command.input.counterpartyPlayerId && (!counterparty || counterparty.id === actorId)) {
      throw new RemoteCommandError('INVALID_TARGET', '请选择另一名有效玩家，或改用场外增减');
    }
    const actorDelta = command.input.direction === 'add' ? amount : -amount;
    const deltas: Record<string, number> = { [actorId]: actorDelta };
    if (counterparty) deltas[counterparty.id] = -actorDelta;
    const reason = command.input.reason.trim() || '技能／罚点调整';
    const detail = `${actor.name}${actorDelta > 0 ? '获得' : '扣除'} ${amount.toLocaleString('zh-CN')} 点：${reason}${counterparty ? `（与${counterparty.name}结算）` : '（场外增减）'}`;
    const nextGame = addEvent({
      ...game,
      players: game.players.map((player) => ({ ...player, score: player.score + (deltas[player.id] ?? 0) })),
    }, '手机点数调整', detail, deltas);
    const eventId = createProtocolId('event');
    const notifications = game.players.map((player) => ({
      playerId: player.id,
      notification: makeNotice(
        eventId,
        '点数调整',
        detail,
        player.id === counterparty?.id,
        `${actor.wind}家 · ${actor.name}`,
      ),
    }));
    return { nextGame, changed: true, message: `${actorDelta > 0 ? '加点' : '扣点'}已同步`, notifications };
  }

  if (command.kind === 'skill.activate') {
    if (!game.settings.wushuang) throw new RemoteCommandError('NOT_ALLOWED', '当前没有开启麻将无双模式');
    const card = cards.find((entry) => entry.id === command.input.cardId);
    if (!card) throw new RemoteCommandError('INVALID_PAYLOAD', '技能卡不在当前资料库中');
    const activationKey = command.input.activationId ? `${actorId}:${command.input.activationId}` : undefined;
    if (activationKey && game.effects.some(e => e.activationKey === activationKey)) return { nextGame: game, changed: false, message: '该次技能已发动，无需重复', notifications: [] };
    if (game.handEnded || !actor.active || actor.participation !== 'playing') throw new RemoteCommandError('NOT_ALLOWED', '该玩家当前不能发动技能');
    const physicalCost = godCardCost(card);
    if (physicalCost && command.input.wushuangCostConfirmed !== true) throw new RemoteCommandError('INVALID_PAYLOAD', '请先一次确认实体代价已交出');
    const wushuang=isWushuangCard(card);
    if(wushuang){
      if(command.input.wushuangCostConfirmed!==true||!command.input.activationId)throw new RemoteCommandError('INVALID_PAYLOAD','请一次确认单、团、攻、陷四类实体代价');
      if(pendingWushuang(game).length)throw new RemoteCommandError('NOT_ALLOWED','请先完成牌桌上待结算的麻将无双');
      if(command.input.coinDecision===undefined)throw new RemoteCommandError('INVALID_PAYLOAD','请选择正面、反面或掷币');
      if(command.input.targetPlayerIds.length>1||command.input.targetPlayerIds.some(id=>!isWushuangTarget(game,actorId,id)))throw new RemoteCommandError('INVALID_TARGET','请选择一名仍在局中的敌方');
      if(command.input.coinDecision==='tails'&&command.input.targetPlayerIds.length!==1)throw new RemoteCommandError('INVALID_TARGET','请先选择一名仍在局中的敌方');
    }
    const environment = makeEnvironment(card, command.input.environment);
    const hidden = card.type.code === '陷' && command.input.faceDown;
    if (hidden && command.input.coinDecision !== undefined) throw new RemoteCommandError('INVALID_PAYLOAD', '暗置时不能录入硬币结果，请在揭示时选择');
    if (command.input.coinDecision !== undefined && (!usesDecisionCoin(card) || !['heads', 'tails', 'toss'].includes(command.input.coinDecision))) throw new RemoteCommandError('INVALID_PAYLOAD', '此选择只适用于单枚硬币判定');
    const validTargetIds = new Set(game.players.map((player) => player.id));
    if (command.input.targetPlayerIds.some((id) => !validTargetIds.has(id))) throw new RemoteCommandError('INVALID_TARGET', '技能目标不在当前牌桌中');
    const targets = card.type.code === '单'
      ? [actorId]
      : card.type.code === '团'
        ? (command.input.targetPlayerIds.length ? command.input.targetPlayerIds : game.players.filter((player) => player.team === actor.team).map((player) => player.id))
        : card.type.code === '环' || hidden
          ? []
          : command.input.targetPlayerIds;
    if ((card.type.code === '攻' || card.type.code === '团' || (card.type.code === '陷' && !hidden)) && targets.length === 0) {
      throw new RemoteCommandError('INVALID_TARGET', '这张技能卡需要选择受影响玩家');
    }
    const effect: ActiveSkillEffect = {
      ...(activationKey ? { activationKey } : {}),
      ...(environment ? { environment } : {}),
      randomRule: wushuang ? randomRuleTemplate('coin') : card.randomRule ? readRandomRule(card.randomRule) : null,
      id: createProtocolId('effect'),
      cardId: card.id,
      cardName: card.name,
      effectText: command.input.effectText || card.effectDescription,
      sourcePlayerId: actorId,
      targetPlayerIds: targets,
      affectedPlayerIds: targets,
      scope: card.type.code === '单' ? 'self' : card.type.code === '团' ? 'team' : card.type.code === '环' ? 'table' : 'player',
      visibility: hidden ? 'face-down' : 'public',
      state: hidden ? 'armed' : 'active',
      duration: environment ? 'hand' : command.input.duration,
      note: command.input.effectText || card.effectDescription,
      createdAt: new Date().toISOString(),
      ownerId: actorId,
      targetId: targets[0],
      faceDown: hidden,
      status: 'active',
    };
    const baseEffects = card.type.code === '环'
      ? game.effects.map((entry) => entry.scope === 'table' && isLiveEffect(entry) ? { ...entry, state: 'resolved' as const, status: 'resolved' as const } : entry)
      : game.effects;
    const hadCard = actor.skillHand.includes(card.id);
    const activatedGame = addEvent({
      ...game,
      environmentSkillId: card.type.code === '环' ? card.id : game.environmentSkillId,
      effects: [...baseEffects, effect],
      skillDiscard: hadCard ? [...game.skillDiscard, card.id] : game.skillDiscard,
      players: game.players.map((player) => player.id === actorId ? {
        ...player,
        usedSkillsThisTurn: player.usedSkillsThisTurn + 1,
        skillHand: hadCard ? player.skillHand.filter((id, index) => id !== card.id || index !== player.skillHand.indexOf(card.id)) : player.skillHand,
      } : player),
    }, hidden ? '暗置陷阱' : '记录技能发动', hidden
      ? `${actor.name}通过手机暗置了一张陷阱卡`
      : `${actor.name}通过手机发动「${card.name}」${targets.length ? `，影响${targets.map((id) => game.players.find((player) => player.id === id)?.name).filter(Boolean).join('、')}` : '，作用于牌桌'}`);
    const costGame=wushuang?addEvent(activatedGame,'无双代价确认',`${actor.name}已交出单、团、攻、陷各一张实体技能卡；仅作代价，不发动效果`):activatedGame;
    const confirmedGame = physicalCost ? addEvent(costGame, '神卡代价确认', `${actor.name}已交出${physicalCost}作为「${card.name}」代价；代价卡效果不发动`) : costGame;
    const judgedGame = finishSkillActivation(confirmedGame, effect.id, card, command.input.coinDecision);
    const nextGame = wushuang ? startWushuangSession(judgedGame,effect.id,command.input.activationId!) : judgedGame;
    return {
      nextGame,
      changed: true,
      message: hidden ? '陷阱已暗置，仅你的手机可见' : `「${card.name}」已同步`,
      notifications: skillNotices(nextGame, actorId, nextGame.effects.find(e => e.id === effect.id)!, hidden),
    };
  }

  if (command.kind === 'skill.reveal') {
    if (game.handEnded || !actor.active || actor.participation !== 'playing') throw new RemoteCommandError('NOT_ALLOWED', '该玩家当前不能发动陷阱');
    if (command.input.targetPlayerIds.some(id => !game.players.some(p => p.id === id && p.active))) throw new RemoteCommandError('INVALID_TARGET', '请选择仍在本局中的目标');
    const effect = game.effects.find((entry) => entry.id === command.input.effectId && isLiveEffect(entry));
    if (!effect || effectSourceId(effect) !== actorId || !(effect.faceDown || effect.visibility === 'face-down')) {
      throw new RemoteCommandError('NOT_ALLOWED', '只能揭示自己仍在场上的暗置陷阱');
    }
    if (!command.input.targetPlayerIds.length) throw new RemoteCommandError('INVALID_TARGET', '请先选择实际受影响玩家');
    const revealed: ActiveSkillEffect = {
      ...effect,
      visibility: 'public',
      faceDown: false,
      state: 'triggered',
      targetPlayerIds: command.input.targetPlayerIds,
      affectedPlayerIds: command.input.targetPlayerIds,
      targetId: command.input.targetPlayerIds[0],
      note: command.input.effectText || effect.note,
      effectText: command.input.effectText || effect.effectText,
    };
    const revealedGame = addEvent({
      ...game,
      effects: game.effects.map((entry) => entry.id === effect.id ? revealed : entry),
    }, '陷阱发动', `${actor.name}通过手机揭示「${effect.cardName || '陷阱卡'}」`);
    const card = cards.find(c => c.id === effect.cardId);
    if (command.input.coinDecision !== undefined && (!usesDecisionCoin({ name: effect.cardName ?? card?.name ?? '', randomRule: card?.randomRule }, effect.randomRule) || !['heads', 'tails', 'toss'].includes(command.input.coinDecision))) throw new RemoteCommandError('INVALID_PAYLOAD', '此选择只适用于单枚硬币判定');
    const nextGame = finishSkillActivation(revealedGame, effect.id, card ?? { name: effect.cardName || '陷阱卡', summary: '', effectDescription: effect.effectText || '', randomRule: effect.randomRule ?? undefined }, command.input.coinDecision);
    return { nextGame, changed: true, message: '陷阱已揭示并通知目标', notifications: skillNotices(nextGame, actorId, nextGame.effects.find(e => e.id === effect.id)!, false) };
  }

  if (command.kind === 'effect.resolve-own') {
    const effect = game.effects.find((entry) => entry.id === command.effectId && isLiveEffect(entry));
    if (!effect || effectSourceId(effect) !== actorId) throw new RemoteCommandError('NOT_ALLOWED', '只能结束自己发动的效果');
    if(effect.wushuang?.status==='pending')throw new RemoteCommandError('NOT_ALLOWED','请在无双专属面板完成结算，不能直接结束效果');
    const nextGame = addEvent({
      ...game,
      environmentSkillId: game.environmentSkillId === effect.cardId ? null : game.environmentSkillId,
      effects: game.effects.map((entry) => entry.id === effect.id ? { ...entry, state: 'resolved' as const, status: 'resolved' as const } : entry),
    }, '效果结束', `「${effect.cardName || '技能效果'}」已由${actor.name}通过手机解除`);
    return { nextGame, changed: true, message: '效果已结束', notifications: [] };
  }

  if (command.kind === 'win.preview' || command.kind === 'win.commit') {
    if(command.kind==='win.commit'&&pendingWushuang(game).length)throw new RemoteCommandError('NOT_ALLOWED','请先完成牌桌上的麻将无双结算');
    const { input, result, han, yakuman, yakuNames, tiles } = validateWinDraft(game, actorId, command.draft);
    const preview = scorePreview(result, input, han, yakuman);
    if (command.kind === 'win.preview') {
      return { nextGame: game, changed: false, message: result.summary, preview, notifications: [] };
    }
    const nextGame = recordWin(game, awardLastSurvivor(game, applySettlement(game, input, result)), input, result, yakuNames, tiles);
    const eventId = createProtocolId('event');
    const notifications = game.players.map((player) => ({
      playerId: player.id,
      notification: makeNotice(eventId, `${actor.wind}家和牌`, result.summary, player.id !== actorId, `${actor.wind}家 · ${actor.name}`),
    }));
    return { nextGame, changed: true, message: result.summary, preview, notifications };
  }

  throw new RemoteCommandError('INVALID_PAYLOAD', '不支持的遥控指令');
}
