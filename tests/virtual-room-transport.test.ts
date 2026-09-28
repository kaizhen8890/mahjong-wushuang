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
console.log('PASS virtual transport: targeted delivery order, native event binding, disconnect, disposal and partial setup cleanup');
