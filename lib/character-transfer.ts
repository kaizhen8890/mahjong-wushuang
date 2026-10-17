import { getCharacterMedia, mediaHash, putCharacterMedia } from './characters';

export const CHARACTER_CHUNK_BYTES = 6_000;
const MAX_IMAGE_BYTES = 1_500_000;
const HASH = /^[a-f0-9]{64}$/;
const MIMES = new Set(['image/webp', 'image/png', 'image/jpeg']);
export type AssetFrame =
  | { type: 'character.asset.request'; hash: string }
  | { type: 'character.asset.available'; hash: string }
  | { type: 'character.asset.chunk'; hash: string; index: number; total: number; mime: string; data: string };

export function readAssetFrame(value: unknown): AssetFrame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (!['character.asset.request', 'character.asset.available', 'character.asset.chunk'].includes(String(entry.type))) return null;
  if (typeof entry.hash !== 'string' || !HASH.test(entry.hash)) throw new Error('INVALID_CHARACTER_ASSET');
  if (entry.type !== 'character.asset.chunk') return { type: entry.type as 'character.asset.request' | 'character.asset.available', hash: entry.hash };
  if (!Number.isInteger(entry.index) || !Number.isInteger(entry.total) || Number(entry.index) < 0 || Number(entry.total) < 1 || Number(entry.total) > 250 || Number(entry.index) >= Number(entry.total)
    || typeof entry.mime !== 'string' || !MIMES.has(entry.mime) || typeof entry.data !== 'string' || entry.data.length > 8_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data)) throw new Error('INVALID_CHARACTER_ASSET');
  return { type: 'character.asset.chunk', hash: entry.hash, index: Number(entry.index), total: Number(entry.total), mime: entry.mime, data: entry.data };
}

export async function sendCharacterAsset(hash: string, send: (frame: AssetFrame) => Promise<void>, read = getCharacterMedia): Promise<boolean> {
  if (!HASH.test(hash)) return false;
  const blob = await read(hash);
  if (!blob || blob.size > MAX_IMAGE_BYTES || !MIMES.has(blob.type) || await mediaHash(blob) !== hash) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const total = Math.ceil(bytes.length / CHARACTER_CHUNK_BYTES);
  for (let index = 0; index < total; index++) {
    const part = bytes.subarray(index * CHARACTER_CHUNK_BYTES, (index + 1) * CHARACTER_CHUNK_BYTES);
    await send({ type: 'character.asset.chunk', hash, index, total, mime: blob.type,
      data: btoa(String.fromCharCode(...part)) });
    if (index % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return true;
}

interface Incoming { mime: string; total: number; parts: Uint8Array[]; bytes: number; started: number }
export class CharacterAssetReceiver {
  private incoming = new Map<string, Incoming>();
  constructor(private options: { maxBytes?: number; maxDimension?: number; save?: typeof putCharacterMedia } = {}) {}
  async accept(key: string, frame: Extract<AssetFrame, { type: 'character.asset.chunk' }>): Promise<boolean> {
    const decoded = atob(frame.data);
    if (decoded.length > CHARACTER_CHUNK_BYTES || decoded.length === 0) throw new Error('INVALID_CHARACTER_ASSET');
    let transfer = this.incoming.get(key);
    if (frame.index === 0) {
      if (this.incoming.size >= 10) this.incoming.delete(this.incoming.keys().next().value!);
      transfer = { mime: frame.mime, total: frame.total, parts: [], bytes: 0, started: Date.now() };
      this.incoming.set(key, transfer);
    }
    if (!transfer || transfer.mime !== frame.mime || transfer.total !== frame.total || transfer.parts.length !== frame.index || Date.now() - transfer.started > 60_000) {
      this.incoming.delete(key); throw new Error('INVALID_CHARACTER_ASSET');
    }
    const part = Uint8Array.from(decoded, character => character.charCodeAt(0));
    transfer.parts.push(part); transfer.bytes += part.length;
    if (transfer.bytes > (this.options.maxBytes ?? MAX_IMAGE_BYTES)) { this.incoming.delete(key); throw new Error('CHARACTER_ASSET_TOO_LARGE'); }
    if (transfer.parts.length !== transfer.total) return false;
    this.incoming.delete(key);
    const bytes = new Uint8Array(transfer.bytes);
    let offset = 0; for (const chunk of transfer.parts) { bytes.set(chunk, offset); offset += chunk.length; }
    const blob = new Blob([bytes], { type: transfer.mime });
    if (await mediaHash(blob) !== frame.hash) throw new Error('CHARACTER_ASSET_HASH_MISMATCH');
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width > (this.options.maxDimension ?? 2000) || bitmap.height > (this.options.maxDimension ?? 2000)) throw new Error('CHARACTER_ASSET_DIMENSIONS');
    } finally { bitmap.close(); }
    await (this.options.save ?? putCharacterMedia)(frame.hash, blob);
    return true;
  }
  clear() { this.incoming.clear(); }
}
