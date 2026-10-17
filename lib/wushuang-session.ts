import {
  assessHandInput,
  tileIndex,
  type HandCandidate,
} from './hand-analysis';
import {
  YAKU,
  ceilHundred,
  scoreBase,
  type GameSettings,
  type Wind,
} from './mahjong';

export interface WushuangGroup {
  id: string;
  tiles: string[];
  winningTile: string;
  meldText: string;
  mode: 'smart' | 'manual';
  selected: string[];
  fu: number;
  dora: number;
}
export interface WushuangSession {
  effectId: string;
  actorId: string;
  activationId: string;
  face: 'heads' | 'tails';
  source: 'manual' | 'toss';
  revision: number;
  status: 'pending' | 'settled';
  groups: WushuangGroup[];
  targetId?: string;
  seatWind: Wind;
  roundWind: Wind;
  rules: Pick<
    GameSettings,
    'playerCount' | 'akaDora' | 'openTanyao' | 'kiriageMangan' | 'kazoeYakuman'
  >;
  result?: {
    points: number;
    deposits: number;
    groupPoints: number[];
    settledAt: string;
  };
}
export type WushuangCommand =
  | {
      kind: 'wushuang.update';
      effectId: string;
      revision: number;
      groups: WushuangGroup[];
      targetId?: string;
    }
  | {
      kind: 'wushuang.commit';
      effectId: string;
      revision: number;
      physicalTilesConfirmed: boolean;
      expectedDeposits: number;
      expectedScore: number;
    };

export const newWushuangGroup = (): WushuangGroup => ({
  id: crypto.randomUUID(),
  tiles: [],
  winningTile: '',
  meldText: '',
  mode: 'smart',
  selected: [],
  fu: 30,
  dora: 0,
});
export const isWushuangCard = (card: { id: number; name: string }) =>
  card.id === 41 && card.name === '麻将无双';
const STRUCTURE_ONLY = new Set([
  'riichi',
  'double-riichi',
  'ippatsu',
  'haitei',
  'houtei',
  'rinshan',
  'chankan',
  'tenhou',
  'chiihou',
  'menzen-tsumo',
]);
export function scoreWushuangGroup(
  session: Pick<WushuangSession, 'seatWind' | 'roundWind' | 'rules'>,
  group: WushuangGroup,
): HandCandidate {
  if (
    !group.id ||
    group.id.length > 128 ||
    !Array.isArray(group.tiles) ||
    group.tiles.length > 18 ||
    !Number.isInteger(group.dora) ||
    group.dora < 0 ||
    group.dora > 40 ||
    !Array.isArray(group.selected) ||
    group.selected.length > 64 ||
    typeof group.meldText !== 'string' ||
    group.meldText.length > 128
  )
    throw Error('牌组资料无效');
  if (
    group.tiles.some(
      (t) =>
        tileIndex(t) < 0 ||
        (session.rules.playerCount === 3 && /^(?:0|[2-8])m$/.test(t)) ||
        (!session.rules.akaDora && t[0] === '0'),
    )
  )
    throw Error('牌组含本场未使用的牌');
  if (
    group.selected.some(
      (id) => STRUCTURE_ONLY.has(id) || !YAKU.some((y) => y.id === id),
    )
  )
    throw Error('本卡只计牌型役，不继承立直等现场役');
  if (group.meldText) throw Error('重组后的牌按门清计算，请清除原副露标记');
  if (group.dora < group.tiles.filter((t) => t[0] === '0').length)
    throw Error('本组宝牌总数不能少于已录入的赤宝牌');
  if (group.mode === 'smart') {
    const result = assessHandInput({
      tiles: group.tiles,
      winningTile: group.winningTile,
      meldText: '',
      closed: true,
      winType: 'ron',
      seatWind: session.seatWind,
      roundWind: session.roundWind,
      selected: [],
      bonusHan: group.dora,
      openTanyao: session.rules.openTanyao,
      kiriage: session.rules.kiriageMangan,
      kazoe: session.rules.kazoeYakuman,
    });
    if (!result.complete || !result.best)
      throw Error(
        result.error ||
          (group.tiles.length < 14 ? '请补齐本组 14 张牌' : '请选择本组和牌张'),
      );
    if (!result.best.han && !result.best.yakuman)
      throw Error('牌型成立但无役；宝牌不能单独构成和牌');
    return result.best;
  }
  if (
    group.mode !== 'manual' ||
    ![25, 30, 40, 50, 60, 70, 80, 90, 100, 110].includes(group.fu)
  )
    throw Error('门清荣和符数无效');
  const exclusive = [
    ['kokushi', 'kokushi-13'],
    ['suuankou', 'suuankou-tanki'],
    ['chuuren', 'junsei-chuuren'],
    ['iipeikou', 'ryanpeikou'],
    ['chanta', 'junchan'],
    ['honitsu', 'chinitsu'],
  ];
  if (
    exclusive.some(
      (ids) => ids.filter((id) => group.selected.includes(id)).length > 1,
    )
  )
    throw Error('请选择实际成立的一种牌型役，不能重复计算高低位役种');
  if (group.selected.includes('chiitoi') !== (group.fu === 25))
    throw Error('七对子固定 25 符，其他门清荣和不能使用 25 符');
  const selected = YAKU.filter((y) => group.selected.includes(y.id));
  const yakuman = selected.reduce((n, y) => n + (y.yakuman || 0), 0);
  const han = selected.reduce((n, y) => n + (y.yakuman ? 0 : y.closedHan), 0);
  if (!han && !yakuman) throw Error('请选择现场确认成立的牌型役');
  return {
    yaku: selected.map((y) => y.id),
    han,
    yakuman,
    fu: group.fu,
    groups: '现场核对',
    details: ['手动录入，牌型与符数由现场核对'],
    points: ceilHundred(
      scoreBase(
        han + group.dora,
        group.fu,
        yakuman,
        session.rules.kiriageMangan,
        session.rules.kazoeYakuman,
      ).base * (session.seatWind === '东' ? 6 : 4),
    ),
  };
}
export function validateWushuangGroups(
  session: Pick<WushuangSession, 'seatWind' | 'roundWind' | 'rules'>,
  groups: WushuangGroup[],
) {
  if (
    !Array.isArray(groups) ||
    groups.length > 9 ||
    new Set(groups.map((g) => g.id)).size !== groups.length
  )
    throw Error('牌组数量不能超过实体牌组容量，牌组编号不能重复');
  const counts = Array<number>(34).fill(0),
    reds = new Set<string>();
  for (const group of groups)
    for (const tile of group.tiles) {
      const index = tileIndex(tile);
      if (index < 0 || ++counts[index] > 4)
        throw Error('各组累计同一种牌不能超过四张，赤五与普通五合并计算');
      if (tile[0] === '0') {
        if (reds.has(tile)) throw Error('各组重复录入了同一张赤五');
        reds.add(tile);
      }
    }
  return groups.map((g) => scoreWushuangGroup(session, g));
}
export const wushuangYaku = YAKU.filter((y) => !STRUCTURE_ONLY.has(y.id));
