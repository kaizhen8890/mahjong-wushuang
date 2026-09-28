import { tileTypes, type PlayerCount } from './tiles';

const TERMINALS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function validate(counts: readonly number[], meldCount: number): void {
  if (counts.length !== 34 || counts.some(n => !Number.isInteger(n) || n < 0 || n > 4)) throw new Error('Invalid counts');
  if (!Number.isInteger(meldCount) || meldCount < 0 || meldCount > 4) throw new Error('Invalid meld count');
  if (counts.reduce((sum, n) => sum + n, 0) > 14 - 3 * meldCount) throw new Error('Too many concealed tiles');
}

/** Structural distance only: -1 complete, 0 tenpai. Does not assert a yaku or legal win. */
export function shanten(input: readonly number[], meldCount = 0): number {
  validate(input, meldCount);
  const counts = [...input];
  let best = 8;
  function search(start: number, complete: number, partial: number, pair: number): void {
    while (start < 34 && counts[start] === 0) start++;
    if (start === 34) {
      best = Math.min(best, 8 - 2 * (complete + meldCount) - Math.min(partial, 4 - complete - meldCount) - pair);
      return;
    }
    const sequence = start < 27 && start % 9 <= 6;
    if (complete + meldCount < 4) {
      if (counts[start] >= 3) {
        counts[start] -= 3; search(start, complete + 1, partial, pair); counts[start] += 3;
      }
      if (sequence && counts[start + 1] && counts[start + 2]) {
        counts[start]--; counts[start + 1]--; counts[start + 2]--;
        search(start, complete + 1, partial, pair);
        counts[start]++; counts[start + 1]++; counts[start + 2]++;
      }
    }
    if (counts[start] >= 2) {
      counts[start] -= 2;
      if (!pair) search(start, complete, partial, 1);
      if (partial < 4) search(start, complete, partial + 1, pair);
      counts[start] += 2;
    }
    if (partial < 4 && start < 27) {
      for (const gap of [1, 2]) {
        if (start % 9 + gap > 8 || !counts[start + gap]) continue;
        counts[start]--; counts[start + gap]--;
        search(start, complete, partial + 1, pair);
        counts[start]++; counts[start + gap]++;
      }
    }
    counts[start]--; search(start, complete, partial, pair); counts[start]++;
  }
  search(0, 0, 0, 0);
  if (meldCount === 0) {
    const unique = input.filter(n => n > 0).length;
    const pairs = input.filter(n => n >= 2).length;
    best = Math.min(best, 6 - pairs + Math.max(0, 7 - unique),
      13 - TERMINALS.filter(type => input[type] > 0).length - Number(TERMINALS.some(type => input[type] >= 2)));
  }
  return best;
}

/** Exact completion check for the hot prompt path; no expensive partial-hand search. */
export function isComplete(input: readonly number[], meldCount = 0): boolean {
  validate(input, meldCount);
  if (input.reduce((sum, n) => sum + n, 0) !== 14 - 3 * meldCount) return false;
  if (!meldCount) {
    if (input.filter(n => n === 2).length === 7) return true;
    if (TERMINALS.every(type => input[type] > 0) && TERMINALS.some(type => input[type] === 2)) return true;
  }
  const counts = [...input];
  const failed = new Set<string>();
  function groups(): boolean {
    const first = counts.findIndex(n => n > 0);
    if (first < 0) return true;
    const key = counts.join('');
    if (failed.has(key)) return false;
    if (counts[first] >= 3) {
      counts[first] -= 3;
      const complete = groups();
      counts[first] += 3;
      if (complete) return true;
    }
    if (first < 27 && first % 9 <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
      counts[first]--; counts[first + 1]--; counts[first + 2]--;
      const complete = groups();
      counts[first]++; counts[first + 1]++; counts[first + 2]++;
      if (complete) return true;
    }
    failed.add(key);
    return false;
  }
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const complete = groups();
    counts[pair] += 2;
    if (complete) return true;
  }
  return false;
}

/** Return structural winning types, excluding fifth copies already in own melds. */
export function winningTypes(input: readonly number[], meldCount = 0, players: PlayerCount = 4,
  meldTileCounts: readonly number[] = Array<number>(34).fill(0)): number[] {
  validate(input, meldCount);
  if (input.reduce((sum, n) => sum + n, 0) !== 13 - 3 * meldCount) throw new Error('Wait search requires a pre-draw hand');
  if (meldTileCounts.length !== 34 || meldTileCounts.some((n, i) => !Number.isInteger(n) || n < 0 || n + input[i] > 4)) {
    throw new Error('Invalid meld counts');
  }
  const allowed = tileTypes(players);
  if (input.some((n, type) => n > 0 && !allowed.includes(type))) throw new Error('Tile excluded by rules');
  const counts = [...input];
  return allowed.filter(type => {
    if (counts[type] + meldTileCounts[type] >= 4) return false;
    counts[type]++;
    const complete = isComplete(counts, meldCount);
    counts[type]--;
    return complete;
  });
}
