import manifest from '@/public/characters/manifest.json';

export interface CharacterChoice {
  id: string;
  name: string;
  avatarHash?: string;
  portraitHash?: string;
}

export const BUILTIN_CHARACTERS: CharacterChoice[] = manifest.characters.map(({ id, name }) => ({ id, name }));
const builtins = new Map(manifest.characters.map(character => [character.id, character]));
const DEFAULT_SEAT_CHARACTER_IDS = ['deepseek', 'claude', 'gpt', 'gemini'] as const;
export const DEFAULT_SEAT_CHARACTERS: readonly CharacterChoice[] = DEFAULT_SEAT_CHARACTER_IDS.map(id => {
  const character = BUILTIN_CHARACTERS.find(item => item.id === id);
  if (!character) throw new Error(`缺少默认角色：${id}`);
  return character;
});
export const DEFAULT_CHARACTER: CharacterChoice = DEFAULT_SEAT_CHARACTERS[0];
export function defaultSeatCharacter(index: number): CharacterChoice {
  return DEFAULT_SEAT_CHARACTERS[index] ?? DEFAULT_CHARACTER;
}
export const CHARACTER_MEDIA_EVENT = 'mahjong-character-media';

export function builtinCharacter(id: string) { return builtins.get(id); }
export function validCharacterChoice(value: unknown): value is CharacterChoice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const choice = value as Record<string, unknown>;
  if (typeof choice.id !== 'string' || !/^[a-z0-9:-]{1,80}$/.test(choice.id)
    || typeof choice.name !== 'string' || !choice.name.trim() || choice.name.length > 36) return false;
  const builtin = builtinCharacter(choice.id);
  if (builtin) return Object.keys(choice).every(key => ['id', 'name'].includes(key)) && choice.name === builtin.name;
  return choice.id.startsWith('custom:')
    && Object.keys(choice).every(key => ['id', 'name', 'avatarHash', 'portraitHash'].includes(key))
    && typeof choice.avatarHash === 'string' && /^[a-f0-9]{64}$/.test(choice.avatarHash)
    && typeof choice.portraitHash === 'string' && /^[a-f0-9]{64}$/.test(choice.portraitHash);
}

export function characterChoice(value: unknown): CharacterChoice {
  if (!validCharacterChoice(value)) return DEFAULT_CHARACTER;
  const builtin = BUILTIN_CHARACTERS.find(item => item.id === value.id);
  return builtin ?? { id: value.id, name: value.name, avatarHash: value.avatarHash, portraitHash: value.portraitHash };
}

const DB_NAME = 'mahjong-wushuang.characters.v1';
const DB_VERSION = 1;
const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
    if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function transaction<T>(store: 'media' | 'characters', mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    action(tx.objectStore(store), result => { value = result; }, reject);
  });
}

export function getCharacterMedia(hash: string): Promise<Blob | undefined> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return Promise.resolve(undefined);
  return transaction('media', 'readonly', (store, resolve, reject) => {
    const request = store.get(hash);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
}
export async function putCharacterMedia(hash: string, blob: Blob): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(hash) || blob.size > 1_500_000 || !['image/webp', 'image/png', 'image/jpeg'].includes(blob.type))
    throw new Error('角色图片类型或大小无效');
  await transaction<void>('media', 'readwrite', (store, resolve, reject) => {
    const request = store.put(blob, hash);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHARACTER_MEDIA_EVENT, { detail: hash }));
}
export function listCustomCharacters(): Promise<CharacterChoice[]> {
  return transaction('characters', 'readonly', (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as unknown[]).filter(validCharacterChoice));
    request.onerror = () => reject(request.error);
  });
}
export function saveCustomCharacter(choice: CharacterChoice): Promise<void> {
  if (!validCharacterChoice(choice) || !choice.id.startsWith('custom:')) return Promise.reject(new Error('角色资料无效'));
  return transaction('characters', 'readwrite', (store, resolve, reject) => {
    const request = store.put(choice);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}
export function deleteCustomCharacter(id: string): Promise<void> {
  if (!id.startsWith('custom:')) return Promise.reject(new Error('只能删除自定义角色'));
  return transaction('characters', 'readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}
export async function mediaHash(blob: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function normalizeCharacterImage(file: Blob, kind: 'avatar' | 'portrait', cropX = 50, cropY = 50, zoom = 1): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > 12_000_000) throw new Error('请选择不超过 12 MB 的图片');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 5000 || bitmap.height > 5000) throw new Error('图片像素过大');
    const canvas = document.createElement('canvas');
    if (kind === 'avatar') {
      canvas.width = canvas.height = 256;
      const side = Math.min(bitmap.width, bitmap.height) / Math.max(1, zoom);
      const sx = (bitmap.width - side) * cropX / 100, sy = (bitmap.height - side) * cropY / 100;
      canvas.getContext('2d')!.drawImage(bitmap, sx, sy, side, side, 0, 0, 256, 256);
    } else {
      const scale = Math.min(1, 1200 / bitmap.height, 900 / bitmap.width);
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片处理失败')), 'image/webp', .84));
    if (blob.size > 1_500_000) throw new Error('处理后的图片仍超过大小限制');
    return blob;
  } finally { bitmap.close(); }
}

export async function importCustomCharacter(name: string, avatarFile: Blob, portraitFile: Blob,
  cropX = 50, cropY = 50, zoom = 1, replaceId?: string): Promise<CharacterChoice> {
  const label = name.trim(); if (!label || label.length > 36) throw new Error('角色名须为 1 至 36 字');
  const avatar = await normalizeCharacterImage(avatarFile, 'avatar', cropX, cropY, zoom);
  const portrait = await normalizeCharacterImage(portraitFile, 'portrait');
  const avatarHash = await mediaHash(avatar), portraitHash = await mediaHash(portrait);
  await Promise.all([putCharacterMedia(avatarHash, avatar), putCharacterMedia(portraitHash, portrait)]);
  if (replaceId && (!replaceId.startsWith('custom:') || !/^[a-z0-9:-]{1,80}$/.test(replaceId))) throw new Error('只能替换自定义角色');
  const choice = { id: replaceId ?? `custom:${crypto.randomUUID()}`, name: label, avatarHash, portraitHash };
  await saveCustomCharacter(choice);
  return choice;
}

const encodeBlob = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let base64 = '';
  for (let offset = 0; offset < bytes.length; offset += 6000) base64 += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 6000)));
  return { mime: blob.type, base64 };
};
const decodeBlob = (value: unknown): Blob => {
  if (!value || typeof value !== 'object') throw new Error('角色图片资料无效');
  const part = value as Record<string, unknown>;
  if (typeof part.mime !== 'string' || !['image/webp', 'image/png', 'image/jpeg'].includes(part.mime)
    || typeof part.base64 !== 'string' || part.base64.length > 2_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(part.base64)) throw new Error('角色图片资料无效');
  const data = atob(part.base64);
  if (!data.length || data.length > 1_500_000) throw new Error('角色图片过大');
  return new Blob([Uint8Array.from(data, char => char.charCodeAt(0))], { type: part.mime });
};
export async function exportCharacterPack(choice: CharacterChoice): Promise<Blob> {
  if (!validCharacterChoice(choice) || !choice.id.startsWith('custom:')) throw new Error('只能导出自定义角色');
  const avatar = await getCharacterMedia(choice.avatarHash!), portrait = await getCharacterMedia(choice.portraitHash!);
  if (!avatar || !portrait) throw new Error('角色图片缺失');
  return new Blob([JSON.stringify({ format: 'mahjong-wushuang.character', version: 1, character: choice,
    avatar: await encodeBlob(avatar), portrait: await encodeBlob(portrait) })], { type: 'application/json' });
}
export async function importCharacterPack(file: Blob): Promise<CharacterChoice> {
  if (file.size > 4_500_000) throw new Error('角色包过大');
  const pack = JSON.parse(await file.text()) as Record<string, unknown>;
  if (pack.format !== 'mahjong-wushuang.character' || pack.version !== 1 || !validCharacterChoice(pack.character)
    || !pack.character.id.startsWith('custom:')) throw new Error('角色包格式无效');
  const choice = pack.character, avatar = decodeBlob(pack.avatar), portrait = decodeBlob(pack.portrait);
  if (await mediaHash(avatar) !== choice.avatarHash || await mediaHash(portrait) !== choice.portraitHash) throw new Error('角色图片校验失败');
  for (const blob of [avatar, portrait]) {
    const bitmap = await createImageBitmap(blob);
    try { if (!bitmap.width || !bitmap.height || bitmap.width > 2000 || bitmap.height > 2000) throw new Error('角色图片尺寸无效'); }
    finally { bitmap.close(); }
  }
  await putCharacterMedia(choice.avatarHash!, avatar);
  await putCharacterMedia(choice.portraitHash!, portrait);
  await saveCustomCharacter(choice);
  return choice;
}
