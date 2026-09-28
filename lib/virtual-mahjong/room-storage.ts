import type { RoomCredentials } from './room-client';
import type { RoomCheckpoint } from './room';
export const VIRTUAL_SAVE_KEY = 'mahjong-wushuang.virtual-room.v1';
export type RoomSave = { format: 'musou.local.room'; version: 1 } & (
  { role: 'host'; checkpoint: RoomCheckpoint } |
  { role: 'client'; name: string; host: string; port: number; code: string; credentials: RoomCredentials });
export interface RoomStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
/** Separate from physical saves. Never accept a client game snapshot for local persistence. */
export function saveRoom(storage: RoomStorage, value: RoomSave) {
  const text = JSON.stringify(value);
  if (text.length > 4_000_000) throw new Error('虚拟房间存档过大，未能保存');
  storage.setItem(VIRTUAL_SAVE_KEY, text);
}
export function loadRoom(storage: RoomStorage): RoomSave | null {
  const text = storage.getItem(VIRTUAL_SAVE_KEY); if (!text) return null;
  try {
    if (text.length > 4_000_000) throw new Error();
    const value = JSON.parse(text) as RoomSave;
    if (value.format !== 'musou.local.room' || value.version !== 1) throw new Error();
    if (value.role === 'host') {
      if (value.checkpoint?.format !== 'musou.host.room') throw new Error();
      // Full Host semantic validation happens in restoreCheckpoint, before starting a socket.
      return value;
    }
    if (value.role !== 'client' || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) throw new Error();
    for (const [field, max] of [[value.name, 24], [value.host, 256], [value.code, 32], [value.credentials?.roomId, 128], [value.credentials?.playerId, 128], [value.credentials?.reconnectToken, 128]] as const) {
      if (typeof field !== 'string' || !field.trim() || field.length > max) throw new Error();
    }
    return { format: value.format, version: 1, role: 'client', name: value.name, host: value.host, port: value.port, code: value.code,
      credentials: { roomId: value.credentials.roomId, playerId: value.credentials.playerId, reconnectToken: value.credentials.reconnectToken } };
  } catch { throw new Error('虚拟房间存档无法读取，请放弃存档后重新建房或加入'); }
}
export function clearRoom(storage: RoomStorage) { storage.removeItem(VIRTUAL_SAVE_KEY); }

/** Reuse identity only for the same endpoint and room code; never send it to another room. */
export function matchingClientSave(storage: RoomStorage, target: { host: string; port: number; code: string }) {
  const saved = loadRoom(storage);
  return saved?.role === 'client' && saved.host.toLowerCase() === target.host.toLowerCase()
    && saved.port === target.port && saved.code.toUpperCase() === target.code.toUpperCase() ? saved : undefined;
}
