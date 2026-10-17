/** Card-authored rules. The Host rolls or validates an explicitly declared single-coin face. */
export interface RandomEffect {
  kind: 'score' | 'draw-skill' | 'status' | 'manual';
  target: 'actor' | 'targets';
  amount: number;
  text: string;
}
export interface RandomOutcome { id: string; label: string; weight: number; values: number[]; effect: RandomEffect }
export interface RandomRule { kind: 'coin' | 'dice' | 'wheel'; count: number; outcomes: RandomOutcome[] }
export type CoinDecision = 'heads' | 'tails' | 'toss';
export interface RandomResult { source?: 'manual'; kind: RandomRule['kind']; faces: number[]; total: number; outcomeId: string; label: string; description: string; options?: { id: string; label: string; weight: number }[] }

export function readRandomRule(value: unknown): RandomRule {
  if (!value || typeof value !== 'object') throw new Error('随机判定配置无效');
  const r = value as RandomRule;
  if (!['coin', 'dice', 'wheel'].includes(r.kind) || !Number.isInteger(r.count) || r.count < 1 || r.count > 3
    || !Array.isArray(r.outcomes) || r.outcomes.length < 2 || r.outcomes.length > 18) throw new Error('判定需 1–3 次投掷及 2–18 个结果');
  const ids = new Set<string>(), values = new Set<number>();
  const outcomes = r.outcomes.map(o => {
    if (!o || typeof o.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(o.id) || ids.has(o.id)
      || typeof o.label !== 'string' || !o.label.trim() || o.label.length > 40
      || !Number.isInteger(o.weight) || o.weight < 1 || o.weight > 1000 || !Array.isArray(o.values) || o.values.length > 19) throw new Error('判定结果名称、编号或权重无效');
    ids.add(o.id);
    for (const n of o.values) {
      if (!Number.isInteger(n) || n < (r.kind === 'coin' ? 0 : r.count) || n > (r.kind === 'coin' ? r.count : r.count * 6) || values.has(n)) throw new Error('点数范围重复或无效');
      values.add(n);
    }
    const e = o.effect;
    if (!e || !['score', 'draw-skill', 'status', 'manual'].includes(e.kind) || !['actor', 'targets'].includes(e.target)
      || !Number.isInteger(e.amount) || Math.abs(e.amount) > 100000 || (e.kind === 'draw-skill' && (e.amount < 1 || e.amount > 5))
      || typeof e.text !== 'string' || e.text.length > 160) throw new Error('判定后效果无效');
    return { id: o.id, label: o.label.trim(), weight: o.weight, values: [...o.values], effect: { kind: e.kind, target: e.target, amount: e.amount, text: e.text } };
  });
  if (r.kind !== 'wheel') {
    for (let n = r.kind === 'coin' ? 0 : r.count; n <= (r.kind === 'coin' ? r.count : r.count * 6); n++) {
      if (!values.has(n)) throw new Error(`尚未指定点数 ${n} 的效果`);
    }
  }
  return { kind: r.kind, count: r.kind === 'wheel' ? 1 : r.count, outcomes };
}

/** Rejection sampling avoids modulo bias. Upper bound is exclusive. */
export function secureChoice(upper: number): number {
  if (!Number.isSafeInteger(upper) || upper < 1 || upper > 18000) throw new Error('随机范围无效');
  const cutoff = Math.floor(0x100000000 / upper) * upper;
  const word = new Uint32Array(1);
  do { crypto.getRandomValues(word); } while (word[0] >= cutoff);
  return word[0] % upper;
}
export function rollSkill(rule: RandomRule, choose: (upper: number) => number = secureChoice): { result: RandomResult; effect: RandomEffect } {
  const r = readRandomRule(rule);
  const faces = r.kind === 'wheel' ? [] : Array.from({ length: r.count }, () => choose(r.kind === 'coin' ? 2 : 6) + (r.kind === 'dice' ? 1 : 0));
  const total = faces.reduce((a, b) => a + b, 0);
  let outcome: RandomOutcome;
  if (r.kind === 'wheel') {
    let draw = choose(r.outcomes.reduce((sum, o) => sum + o.weight, 0));
    outcome = r.outcomes.find(o => { draw -= o.weight; return draw < 0; })!;
  } else outcome = r.outcomes.find(o => o.values.includes(total))!;
  if (!outcome) throw new Error('判定结果不存在');
  return { result: { kind: r.kind, faces, total, outcomeId: outcome.id, label: outcome.label, description: outcome.effect.text, ...(r.kind === 'wheel' ? { options: r.outcomes.map(o => ({ id: o.id, label: o.label, weight: o.weight })) } : {}) }, effect: outcome.effect };
}
export function randomRuleTemplate(kind: RandomRule['kind']): RandomRule {
  const effects = (label: string): RandomEffect => ({ kind: 'manual', target: 'actor', amount: 0, text: label });
  const labels = kind === 'coin' ? ['反面', '正面'] : kind === 'dice' ? ['1–3 点', '4–6 点'] : ['结果一', '结果二', '结果三'];
  return { kind, count: 1, outcomes: labels.map((label, i) => ({ id: `result-${i + 1}`, label, weight: 1,
    values: kind === 'coin' ? [i] : kind === 'dice' ? (i ? [4, 5, 6] : [1, 2, 3]) : [], effect: effects('请按卡面执行现实效果') })) };
}

/** A physical coin declaration uses the same outcome/effect mapping without RNG. */
export function decideSkillCoin(rule: RandomRule, decision: CoinDecision) {
  if (!['heads', 'tails', 'toss'].includes(decision)) throw new Error('请选择正面、反面或掷币');
  const validated = readRandomRule(rule);
  if (validated.kind !== 'coin' || validated.count !== 1) throw new Error('此选择只适用于单枚硬币判定');
  if (decision === 'toss') return rollSkill(validated);
  const rolled = rollSkill(validated, () => decision === 'heads' ? 1 : 0);
  return { ...rolled, result: { ...rolled.result, source: 'manual' as const } };
}
