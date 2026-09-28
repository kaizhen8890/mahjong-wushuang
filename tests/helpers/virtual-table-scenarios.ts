// Fixed walls for tests and the development-only table lab.
import { MahjongMatchEngine } from '../../lib/virtual-mahjong/match-engine';
import { defaultRules } from '../../lib/virtual-mahjong/rules';
import { createTiles, tileCode, type Tile } from '../../lib/virtual-mahjong/tiles';
import type { RoundIntent } from '../../lib/virtual-mahjong/round-engine';
import type { Rules } from '../../lib/virtual-mahjong/model';
import type { Wall } from '../../lib/virtual-mahjong/wall';
export const scenarioNames = { riichi: '立直选牌', chi: '多个吃组合', pon: '碰与明杠', ankan: '暗杠与岭上自摸', kakan: '加杠', nuki: '三麻连续拔北', ron: '荣和结算', draw: '九种九牌流局' };
export type ScenarioName = keyof typeof scenarioNames;
function codes(text: string) { return [...text.matchAll(/([0-9]+)([mpsz])/g)].flatMap(match => match[1].split('').map(digit => digit + match[2])); }
function wall(rules: Rules, requested: string[], draws: string, replacements: string): Wall {
  const pool = createTiles(rules.players, rules.redFives);
  const take = (code: string) => {
    const index = pool.findIndex(tile => tileCode(tile) === code);
    if (index < 0) throw new Error(`Fixture exhausted ${code}`);
    return pool.splice(index, 1)[0];
  };
  const hands = Array.from({ length: rules.players }, (_, i) => codes(requested[i] ?? '').map(take));
  const next = codes(draws).map(take), rinshan = codes(replacements).map(take);
  hands.forEach((hand, i) => { while (hand.length < (i === 0 ? 14 : 13)) hand.push(pool.shift()!); });
  const deal: Tile[] = [];
  for (let packet = 0; packet < 3; packet++) for (const hand of hands) deal.push(...hand.slice(packet * 4, packet * 4 + 4));
  for (const hand of hands) deal.push(hand[12]);
  deal.push(hands[0][13]);
  return { live: [...deal, ...next, ...pool.slice(0, -(14 - rinshan.length))], dead: [...rinshan, ...pool.slice(-(14 - rinshan.length))], rinshanUsed: 0, indicatorsRevealed: 1 };
}
export function createTableScenario(name: ScenarioName, closedHand?: string, configure?: (rules: Rules) => void) {
  const hands = name === 'riichi' ? [closedHand ?? '123456789m123p5s1z'] : name === 'chi' ? ['3m', '1245m1468p1468s1z']
    : name === 'pon' ? ['3m', '333m1246p1468s12z'] : name === 'ankan' ? ['1111m234567p789s5z']
    : name === 'kakan' ? ['4s', '44s123p456m789s12z', '123m456789p23s66m']
    : name === 'nuki' ? ['123p456p789s4444z5z'] : name === 'ron' ? ['5s', '123456789m123p5s'] : ['19m19p19s1234567z1m'];
  const rules = defaultRules(name === 'nuki' ? 3 : 4); rules.redFives = false;
  configure?.(rules);
  const now = 1_000_000;
  const engine = new MahjongMatchEngine({ gameId: `table-lab-${name}`, rules, dealerSeat: 0,
    players: ['a', 'b', 'c', 'd'].slice(0, rules.players).map(id => ({ id, name: `玩家 ${id.toUpperCase()}` })) },
  { now: () => now, makeWall: rule => wall(rule, hands, name === 'kakan' ? '777z4s' : '', name === 'nuki' ? '1237z' : name === 'ankan' ? '5z' : '') });
  const viewerId = ['chi', 'pon', 'kakan', 'ron'].includes(name) ? 'b' : 'a';
  let sequence = 0;
  const view = () => engine.view({ role: 'player', playerId: viewerId });
  function send(actor: string, intent: RoundIntent) {
    const state = view();
    const result = engine.dispatch(actor, { ...intent, gameId: state.gameId, roundId: state.roundId, turnId: state.turnId, actionId: `lab-${++sequence}` });
    if (!result.ok) throw new Error(JSON.stringify(result));
  }
  function pass(except?: string) {
    for (const id of ['a', 'b', 'c', 'd'].slice(0, rules.players)) if (id !== except && engine.view({ role: 'player', playerId: id }).availableActions.canPass) send(id, { kind: 'RESPOND', optionId: 'pass' });
  }
  function discard(actor: string, code?: string) {
    const state = engine.view({ role: 'player', playerId: actor });
    const player = state.players.find(item => item.id === actor)!;
    send(actor, { kind: 'DISCARD', tileId: code ? player.hand!.find(tile => tileCode(tile) === code)!.id : player.drawnTileId! });
  }
  if (['chi', 'pon', 'ron', 'kakan'].includes(name)) { discard('a', name === 'ron' ? '5s' : name === 'kakan' ? '4s' : '3m'); pass(viewerId); }
  if (name === 'kakan') {
    send('b', { kind: 'RESPOND', optionId: view().availableActions.callOptions.find(option => option.kind === 'pon')!.id }); pass();
    discard('b', '1z'); pass();
    for (const id of ['c', 'd', 'a']) { discard(id); pass(); }
  }
  return { engine, viewerId, now, view, send, pass, discard,
    act(intent: RoundIntent) { send(viewerId, intent); pass(viewerId); } };
}
