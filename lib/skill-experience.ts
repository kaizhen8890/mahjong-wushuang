import { addEvent, nextActiveIndex, stopTurnClock, YAKU, type GameState, type SkillCard, type ActiveSkillEffect } from './mahjong';
import { readRandomRule, rollSkill, randomRuleTemplate, decideSkillCoin, type CoinDecision, type RandomRule, type RandomResult } from './skill-random';

export const ENVIRONMENTS = { witch: '魔女审判', night: '暗夜之战', silence: '寂静之地', treasure: '宝箱猎人', yaku: '规则怪谈', number: '偶氮玉红' } as const;
export type EnvironmentKind = keyof typeof ENVIRONMENTS;
export interface EnvironmentOptions { yakuId?: string; number?: number }
export interface EnvironmentState extends EnvironmentOptions { kind: EnvironmentKind; confirmed?: boolean }
export interface EnvironmentView extends EnvironmentState { effectId: string; actorId: string; name: string }
export interface SkillExperienceEvent {
  id: string; createdAt: number; kind: 'environment' | 'judgement' | 'penalty' | 'treasure' | 'random' | 'skill';
  actorId: string; actorName: string; cardName: string; targets: string[]; label: string;
  environment?: EnvironmentKind; random?: RandomResult;
}
export type EnvironmentAction = { kind: 'environment.action'; effectId: string; action: 'judge' | 'penalty' | 'treasure'; targetId?: string; confirmed: boolean };
export const liveSkill = (e: ActiveSkillEffect) => e.state !== 'resolved' && e.status !== 'resolved';
export function environmentKind(card: Pick<SkillCard, 'type' | 'name'>): EnvironmentKind | undefined {
  return card.type.code === '环' ? (Object.keys(ENVIRONMENTS) as EnvironmentKind[]).find(k => ENVIRONMENTS[k] === card.name) : undefined;
}
export function makeEnvironment(card: SkillCard, options: EnvironmentOptions = {}): EnvironmentState | undefined {
  const kind = environmentKind(card);
  if (!kind) return;
  if (kind === 'yaku') {
    if (!YAKU.some(y => y.id === options.yakuId && !y.yakuman)) throw new Error('请声明一种非役满役种');
    return { kind, yakuId: options.yakuId };
  }
  if (kind === 'number') {
    if (!Number.isInteger(options.number) || options.number! < 1 || options.number! > 9) throw new Error('请声明 1–9 的数字');
    return { kind, number: options.number };
  }
  return { kind };
}
export function activeEnvironment(game: GameState): EnvironmentView | undefined {
  if (!game.settings.wushuang || game.handEnded) return;
  const effect = [...game.effects].reverse().find(e => e.scope === 'table' && liveSkill(e) && !e.faceDown);
  if (!effect) return;
  const state = effect.environment ?? ((Object.keys(ENVIRONMENTS) as EnvironmentKind[]).find(k => ENVIRONMENTS[k] === effect.cardName)
    ? { kind: (Object.keys(ENVIRONMENTS) as EnvironmentKind[]).find(k => ENVIRONMENTS[k] === effect.cardName)! } : undefined);
  return state ? { ...state, effectId: effect.id, actorId: effect.sourcePlayerId || effect.ownerId, name: effect.cardName ?? ENVIRONMENTS[state.kind] } : undefined;
}
export function experienceEvent(game: GameState, event: Omit<SkillExperienceEvent, 'id' | 'createdAt'>): GameState {
  return { ...game, experienceEvents: [...(game.experienceEvents ?? []).filter(e => Date.now() - e.createdAt < 20000),
    { ...event, id: crypto.randomUUID(), createdAt: Date.now() }].slice(-8) };
}
/** Preserve a trap's captured configuration; named god cards have a coin fallback. */
export function skillRandomRule(card: Pick<SkillCard, 'name' | 'randomRule'>, captured?: RandomRule | null) {
  return (captured === undefined ? card.randomRule : captured)
    ?? (['麻将无双', '听天问剑'].includes(card.name) ? randomRuleTemplate('coin') : undefined);
}
export function usesDecisionCoin(card: Pick<SkillCard, 'name' | 'randomRule'>, captured?: RandomRule | null) {
  const rule = skillRandomRule(card, captured);
  return rule?.kind === 'coin' && rule.count === 1;
}
export function finishSkillActivation(game: GameState, effectId: string, card: Pick<SkillCard, 'name' | 'summary' | 'effectDescription' | 'randomRule'>, coinDecision?: CoinDecision): GameState {
  const effect = game.effects.find(e => e.id === effectId)!;
  if (effect.faceDown || effect.state === 'armed') return game;
  const actor = game.players.find(p => p.id === (effect.sourcePlayerId || effect.ownerId))!;
  let next = game;
  if (effect.environment) next = experienceEvent(next, { kind: 'environment', actorId: actor.id, actorName: actor.name,
    cardName: card.name, targets: [], environment: effect.environment.kind,
    label: effect.environment.kind === 'yaku' ? `${YAKU.find(y => y.id === effect.environment?.yakuId)?.name} · 固定 5 番`
      : effect.environment.kind === 'number' ? `数字 ${effect.environment.number} · 每两张追加一宝牌` : card.summary || card.name });
  // null records that the card had no random rule at activation; undefined is a legacy record.
  if (effect.randomResult) return next;
  if (['断序杂音', '宿星审判'].includes(card.name)) {
    if (!next.experienceEvents?.some(e => e.id === `skill-film-${effect.id}`)) {
      next = experienceEvent(next, { kind: 'skill', actorId: actor.id, actorName: actor.name, cardName: card.name,
        targets: card.name === '断序杂音' ? game.players.filter(p => p.active && (p.id === actor.id || (game.settings.teamsEnabled && p.team === actor.team))).map(p => p.id) : effect.affectedPlayerIds ?? effect.targetPlayerIds ?? [], label: card.effectDescription });
      next = { ...next, experienceEvents: next.experienceEvents!.map((e, i, all) => i === all.length - 1 ? { ...e, id: `skill-film-${effect.id}` } : e) };
    }
  }
  const capturedRule = skillRandomRule(card, effect.randomRule);
  if (coinDecision !== undefined && !capturedRule) throw new Error('此技能没有硬币判定');
  if (effect.randomResult || !capturedRule) return next;
  const rule = readRandomRule(capturedRule);
  const targets = [...new Set(effect.affectedPlayerIds ?? effect.targetPlayerIds ?? [])];
  if (rule.outcomes.some(o => o.effect.target === 'targets') && (!targets.length || targets.some(id => !game.players.some(p => p.id === id && p.active)))) throw new Error('随机效果需要选择仍在局中的目标');
  const rolled = coinDecision === undefined ? rollSkill(rule) : decideSkillCoin(rule, coinDecision);
  const declared = rolled.result.source === 'manual';
  const ids = rolled.effect.target === 'actor' ? [actor.id] : targets;
  const deltas: Record<string, number> = {};
  if (rolled.effect.kind === 'score') for (const id of ids) deltas[id] = rolled.effect.amount;
  let deck = [...game.skillDeck];
  const players = game.players.map(p => {
    let hand = p.skillHand;
    if (ids.includes(p.id) && rolled.effect.kind === 'draw-skill') {
      const taken = deck.splice(0, rolled.effect.amount); hand = [...hand, ...taken];
    }
    return { ...p, score: p.score + (deltas[p.id] ?? 0), skillHand: hand };
  });
  const consequence = rolled.effect.kind === 'score' ? `场外${rolled.effect.amount >= 0 ? '加' : '扣'} ${Math.abs(rolled.effect.amount)} 点`
    : rolled.effect.kind === 'draw-skill' ? `抽取至多 ${rolled.effect.amount} 张技能卡（不足按剩余牌数）` : rolled.effect.text || '按卡面执行';
  next = addEvent({ ...next, players, skillDeck: deck, effects: next.effects.map(e => e.id === effect.id ? { ...e, randomResult: rolled.result,
    effectText: `${e.effectText ?? card.effectDescription}\n判定：${declared ? '手动录入 · ' : ''}${rolled.result.label}；${consequence}` } : e) }, declared ? '技能硬币判定' : '技能随机判定',
    `${actor.name}「${card.name}」：${declared ? '手动录入 · ' : ''}${rolled.result.label}${rolled.result.faces.length ? ` [${rolled.result.faces.join('、')}]` : ''}；${consequence}${ids.length ? `（${ids.map(id => game.players.find(p => p.id === id)?.name).join('、')}）` : ''}`, deltas);
  const presentationTargets = card.name === '麻将无双' && rolled.result.kind === 'coin' && rolled.result.faces[0] === 0 ? targets : ids;
  return experienceEvent(next, { kind: 'random', actorId: actor.id, actorName: actor.name, cardName: card.name, targets: presentationTargets, label: consequence, random: rolled.result });
}
export function awardLastSurvivor(before: GameState, after: GameState): GameState {
  if (after.effects.some(e => e.wushuang?.status === 'settled' && before.effects.find(old => old.id === e.id)?.wushuang?.status === 'pending')) return after;
  if (after.judgementAwarded || activeEnvironment(before)?.kind !== 'witch') return after;
  const remaining = after.players.filter(p => p.active && p.participation === 'playing');
  const was = before.players.filter(p => p.active && p.participation === 'playing');
  if (was.length < 2 || remaining.length !== 1) return after;
  const winner = remaining[0];
  return addEvent({ ...stopTurnClock(after), handEnded: true, judgementAwarded: true,
    players: after.players.map(p => p.id === winner.id ? { ...p, score: p.score + 4000 } : p) }, '魔女审判 · 最后幸存者',
    `${winner.name}获得系统额外奖励 4,000 点，本局结束`, { [winner.id]: 4000 });
}
export function applyEnvironmentAction(game: GameState, actorId: string, action: EnvironmentAction, host = false): GameState {
  const env = activeEnvironment(game), actor = game.players.find(p => p.id === actorId);
  if (!env || env.effectId !== action.effectId || !actor || !actor.active || actor.participation !== 'playing' || action.confirmed !== true) throw new Error('环境或操作已变化，请重新确认');
  const target = game.players.find(p => p.id === action.targetId);
  if (action.action === 'judge') {
    if (env.kind !== 'witch' || !target || target.id === actorId || !target.active || target.participation !== 'playing'
      || (game.settings.teamsEnabled && target.team === actor.team)) throw new Error('只能审判一名仍在局中的敌方玩家');
    const players = game.players.map(p => p.id === target.id ? { ...p, active: false, participation: 'eliminated' as const,
      eliminationScope: 'hand' as const, eliminationReason: `魔女审判：${actor.name}` } : p);
    let next = addEvent({ ...game, players }, '魔女审判', `${actor.name}确认碰牌后审判${target.name}，目标退出本局`);
    if (game.players[game.turnIndex]?.id === target.id) next = { ...stopTurnClock(next), turnIndex: nextActiveIndex(players, game.turnIndex) };
    next = awardLastSurvivor(game, next);
    return experienceEvent(next, { kind: 'judgement', actorId, actorName: actor.name, cardName: env.name, environment: 'witch',
      targets: [target.id], label: `${target.name} · 退出本局${next.judgementAwarded && !game.judgementAwarded ? ' · 幸存者获得 4,000 点' : ''}` });
  }
  if (action.action === 'penalty') {
    if (!host || env.kind !== 'silence' || !target || !target.active || target.participation !== 'playing') throw new Error('请由平板确认违规玩家');
    return experienceEvent(addEvent({ ...game, players: game.players.map(p => p.id === target.id ? { ...p, score: p.score - 3000 } : p) },
      '寂静之地 · 违规', `${target.name}违规，场外扣除 3,000 点`, { [target.id]: -3000 }),
      { kind: 'penalty', actorId, actorName: actor.name, cardName: env.name, targets: [target.id], environment: 'silence', label: `${target.name} −3,000 点` });
  }
  if (env.kind !== 'treasure' || env.confirmed || (!host && env.actorId !== actorId)) throw new Error('翻牌已确认，或不是环境发动者');
  return experienceEvent(addEvent({ ...game, effects: game.effects.map(e => e.id === env.effectId ? { ...e, environment: { kind: 'treasure' as const, ...e.environment, confirmed: true } } : e) },
    '宝箱猎人', `${actor.name}确认已在现实牌桌翻开指示器；四杠不流局`),
    { kind: 'treasure', actorId, actorName: actor.name, cardName: env.name, targets: [], environment: 'treasure', label: '宝牌指示器已翻开 · 四杠不流局' });
}
export function environmentBonus(game: GameState, yakuIds: string[], closed: boolean, numberCount: number = 0): { overrideId?: string; dora: number } {
  const env = activeEnvironment(game);
  if (!Number.isInteger(numberCount) || numberCount < 0 || numberCount > 18) throw new Error('请确认 0–18 张数字牌');
  const yaku = YAKU.find(y => y.id === env?.yakuId && !y.yakuman && (closed || y.openHan > 0));
  return { ...(env?.kind === 'yaku' && yaku && yakuIds.includes(yaku.id) ? { overrideId: yaku.id } : {}), dora: env?.kind === 'number' ? Math.floor(numberCount / 2) : 0 };
}
