import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { VirtualRoomHost } from '../lib/virtual-mahjong/room';
import { VirtualRoomClient } from '../lib/virtual-mahjong/room-client';
import { defaultRules } from '../lib/virtual-mahjong/rules';
import { GAME_EMOTES } from '../lib/emotes';
import { readVirtualEmote } from '../lib/virtual-mahjong/emotes';
let id = 0, now = 100;
const host = new VirtualRoomHost({ roomId: 'r', code: 'secret', hostName: 'Host', rules: defaultRules() }, { now: () => now, random: () => 12345 }, () => `id-${++id}`);
const clients = Array.from({ length: 3 }, (_, i) => new VirtualRoomClient(`P${i}`, 'secret'));
function exchange(index: number, text: string) {
  const deliveries = host.receive(`c${index}`, text);
  for (const delivery of deliveries) {
    const target = Number(delivery.connectionId.slice(1));
    for (const outgoing of clients[target].receive(delivery.text)) exchange(target, outgoing);
  }
  return deliveries;
}
clients.forEach((client, i) => exchange(i, client.connected()));
host.setHostReady(true); clients.forEach((client, i) => exchange(i, client.ready(true)));
for (const delivery of host.start()) clients[Number(delivery.connectionId.slice(1))].receive(delivery.text);
const baseline = host.localView(), saved = host.exportCheckpoint();
const request = clients[0].emote(GAME_EMOTES[0].id, 'first');
const deliveries = exchange(0, request);
assert.equal(deliveries.length, 3);
const event = host.takeEmotes()[0];
assert.equal(event.playerId, clients[0].savedCredentials()!.playerId);
assert.deepEqual(Object.keys(event).sort(), ['emoteId','gameId','id','playerId','roundId']);
clients.forEach(client => { assert.deepEqual(client.takeEmotes(), [event]); client.receive(deliveries[0].text); assert.deepEqual(client.takeEmotes(), []); });
assert.deepEqual(host.localView(), baseline); assert.deepEqual(host.exportCheckpoint(), saved);
assert.equal(JSON.parse(exchange(0, clients[0].emote(GAME_EMOTES[1].id, 'fast'))[0].text).error, 'EMOTE_RATE_LIMIT');
now += 500; assert.deepEqual(exchange(0, request), []);
assert.equal(JSON.parse(exchange(0, JSON.stringify({ ...JSON.parse(request), playerId: host.hostPlayerId }))[0].text).error, 'INVALID_EMOTE');
assert.equal(JSON.parse(exchange(0, JSON.stringify({ ...JSON.parse(request), roundId: 'old' }))[0].text).error, 'STALE_ROUND');
assert.equal(JSON.parse(host.receive('intruder', request)[0].text).error, 'NOT_AUTHENTICATED');
assert.throws(() => clients[0].emote('unknown'), /INVALID_EMOTE/);
assert.throws(() => readVirtualEmote({ ...event, hand: [] }), /INVALID_EMOTE/);
assert.throws(() => clients[0].receive(JSON.stringify({ ...JSON.parse(deliveries[0].text), token: 'secret' })), /INVALID_EMOTE/);
clients[0].receive(JSON.stringify({ ...JSON.parse(deliveries[0].text), event: { ...event, id: 'late', roundId: 'old' } }));
assert.deepEqual(clients[0].takeEmotes(), []);
exchange(0, clients[0].emote(GAME_EMOTES[1].id, 'second'));
clients[0].disconnected(); host.disconnect('c0'); exchange(0, clients[0].connected());
assert.deepEqual(clients[0].takeEmotes(), []);
const restored = VirtualRoomHost.restoreCheckpoint(host.exportCheckpoint(), { now: () => now });
assert.deepEqual(restored.takeEmotes(), []);
assert.equal(GAME_EMOTES.length, 8); assert.ok(GAME_EMOTES.every(item => existsSync('public' + item.src)));
console.log('PASS virtual emotes: 8 original offline assets, identity binding, rate/size/schema checks, dedupe, no engine revision or checkpoint changes, no reconnect replay');
