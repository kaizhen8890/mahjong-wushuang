import assert from 'node:assert/strict';
import { attachVirtualRoom, type VirtualHostPort } from '../lib/virtual-mahjong/room-transport';
import { VirtualRoomHost, VIRTUAL_ROOM_PROTOCOL } from '../lib/virtual-mahjong/room';
import { defaultRules } from '../lib/virtual-mahjong/rules';
import type { PeerMessageEvent, PeerEvent } from '../lib/lan-native';
let sequence = 0, removed = 0, changed = 0;
const room = new VirtualRoomHost({ roomId: 'r', code: 'code', hostName: 'Host', rules: defaultRules() }, { now: () => 0 }, () => `id-${++sequence}`);
let message: (event: PeerMessageEvent) => void = () => {};
let closed: (event: PeerEvent) => void = () => {};
const sent: { connectionId: string; text: string }[] = [];
const port = {
  async sendTo(value: { connectionId: string; text: string }) { sent.push(value); },
  async addListener(name: string, callback: ((event: PeerMessageEvent) => void) | ((event: PeerEvent) => void)) {
    if (name === 'peerMessage') message = callback as typeof message; else closed = callback as typeof closed;
    return { async remove() { removed++; } };
  },
} satisfies VirtualHostPort;
const errors: unknown[] = [];
const adapter = await attachVirtualRoom(room, port, () => { changed++; }, cause => errors.push(cause));
message({ connectionId: 'peer', text: JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'r', type: 'JOIN', code: 'code', name: 'Player' }) });
adapter.publish(room.setHostReady(true));
await adapter.flush();
assert.deepEqual(sent.map(item => JSON.parse(item.text).type), ['WELCOME', 'SNAPSHOT']);
assert.ok(sent.every(item => item.connectionId === 'peer'));
assert.equal(JSON.parse(sent[1].text).revision, room.localView().revision, 'Queued snapshots coalesce to the latest state');
closed({ connectionId: 'peer' }); assert.equal(room.localView().seats[1].connected, false);
assert.ok(changed >= 2); assert.deepEqual(errors, []);
await adapter.dispose(); assert.equal(removed, 2);
const before = sent.length;
message({ connectionId: 'ignored', text: '{}' }); await adapter.flush(); assert.equal(sent.length, before);
let cleaned = false;
await assert.rejects(attachVirtualRoom(room, { ...port, async addListener(name: string) {
  if (name === 'peerClosed') throw new Error('listener failed');
  return { async remove() { cleaned = true; } };
} }, () => {}, () => {}));
assert.ok(cleaned);
// A custom emote's first media transfer is deferred outside the gameplay delivery queue.
const sentWhileMediaPending: string[] = [];
let finishMedia!: () => void;
const mediaPending = new Promise<void>(resolve => { finishMedia = resolve; });
let lateEmoteDelivered = false;
const nonBlocking = await attachVirtualRoom(room, {
  ...port,
  async sendTo(value) { sentWhileMediaPending.push(JSON.parse(value.text).type); },
}, () => {}, cause => { throw cause; }, undefined, async delivery => {
  if (JSON.parse(delivery.text).type !== 'EMOTE') return;
  void mediaPending.then(() => { lateEmoteDelivered = true; });
  return false;
});
nonBlocking.publish([
  { connectionId: 'bound-peer', text: JSON.stringify({ type: 'EMOTE' }) },
  { connectionId: 'bound-peer', text: JSON.stringify({ type: 'SNAPSHOT', revision: 100 }) },
]);
await nonBlocking.flush();
assert.deepEqual(sentWhileMediaPending, ['SNAPSHOT'], 'Gameplay snapshot reaches the peer before custom media is ready');
assert.equal(lateEmoteDelivered, false);
finishMedia(); await mediaPending; await Promise.resolve();
assert.equal(lateEmoteDelivered, true);
await nonBlocking.dispose();
console.log('PASS virtual transport: targeted delivery order, coalesced snapshots, deferred emote media without blocking gameplay, disconnect, disposal and setup cleanup');
