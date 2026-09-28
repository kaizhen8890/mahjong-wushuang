import type { Rules } from './model';

export function defaultRules(players: 3 | 4 = 4): Rules {
  return { players, length: 'hanchan', startingPoints: players === 3 ? 35000 : 25000,
    returnPoints: players === 3 ? 40000 : 30000, openTanyao: true, redFives: true,
    kiriageMangan: false, kazoeYakuman: true, doubleYakuman: true, sanmaTsumoLoss: true,
    multiRon: 'all', abortiveDraws: { nineTerminals: true, fourWinds: true, fourKans: true, fourRiichi: true },
    timer: { fixedMs: 15000, bankMs: 30000, responseMs: 5000 },
    match: { bankruptcy: true, dealerWinEnd: true, dealerTenpaiEnd: true,
      extension: 'one-wind', uma: Array<number>(players).fill(0) } };
}

/** Reject malformed configuration before allocating a wall or starting a clock. */
export function validateRules(rules: Rules): void {
  if (!rules || ![3, 4].includes(rules.players) || !['east', 'hanchan'].includes(rules.length)
    || !['all', 'head-bump', 'triple-abort'].includes(rules.multiRon)) throw new Error('Invalid rules');
  for (const value of [rules.startingPoints, rules.returnPoints]) {
    if (!Number.isSafeInteger(value) || value < 1000 || value > 1000000 || value % 100) throw new Error('Invalid points');
  }
  for (const value of [rules.openTanyao, rules.redFives, rules.kiriageMangan, rules.kazoeYakuman,
    rules.doubleYakuman, rules.sanmaTsumoLoss, rules.abortiveDraws?.nineTerminals,
    rules.abortiveDraws?.fourWinds, rules.abortiveDraws?.fourKans, rules.abortiveDraws?.fourRiichi]) {
    if (typeof value !== 'boolean') throw new Error('Invalid rule toggle');
  }
  const timer = rules.timer;
  const match = rules.match;
  if (!match || !['none', 'one-wind'].includes(match.extension)
    || [match.bankruptcy, match.dealerWinEnd, match.dealerTenpaiEnd].some(value => typeof value !== 'boolean')
    || !Array.isArray(match.uma) || match.uma.length !== rules.players
    || match.uma.some(value => !Number.isSafeInteger(value) || Math.abs(value) > 1000)
    || match.uma.reduce((sum, value) => sum + value, 0) !== 0) throw new Error('Invalid match rules');
  if (!timer || ![timer.fixedMs, timer.bankMs, timer.responseMs].every(value =>
    Number.isSafeInteger(value) && value >= 0 && value <= 3600000)
    || timer.responseMs < 100 || timer.fixedMs + timer.bankMs < 100) throw new Error('Invalid timer');
}
