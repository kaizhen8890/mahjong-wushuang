import assert from 'node:assert/strict';
import { analyzeHand, parseMelds, type HandContext } from '../lib/hand-analysis';
import { YAKU } from '../lib/mahjong';

const tiles = (text: string) => [...text.matchAll(/([0-9]+)([mpsz])/g)].flatMap(match =>
  [...match[1]].map(rank => rank + match[2]));
const base: Omit<HandContext, 'tiles' | 'winningTile'> = {
  melds: [], closed: true, winType: 'ron', seatWind: '南', roundWind: '东', selected: [], bonusHan: 0,
};
type Case = { id: string; hand: string; win: string; melds?: string; selected?: string[]; winType?: 'ron' | 'tsumo'; seatWind?: HandContext['seatWind'] };
const cases: Case[] = [
  { id: 'menzen-tsumo', hand: '123m123p123s456s55p', win: '6s', winType: 'tsumo' },
  { id: 'riichi', hand: '123m123p123s456s55p', win: '6s', selected: ['riichi'] },
  { id: 'double-riichi', hand: '123m123p123s456s55p', win: '6s', selected: ['double-riichi'] },
  { id: 'ippatsu', hand: '123m123p123s456s55p', win: '6s', selected: ['riichi', 'ippatsu'] },
  { id: 'pinfu', hand: '123m12355p456789s', win: '6s' },
  { id: 'tanyao', hand: '234m34522p456678s', win: '8s' },
  { id: 'iipeikou', hand: '112233m456p789s55z', win: '9s' },
  { id: 'seat-wind', hand: '111z123m123p123s55m', win: '5m', seatWind: '东' },
  { id: 'round-wind', hand: '111z123m123p123s55m', win: '5m' },
  { id: 'haku', hand: '555z123m123p123s55m', win: '5m' },
  { id: 'hatsu', hand: '666z123m123p123s55m', win: '5m' },
  { id: 'chun', hand: '777z123m123p123s55m', win: '5m' },
  { id: 'sanshoku-doukou', hand: '111234m11155p111s', win: '4m' },
  { id: 'haitei', hand: '123m123p123s456s55p', win: '6s', winType: 'tsumo', selected: ['haitei'] },
  { id: 'houtei', hand: '123m123p123s456s55p', win: '6s', selected: ['houtei'] },
  { id: 'rinshan', hand: '123m123p123s456s55p', win: '6s', winType: 'tsumo', selected: ['rinshan'] },
  { id: 'chankan', hand: '123m123p123s456s55p', win: '6s', selected: ['chankan'] },
  { id: 'chiitoi', hand: '1122m3344p5566s77z', win: '7z' },
  { id: 'toitoi', hand: '111m222p333s44455z', win: '5z', melds: '碰1m' },
  { id: 'sanankou', hand: '222m33355p444567s', win: '2m', winType: 'tsumo' },
  { id: 'sanshoku', hand: '123456m12355p123s', win: '6m' },
  { id: 'ittsu', hand: '123456789m111p55s', win: '9m' },
  { id: 'chanta', hand: '111z12311m789p999s', win: '3m' },
  { id: 'junchan', hand: '111123789m111p99s', win: '3m' },
  { id: 'honroutou', hand: '111999m111999p55z', win: '5z', melds: '碰1m' },
  { id: 'shousangen', hand: '55566677z123m789p', win: '7z' },
  { id: 'sankantsu', hand: '1111m2222p3333s456m55z', win: '6m', melds: '杠1m,杠2p,杠3s' },
  { id: 'honitsu', hand: '123456789m11155z', win: '9m' },
  { id: 'chinitsu', hand: '11112345678955m', win: '9m' },
  { id: 'ryanpeikou', hand: '11223344556677m', win: '7m' },
  { id: 'kokushi', hand: '119m19p19s1234567z', win: '9m' },
  { id: 'kokushi-13', hand: '119m19p19s1234567z', win: '1m' },
  { id: 'suuankou', hand: '111m222p333s44455z', win: '1m', winType: 'tsumo' },
  { id: 'suuankou-tanki', hand: '111m222p333s44455z', win: '5z' },
  { id: 'daisangen', hand: '555666777z123m11p', win: '3m' },
  { id: 'shousuushi', hand: '11122233344z123m', win: '3m' },
  { id: 'daisuushi', hand: '111222333444z55m', win: '5m' },
  { id: 'tsuuiisou', hand: '11122233344455z', win: '5z' },
  { id: 'ryuuiisou', hand: '222333444666s66z', win: '6z' },
  { id: 'chinroutou', hand: '111999m111999p11s', win: '1s' },
  { id: 'chuuren', hand: '11123455678999m', win: '1m' },
  { id: 'junsei-chuuren', hand: '11123455678999m', win: '5m' },
  { id: 'suukantsu', hand: '1111m2222p3333s4444z55z', win: '5z', melds: '杠1m,杠2p,杠3s,杠4z' },
  { id: 'tenhou', hand: '123m123p123s456s55p', win: '6s', winType: 'tsumo', selected: ['tenhou'], seatWind: '东' },
  { id: 'chiihou', hand: '123m123p123s456s55p', win: '6s', winType: 'tsumo', selected: ['chiihou'] },
];

for (const fixture of cases) {
  const melds = parseMelds(fixture.melds ?? '');
  const result = analyzeHand({ ...base, tiles: tiles(fixture.hand), winningTile: fixture.win,
    melds, closed: !melds.some(meld => meld.kind !== 'ankan'),
    winType: fixture.winType ?? 'ron', selected: fixture.selected ?? [], seatWind: fixture.seatWind ?? '南' });
  assert.equal(result.complete, true, `${fixture.id}: ${result.error}`);
  assert.ok(result.best?.yaku.includes(fixture.id),
    `${fixture.id}: best=${JSON.stringify(result.best?.yaku)} candidates=${JSON.stringify(result.candidates.map(candidate => candidate.yaku))}`);
}
assert.deepEqual(new Set(cases.map(fixture => fixture.id)), new Set(YAKU.map(yaku => yaku.id)));
console.log(`PASS virtual yaku matrix: ${cases.length} independently specified hands cover every catalog entry`);
