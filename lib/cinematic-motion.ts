import type { SkillExperienceEvent } from './skill-experience';
import { ENVIRONMENTS } from './skill-experience';

export type PreludeTheme = 'environment' | 'wushuang' | 'discord' | 'astral' | 'sword';
/** Deliberately excludes random faces, labels and targets: the prelude cannot reveal a result. */
export function preludeTheme(event: Pick<SkillExperienceEvent, 'kind' | 'cardName' | 'environment'>): PreludeTheme | undefined {
  if (event.kind === 'environment' && event.environment && ENVIRONMENTS[event.environment] === event.cardName) return 'environment';
  if (event.kind === 'skill' && event.cardName === '断序杂音') return 'discord';
  if (event.kind === 'skill' && event.cardName === '宿星审判') return 'astral';
  if (event.kind === 'random' && event.cardName === '麻将无双') return 'wushuang';
  if (event.kind === 'random' && event.cardName === '听天问剑') return 'sword';
}
export const PRELUDE_MS = { environment: 1750, wushuang: 2100, discord: 2100, astral: 2100, sword: 2100 } as const;
export function preludeDuration(theme: PreludeTheme, phone: boolean, reduced: boolean) {
  return reduced ? 240 : phone ? 650 : PRELUDE_MS[theme];
}
export function coinRevealDelay(event: SkillExperienceEvent, now: number): number {
  if (event.random?.kind !== 'coin' || event.random.source === 'manual') return 0;
  const theme = preludeTheme(event);
  return Math.max(0, event.createdAt + (theme ? PRELUDE_MS[theme] : 0) + 8250 - now);
}
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const interval = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const smooth = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const noise = (i: number) => { const n = Math.sin(i * 127.1 + 78.2) * 43758.5453; return n - Math.floor(n); };
export type MotionPoint = { x: number; y: number };
export function bezier(a: MotionPoint, b: MotionPoint, c: MotionPoint, d: MotionPoint, t: number): MotionPoint {
  const u = clamp01(t), v = 1 - u;
  return { x: v ** 3 * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u ** 3 * d.x,
    y: v ** 3 * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u ** 3 * d.y };
}
/** Shared vertices preserve the original card until the cracks separate. No random geometry per frame. */
export function cardFacets() {
  const points = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
    x: x / 4 - .5 + (x > 0 && x < 4 ? (noise(x + y * 5) - .5) * .09 : 0),
    y: y / 4 - .5 + (y > 0 && y < 4 ? (noise(x + y * 5 + 80) - .5) * .09 : 0),
  })));
  const facets: MotionPoint[][] = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const a = points[y][x], b = points[y][x + 1], c = points[y + 1][x + 1], d = points[y + 1][x];
    facets.push([a, b, c], [a, c, d]);
  }
  return facets;
}
