import { GAME_EMOTES, GAME_EMOTES_BY_ID, type GameEmote } from './emotes';
import { mediaHash } from './characters';
import { getEmoteMedia, putEmoteMedia } from './emote-media';
export interface EmoteMeta { id: string; hash: string; label: string }
export interface OwnedEmote extends EmoteMeta { category: string }
export interface EmoteLibrary { items: OwnedEmote[]; categories: string[]; favorites: string[]; recent: string[] }
const KEY = 'mahjong-emote-library:v1';
export function normalizeEmoteCategory(value: unknown): string {
  const text = typeof value === 'string' && value.trim() ? value.trim().slice(0, 30) : '我的表情';
  return ['收藏', '最近', '全部', '内置'].includes(text) ? `自定义 · ${text}` : text;
}
let library: EmoteLibrary = { items: [], categories: ['我的表情'], favorites: [], recent: [] };
let revision = 0, loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();
const registered = new Map<string, EmoteMeta>();
export const emoteVersion = () => revision;
export const subscribeEmotes = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const changed = () => { revision++; listeners.forEach(f => f()); };
export const emoteLibrary = () => library;
export const emoteMeta = (id: string) => registered.get(id);
export const customEmoteId = (hash: string) => `x-${hash.slice(0, 60)}`;
export function readEmoteMeta(value: unknown): EmoteMeta {
  const v = value as Partial<EmoteMeta> | null;
  if (!v || typeof v.hash !== 'string' || !/^[a-f0-9]{64}$/.test(v.hash) || v.id !== customEmoteId(v.hash) || typeof v.label !== 'string' || !v.label.trim() || v.label.length > 40) throw new Error('表情资料无效');
  return { id: v.id, hash: v.hash, label: v.label.trim() };
}
export async function registerEmote(meta: EmoteMeta): Promise<void> {
  meta = readEmoteMeta(meta);
  const existing = registered.get(meta.id);
  if (existing) { if (existing.hash !== meta.hash) throw new Error('表情编号冲突'); return; }
  const blob = await getEmoteMedia(meta.hash);
  if (!blob || blob.size > 262144 || !['image/png','image/jpeg','image/webp'].includes(blob.type) || await mediaHash(blob) !== meta.hash) throw new Error('表情图片不存在或校验失败');
  const bitmap = await createImageBitmap(blob);
  try { if (!bitmap.width || !bitmap.height || bitmap.width > 512 || bitmap.height > 512) throw new Error('表情尺寸超过 512 像素'); }
  finally { bitmap.close(); }
  // A transfer cache is not an owned library item; no automatic addition to the picker.
  if (registered.size >= 600) {
    const key = [...registered.keys()].find(id => !library.items.some(i => i.id === id));
    if (key) { const old = GAME_EMOTES_BY_ID.get(key); if (old) URL.revokeObjectURL(old.src); registered.delete(key); GAME_EMOTES_BY_ID.delete(key); }
  }
  registered.set(meta.id, meta); GAME_EMOTES_BY_ID.set(meta.id, { id: meta.id, label: meta.label, src: URL.createObjectURL(blob) }); changed();
}
export function loadEmoteLibrary(): Promise<void> {
  return loaded ??= (async () => {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (!Array.isArray(v.items) || v.items.length > 500 || !Array.isArray(v.categories)) throw new Error('表情库资料无效');
      library = { items: v.items.map((i: OwnedEmote) => ({ ...readEmoteMeta(i), category: normalizeEmoteCategory(i.category) })), categories: [...new Set<string>(v.categories.filter((s: unknown) => typeof s === 'string').map(normalizeEmoteCategory))].slice(0, 50), favorites: Array.isArray(v.favorites) ? v.favorites.slice(0, 600) : [], recent: Array.isArray(v.recent) ? v.recent.slice(0, 40) : [] };
    }
    await Promise.allSettled(library.items.map(registerEmote)); changed();
  })().catch(error => { loaded = undefined; throw error; });
}
export function updateEmoteLibrary(update: (current: EmoteLibrary) => EmoteLibrary) {
  const next = update(library); localStorage.setItem(KEY, JSON.stringify(next)); library = next; changed();
}
export function rememberEmote(id: string) { updateEmoteLibrary(l => ({ ...l, recent: [id, ...l.recent.filter(x => x !== id)].slice(0, 40) })); }
export function ownedEmotes(): GameEmote[] { return [...GAME_EMOTES, ...library.items.flatMap(m => { const e = GAME_EMOTES_BY_ID.get(m.id); return e ? [{ ...e, label: m.label }] : []; })]; }
export async function importEmoteImage(file: File, category: string) {
  await loadEmoteLibrary();
  category = normalizeEmoteCategory(category);
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12000000) throw new Error('请使用小于 12 MB 的 PNG、JPEG 或 WebP 图片');
  const bitmap = await createImageBitmap(file);
  let blob: Blob;
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('图片尺寸太大');
    const scale = Math.min(1, 384 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(v => v ? resolve(v) : reject(new Error('图片处理失败')), 'image/webp', .88));
  } finally { bitmap.close(); }
  if (blob.size > 262144) throw new Error('表情压缩后仍超过 256 KB');
  const hash = await mediaHash(blob), meta = { id: customEmoteId(hash), hash, label: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '表情' };
  if (library.items.length >= 500 && !library.items.some(i => i.id === meta.id)) throw new Error('最多保存 500 个自定义表情');
  await putEmoteMedia(hash, blob); await registerEmote(meta);
  updateEmoteLibrary(l => ({ ...l, items: [...l.items.filter(i => i.id !== meta.id), { ...meta, category }], categories: [...new Set([...l.categories, category])] })); return meta;
}
export async function exportEmotePack(category?: string) {
  const items = library.items.filter(i => !category || i.category === category);
  if (items.length > 80) throw new Error('每包最多 80 张，请按分类导出');
  const images = [];
  for (const item of items) {
    const blob = await getEmoteMedia(item.hash); if (!blob) throw new Error('部分图片丢失');
    const bytes = new Uint8Array(await blob.arrayBuffer()); let data = '';
    for (let offset = 0; offset < bytes.length; offset += 6000) data += String.fromCharCode(...bytes.subarray(offset, offset + 6000));
    images.push({ ...item, mime: blob.type, data: btoa(data) });
  }
  const result = new Blob([JSON.stringify({ format: 'musou.emotes', version: 1, items: images })], { type: 'application/json' });
  if (result.size > 28000000) throw new Error('表情包超过 28 MB，请缩小分类'); return result;
}
export async function importEmotePack(file: Blob) {
  await loadEmoteLibrary();
  if (file.size > 28000000) throw new Error('表情包超过 28 MB');
  const pack = JSON.parse(await file.text());
  if (pack.format !== 'musou.emotes' || pack.version !== 1 || !Array.isArray(pack.items) || pack.items.length > 80) throw new Error('表情包格式无效');
  const prepared: { item: OwnedEmote; blob: Blob }[] = [];
  for (const raw of pack.items) {
    const meta = readEmoteMeta(raw);
    if (!['image/png','image/jpeg','image/webp'].includes(raw.mime) || typeof raw.data !== 'string' || raw.data.length > 350000) throw new Error('图片内容无效');
    const blob = new Blob([Uint8Array.from(atob(raw.data), c => c.charCodeAt(0))], { type: raw.mime });
    if (blob.size > 262144 || await mediaHash(blob) !== meta.hash) throw new Error('图片校验失败');
    const bitmap = await createImageBitmap(blob);
    try { if (!bitmap.width || !bitmap.height || bitmap.width > 512 || bitmap.height > 512) throw new Error('图片尺寸无效'); } finally { bitmap.close(); }
    prepared.push({ item: { ...meta, category: normalizeEmoteCategory(raw.category || '导入表情') }, blob });
  }
  const merged = new Map(library.items.map(i => [i.id, i])); prepared.forEach(p => merged.set(p.item.id, p.item));
  if (merged.size > 500) throw new Error('导入后超过 500 张上限');
  const categories = [...new Set([...library.categories, ...prepared.map(p => p.item.category)])];
  if (categories.length > 50) throw new Error('最多 50 个分类');
  for (const p of prepared) { await putEmoteMedia(p.item.hash, p.blob); await registerEmote(p.item); }
  updateEmoteLibrary(l => ({ ...l, items: [...merged.values()], categories }));
}
