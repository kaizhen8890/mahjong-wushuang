import artworkManifest from '../public/skill-cards/manifest.json';
export interface NfcCard {
  id: number;
  name: string;
  effectDescription: string;
  artwork?: string | null;
  custom?: boolean;
}
export interface NfcTagRead {
  sessionId: string;
  uid: string;
  technologies: string[];
  ndef: boolean;
  writable?: boolean;
  capacity?: number;
}
export interface NfcBinding {
  uid: string;
  cardId: number;
  cardName: string;
  updatedAt: string;
}
export interface NfcBindings {
  version: 1;
  bindings: NfcBinding[];
}
export const NFC_BINDINGS_KEY = 'mahjong-wushuang:nfc-bindings:v1';
export function normalizeNfcUid(uid: string) {
  if (!/^(?:[0-9a-f]{2}){4,16}$/i.test(uid))
    throw Error('芯片编号无效，请移开卡片后重试');
  return uid.toUpperCase();
}
export function parseNfcBindings(raw: string | null): NfcBindings {
  if (raw === null) return { version: 1, bindings: [] };
  if (raw.length > 1048576) throw Error('绑定资料过大，原资料已保留');
  let data: NfcBindings;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error('本机绑定资料无法读取，原资料已保留，请先备份后处理');
  }
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.bindings) ||
    data.bindings.length > 2048
  )
    throw Error('本机绑定资料格式不支持，原资料已保留');
  const seen = new Set<string>();
  for (const b of data.bindings) {
    if (
      !b ||
      typeof b.uid !== 'string' ||
      normalizeNfcUid(b.uid) !== b.uid ||
      seen.has(b.uid) ||
      !Number.isSafeInteger(b.cardId) ||
      b.cardId < 1 ||
      typeof b.cardName !== 'string' ||
      !b.cardName ||
      b.cardName.length > 200 ||
      typeof b.updatedAt !== 'string'
    )
      throw Error('本机绑定资料不完整，原资料已保留');
    seen.add(b.uid);
  }
  return data;
}
export function resolveNfcCard(
  data: NfcBindings,
  uid: string,
  cards: readonly NfcCard[],
) {
  const binding = data.bindings.find((b) => b.uid === normalizeNfcUid(uid));
  const card =
    binding &&
    cards.find((c) => c.id === binding.cardId && c.name === binding.cardName);
  return { binding, card };
}
export function bindNfcCard(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  uid: string,
  card: NfcCard,
): NfcBindings {
  const raw = storage.getItem(NFC_BINDINGS_KEY),
    data = parseNfcBindings(raw);
  const id = normalizeNfcUid(uid);
  if (
    !Number.isSafeInteger(card.id) ||
    card.id < 1 ||
    !card.name ||
    card.name.length > 200
  )
    throw Error('技能资料无效');
  if (!data.bindings.some((b) => b.uid === id) && data.bindings.length >= 2048)
    throw Error('绑定数量已达上限');
  const next: NfcBindings = {
    version: 1,
    bindings: [
      ...data.bindings.filter((b) => b.uid !== id),
      {
        uid: id,
        cardId: card.id,
        cardName: card.name,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  // Preserve the last real file before changing a mapping; storage errors leave the original map intact.
  if (raw !== null) storage.setItem(NFC_BINDINGS_KEY + ':previous', raw);
  storage.setItem(NFC_BINDINGS_KEY, JSON.stringify(next));
  return next;
}

export function nfcCardArtwork(card: NfcCard): string | undefined {
  if (card.artwork) return card.artwork;
  return artworkManifest.cards.find(
    (c) =>
      c.cardId === card.id &&
      (c.name === card.name || c.name.startsWith(card.name + ' ')),
  )?.src;
}
