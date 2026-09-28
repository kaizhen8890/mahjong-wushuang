import assert from 'node:assert/strict';
import { saveRoom, matchingClientSave } from '../lib/virtual-mahjong/room-storage';
import { VirtualRoomHost } from '../lib/virtual-mahjong/room';
import { VirtualRoomClient } from '../lib/virtual-mahjong/room-client';
import { readRoomSnapshot, VIRTUAL_ROOM_PROTOCOL } from '../lib/virtual-mahjong/room-wire';
import { defaultRules } from '../lib/virtual-mahjong/rules';
let id = 0;
const host = new VirtualRoomHost({ roomId: 'r', code: 'secret', hostName: 'Host', rules: defaultRules() }, { now: () => 100, random: () => 12345 }, () => `id-${++id}`);
const clients = Array.from({ length: 3 }, (_, i) => new VirtualRoomClient(`P${i}`, 'secret'));
function exchange(index: number, text: string) {
  for (const delivery of host.receive(`c${index}`, text)) {
    const target = Number(delivery.connectionId.slice(1));
    for (const outgoing of clients[target].receive(delivery.text)) exchange(target, outgoing);
  }
}
clients.forEach((client, i) => exchange(i, client.connected()));
host.setHostReady(true); clients.forEach((client, i) => exchange(i, client.ready(true)));
for (const delivery of host.start()) clients[Number(delivery.connectionId.slice(1))].receive(delivery.text);
clients.forEach(client => {
  assert.ok(client.active); const view = client.view()!;
  assert.equal(view.game!.players.filter(player => player.hand).length, 1);
  const injected = structuredClone(view); injected.game!.players.find(player => player.id !== client.savedCredentials()!.playerId)!.hand = [];
  assert.throws(() => readRoomSnapshot(injected, client.savedCredentials()!.playerId), /HIDDEN_HAND/);
  assert.throws(() => readRoomSnapshot({ ...view, token: 'secret' }, client.savedCredentials()!.playerId));
});
const current = clients[0].view()!;
const old = { protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'r', type: 'SNAPSHOT', ...current, revision: current.revision - 1 };
clients[0].receive(JSON.stringify(old)); assert.equal(clients[0].view()!.revision, current.revision);
clients[0].disconnected(); host.disconnect('c0'); assert.throws(() => clients[0].ready(true));
exchange(0, clients[0].connected()); assert.ok(clients[0].active);
assert.equal(clients[0].view()!.game!.roundId, current.game!.roundId);
const credentials = clients[0].savedCredentials()!;
// Leaving destroys the JS client, but persistence must restore the same occupied seat.
const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
saveRoom(storage, { format: 'musou.local.room', version: 1, role: 'client', name: 'P0', host: '192.168.1.2', port: 8765, code: 'secret', credentials });
const target = { host: '192.168.1.2', port: 8765, code: 'SECRET' };
assert.equal(matchingClientSave(storage, { ...target, host: '192.168.1.3' }), undefined);
assert.equal(matchingClientSave(storage, { ...target, port: 8766 }), undefined);
assert.equal(matchingClientSave(storage, { ...target, code: 'another' }), undefined);
clients[0].disconnected(); host.disconnect('c0');
clients[0] = new VirtualRoomClient('P0', 'secret', matchingClientSave(storage, target)!.credentials);
exchange(0, clients[0].connected());
assert.ok(clients[0].active);
assert.equal(clients[0].savedCredentials()!.playerId, credentials.playerId);
assert.equal(clients[0].view()!.game!.roundId, current.game!.roundId);
assert.equal(clients[0].view()!.game!.players.filter(player => player.hand).length, 1);
clients[0].receive(JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'r', type: 'KICKED' }));
assert.equal(clients[0].savedCredentials(), null); assert.throws(() => clients[0].connected());
const wrongRoom = new VirtualRoomClient('P', 'secret', credentials); wrongRoom.connected();
assert.throws(() => wrongRoom.receive(JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'other', type: 'INFO' })), /ROOM_CHANGED/);
console.log('PASS virtual client: three-client handshake, ready/start, individual snapshots, malformed/private fields, stale revision, reconnect and revoked credentials');
