/** Dedicated, bounded emote cache; deleting/evicting emotes never touches character portraits. */
const DB = 'mahjong-emote-media:v1';
const PINNED = 'mahjong-emote-library:v1';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('media', { keyPath: 'hash' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function getEmoteMedia(hash: string): Promise<Blob | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => { const tx = db.transaction('media', 'readonly'), r = tx.objectStore('media').get(hash); let blob: Blob | undefined;
    r.onsuccess = () => { blob = r.result?.blob; }; tx.oncomplete = () => { db.close(); resolve(blob); }; tx.onerror = () => { db.close(); reject(tx.error); }; });
}
export async function putEmoteMedia(hash: string, blob: Blob): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(hash) || blob.size > 262144 || !['image/png','image/jpeg','image/webp'].includes(blob.type)) throw new Error('表情图片大小或类型无效');
  let pinned = new Set<string>();
  try { pinned = new Set((JSON.parse(localStorage.getItem(PINNED) ?? '{}').items ?? []).map((i: { hash: string }) => i.hash)); } catch { /* A broken library never bypasses the cache bound. */ }
  const db = await database();
  return new Promise((resolve, reject) => { const tx = db.transaction('media', 'readwrite'), store = tx.objectStore('media'), scan = store.getAll();
    scan.onsuccess = () => { const cached = scan.result.filter(r => !pinned.has(r.hash) && r.hash !== hash).sort((a,b) => a.at - b.at);
      for (const old of cached.slice(0, Math.max(0, cached.length - 99))) store.delete(old.hash);
      store.put({ hash, blob, at: Date.now() }); };
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; tx.onabort = () => { db.close(); reject(tx.error); }; });
}
