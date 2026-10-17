import { LAN_PROTOCOL_VERSION } from '../lib/lan-protocol';
import assert from 'node:assert/strict';
import { mediaHash } from '../lib/characters';
import { customEmoteId, readEmoteMeta, type EmoteMeta } from '../lib/emote-library';
import { EmotePeer, EmoteRoomAssets, type EmoteFrame, type EmoteMediaPort } from '../lib/emote-transfer';
import { CharacterAssetReceiver } from '../lib/character-transfer';
// Use a real PNG payload and deterministic bitmap decoder dimensions for protocol unit tests.
const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9Z0AAAAASUVORK5CYII='), c => c.charCodeAt(0))], { type: 'image/png' });
const hash = await mediaHash(png), meta = { hash, id: customEmoteId(hash), label: '测试表情' };
assert.deepEqual(readEmoteMeta(meta), meta);
assert.throws(() => readEmoteMeta({ ...meta, id: '1000' })); assert.throws(() => readEmoteMeta({ ...meta, hash: '../../secret' })); assert.throws(() => readEmoteMeta({ ...meta, label: 'x'.repeat(41) }));
const port = (initial: boolean) => {
 const media = new Map<string, Blob>(initial ? [[hash, png]] : []), registry = new Map<string, EmoteMeta>(initial ? [[meta.id, meta]] : []);
 return { read: async (h: string) => media.get(h), save: async (h: string, blob: Blob) => { media.set(h,blob); }, register: async (m: EmoteMeta) => { assert.equal(await mediaHash(media.get(m.hash)!), m.hash); registry.set(m.id,m); }, meta: (id: string) => registry.get(id), has: (id: string) => registry.has(id) } satisfies EmoteMediaPort;
};
const old = globalThis.createImageBitmap;
globalThis.createImageBitmap = (async () => ({ width: 1, height: 1, close() {} })) as any;
try {
 const source = port(true), destination = port(false); const errors: unknown[] = [], frames: EmoteFrame[] = [];
 let left!: EmotePeer, right!: EmotePeer;
 left = new EmotePeer(async frame => { frames.push(frame); void right.accept(frame).catch(e => errors.push(e)); }, source);
 right = new EmotePeer(async frame => { frames.push(frame); void left.accept(frame).catch(e => errors.push(e)); }, destination);
 await Promise.all([left.ensure(meta.id), left.ensure(meta.id)]);
 assert.equal(errors.length, 0); assert.ok(destination.has(meta.id)); assert.ok(right.allowed(meta.id));
 assert.equal(frames.filter(f => f.type === 'emote.asset.offer').length, 1);
 assert.ok(frames.every(f => JSON.stringify(f).length < 32768));
 const count = frames.length; await left.ensure(meta.id); assert.equal(frames.length, count);
 const stranger = new EmotePeer(async () => {}, port(false));
 await assert.rejects(stranger.accept({ type: 'emote.asset.request', hash }), /未授权/);
 await assert.rejects(stranger.accept({ type: 'emote.asset.chunk', hash, total: 1, index: 0, mime: 'image/png', data: 'YQ==' }), /未声明/);
 await stranger.accept({ type: 'emote.asset.offer', meta });
 await assert.rejects(stranger.accept({ type: 'emote.asset.chunk', hash, total: 45, index: 0, mime: 'image/png', data: 'YQ==' }), /过大/);
 await assert.rejects(stranger.accept({ type: 'emote.asset.chunk', hash, total: 1, index: 0, mime: 'image/png', data: 'YQ==' }), /HASH_MISMATCH/);
 let wrote = false;
 const bounded = new CharacterAssetReceiver({ maxBytes: 1, maxDimension: 512, save: async () => { wrote = true; } });
 await assert.rejects(bounded.accept('x', { type: 'character.asset.chunk', hash, total: 1, index: 0, mime: 'image/png', data: 'YWJj' }), /TOO_LARGE/); assert.equal(wrote, false);
 const halted = new EmotePeer(async () => {}, source); const pending = halted.ensure(meta.id); halted.clear(); await assert.rejects(pending, /已结束/);
 left.clear(); right.clear(); stranger.clear();
 const denied: unknown[] = []; let sent = 0;
 const room = new EmoteRoomAssets(6, () => 'room', peer => peer === 'bound', async () => { sent++; }, e => denied.push(e));
 room.handle('unbound', JSON.stringify({ protocol: LAN_PROTOCOL_VERSION, roomId: 'room', type: 'emote.asset.offer', meta }));
 room.handle('bound', JSON.stringify({ protocol: LAN_PROTOCOL_VERSION, roomId: 'other', type: 'emote.asset.offer', meta }));
 assert.equal(denied.length, 2); assert.equal(sent, 0); assert.equal(room.allowed('unbound', '1000'), false); assert.equal(room.allowed('bound', meta.id), false);
 room.clear();
} finally { globalThis.createImageBitmap = old; }
console.log('PASS custom emotes: stable IDs, strict metadata, authenticated room boundary, bounded/hash-verified chunks, send-once handshake, shared concurrent upload, cancellation and unknown requests.');
