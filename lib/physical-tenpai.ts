import { parseMelds, tileCode, tileIndex } from './hand-analysis';
import { winningTypes } from './virtual-mahjong/shanten';
import { tileTypes, type PlayerCount } from './virtual-mahjong/tiles';

export interface PhysicalWaitPreview {
  discard: string | null;
  waits: string[];
}

/** Structural waits for a manually entered real hand. This never claims a yaku or settles a win. */
export function inspectPhysicalTenpai(tiles: readonly string[], meldText: string, players: PlayerCount):
  { error?: string; previews: PhysicalWaitPreview[]; expected: number } {
  let melds: ReturnType<typeof parseMelds>;
  try { melds = parseMelds(meldText); }
  catch (cause) { return { error: cause instanceof Error ? cause.message : '副露格式不正确', previews: [], expected: 13 }; }
  if (melds.length > 4) return { error: '最多记录四组吃碰杠', previews: [], expected: 13 };
  const expected = 13 - 3 * melds.length;
  if (tiles.length !== expected && tiles.length !== expected + 1) {
    return { error: `请录入 ${expected} 张待牌手牌，或 ${expected + 1} 张查看打哪张后听牌`, previews: [], expected };
  }
  const allowed = new Set(tileTypes(players));
  const meldCounts = Array<number>(34).fill(0);
  for (const meld of melds) {
    const types = meld.kind === 'chi' ? [meld.tile, meld.tile + 1, meld.tile + 2]
      : Array(meld.kind.includes('kan') ? 4 : 3).fill(meld.tile);
    for (const type of types) meldCounts[type]++;
  }
  const hand = tiles.map(tileIndex);
  if ([...hand, ...meldCounts.flatMap((count, type) => Array(count).fill(type))].some(type => type < 0 || !allowed.has(type))) {
    return { error: players === 3 ? '牌张不合法；三麻不使用二至八万' : '牌张不合法', previews: [], expected };
  }
  const counts = Array<number>(34).fill(0);
  for (const type of hand) counts[type]++;
  if (counts.some((count, type) => count + meldCounts[type] > 4)) {
    return { error: '同一种牌在手牌和副露中合计最多四张', previews: [], expected };
  }
  const inspect = (discard: string | null, remaining: number[]) => ({
    discard,
    waits: winningTypes(remaining, melds.length, players, meldCounts).map(tileCode),
  });
  if (tiles.length === expected) return { previews: [inspect(null, counts)], expected };
  const previews: PhysicalWaitPreview[] = [];
  for (const type of new Set(hand)) {
    counts[type]--;
    const result = inspect(tileCode(type), counts);
    if (result.waits.length) previews.push(result);
    counts[type]++;
  }
  return { previews, expected };
}
