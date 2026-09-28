import assert from 'node:assert/strict';
import { startVirtualNativeHost, type NativeVirtualHostPort } from '../lib/virtual-mahjong/native-host';
import { VirtualRoomHost } from '../lib/virtual-mahjong/room';
import { defaultRules } from '../lib/virtual-mahjong/rules';
let sequence = 0;
const makeRoom = () => new VirtualRoomHost({ roomId: 'r', code: 'ABCDEF', hostName: 'Host', rules: defaultRules() }, { now: () => 0 }, () => `id-${++sequence}`);
const events: string[] = [];
const port: NativeVirtualHostPort = {
  async sendTo() {},
  async addListener(name) { events.push(name); return { async remove() { events.push(`remove:${name}`); } }; },
  async startHost(options) { events.push('start'); return { host: '192.168.1.2', port: options.preferredPort, serviceName: options.serviceName }; },
  async stopHost() { events.push('stop'); },
};
let tick = () => {};
const scheduler = { every(callback: () => void) { tick = callback; events.push('timer'); return () => { events.push('cancel'); }; } };
const room = makeRoom();
const host = await startVirtualNativeHost(room, port, '麻将无双·虚拟·ABCDEF', () => {}, cause => { throw cause; }, scheduler);
assert.deepEqual(events, ['peerMessage', 'peerClosed', 'start', 'timer']);
host.command(() => room.setHostReady(true)); assert.equal(room.localView().seats[0].ready, true);
tick(); await host.close(); await host.close();
assert.equal(events.filter(event => event === 'stop').length, 1);
assert.equal(events.filter(event => event.startsWith('remove:')).length, 2);
assert.ok(events.indexOf('cancel') < events.indexOf('stop'));
assert.throws(() => host.command(() => []), /ROOM_CLOSED/);
events.length = 0;
await assert.rejects(startVirtualNativeHost(makeRoom(), { ...port, async startHost() { throw new Error('bind failed'); } }, 'test', () => {}, () => {}, scheduler), /bind failed/);
assert.deepEqual(events, ['peerMessage', 'peerClosed', 'remove:peerMessage', 'remove:peerClosed']);
events.length = 0;
await assert.rejects(startVirtualNativeHost(makeRoom(), port, 'test', () => {}, () => {}, { every() { throw new Error('timer failed'); } }), /timer failed/);
assert.ok(events.includes('stop'));
console.log('PASS virtual native Host: listener-first start, commands, timer teardown, idempotent close and startup failure cleanup');
