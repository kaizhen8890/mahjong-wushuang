import bundled from '../data/skill-cards.json';
import { NFC_IDENTITIES, nfcSkill, type NfcIdentity } from './nfc-registry';
import type { NfcCard } from './nfc-cards';

export type NfcCodeFilter = 'all' | 'skill' | 'music' | 'alias';
/** The shipped allowlist owns codes. Local card order, names and IDs never mint an identity. */
export function nfcCodeRows(query: string, filter: NfcCodeFilter) {
  const search = query.trim().toLocaleLowerCase('zh-CN');
  return NFC_IDENTITIES.filter(identity =>
    (filter === 'all' || (filter === 'alias' ? Boolean(identity.aliasOf) : !identity.aliasOf && identity.action === filter)) &&
    (!search || `${identity.code} ${identity.name} ${identity.skillName} ${identity.uri}`.toLocaleLowerCase('zh-CN').includes(search)),
  ).map(identity => ({ identity, card: nfcSkill(identity, bundled.cards)! }));
}

export function unregisteredNfcCards<T extends NfcCard>(cards: readonly T[]): T[] {
  return cards.filter(card => !NFC_IDENTITIES.some(identity => identity.action === 'skill' && nfcSkill(identity, [card])));
}

export function nfcCodeLabel(identity: NfcIdentity): string {
  return identity.aliasOf ? `兼容 · 新卡用 ${identity.aliasOf}` : identity.action === 'music' ? '特别音乐卡' : '技能卡';
}

/** Export only public write instructions; never media paths, local cards or game state. */
export function nfcCodeExport() {
  return { format: 'mahjong-wushuang.nfc-codes', version: 1, revision: bundled.catalogRevision,
    recordType: 'NDEF URI', migration: 'beta37：旧002→005，旧003→002，旧004→003，旧005→004；001、006不变。所有设备应使用同一版本。',
    cards: NFC_IDENTITIES.map(({ code, name, uri, action, skillId, skillName, aliasOf }) =>
      ({ code, name, uri, action, skillId, skillName, ...(aliasOf ? { aliasOf } : {}) })),
  };
}
