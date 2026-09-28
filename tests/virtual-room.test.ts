import assert from 'node:assert/strict';
import { VirtualRoomHost, VIRTUAL_ROOM_PROTOCOL, type RoomDelivery } from '../lib/virtual-mahjong/room';
import { defaultRules } from '../lib/virtual-mahjong/rules';
const decode = (items: RoomDelivery[]) => items.map(item => ({ connectionId: item.connectionId, ...JSON.parse(item.text) }));
function setup(players: 3 | 4 = 4) {
  let id = 0; let now = 0;
  const room = new VirtualRoomHost({ roomId: 'room', code: 'ABCDEF', hostName: 'Host', rules: defaultRules(players) }, { now: () => now, random: () => 12345 }, () => `credential-${++id}`);
  const send = (connection: string, data: object) => decode(room.receive(connection, JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'room', configurationRevision: room.localView().configurationRevision, ...data })));
  const join = (connection: string) => send(connection, { type: 'JOIN', code: 'ABCDEF', name: connection });
  return { room, send, join, time: (value: number) => { now = value; } };
}
for (const count of [3, 4] as const) {
  const h = setup(count);
  const info = decode(h.room.receive('discovery', JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, type: 'HELLO' })))[0];
  assert.equal(info.type, 'INFO'); assert.equal(info.roomId, 'room'); assert.equal(info.code, undefined); assert.equal(info.seats, undefined);
  assert.equal(h.send('x', { type: 'ACTION', action: {} })[0].error, 'NOT_AUTHENTICATED');
  assert.equal(h.send('x', { type: 'JOIN', code: 'BAD', name: 'bad' })[0].error, 'AUTH_FAILED');
  assert.equal(decode(h.room.receive('x', '{'))[0].error, 'INVALID_MESSAGE');
  assert.equal(decode(h.room.receive('x', 'x'.repeat(32769)))[0].error, 'MESSAGE_TOO_LARGE');
  const credentials = Array.from({ length: count - 1 }, (_, i) => h.join(`p${i}`)[0]);
  assert.equal(h.join('overflow')[0].error, 'ROOM_FULL');
  assert.throws(() => h.room.start(), /NOT_READY/);
  h.room.setHostReady(true);
  credentials.forEach((_, i) => h.send(`p${i}`, { type: 'READY', ready: true }));
  const snapshots = decode(h.room.start());
  for (const message of snapshots) {
    const viewer = credentials.find(item => item.connectionId === message.connectionId)!.playerId;
    assert.equal(message.game.viewerId, viewer);
    for (const player of message.game.players) assert.equal(Boolean(player.hand), player.id === viewer);
    assert.equal(message.game.wall, undefined); assert.equal(message.game.events, undefined);
    assert.equal(message.reconnectToken, undefined);
    assert.ok(message.seats.every((seat: Record<string, unknown>) => !('token' in seat)));
  }
  assert.equal(h.send('p0', { type: 'START' })[0].error, 'NOT_ALLOWED');
  const view = h.room.localView().game!;
  const action = { kind: 'DISCARD', tileId: view.availableActions.discardableTileIds[0], actionId: 'discard-1', gameId: view.gameId, roundId: view.roundId, turnId: view.turnId };
  assert.equal(h.send('p0', { type: 'ACTION', playerId: h.room.hostPlayerId, action })[0].error, 'NOT_YOUR_TURN');
  h.room.hostAction(action);
  assert.throws(() => h.room.hostAction(action));
  h.room.disconnect('p0');
  assert.equal(h.room.localView().seats[1].connected, false);
  assert.equal(h.send('new', { type: 'RECONNECT', playerId: credentials[0].playerId, reconnectToken: 'wrong' })[0].error, 'AUTH_FAILED');
  const reconnect = { type: 'RECONNECT', playerId: credentials[0].playerId, reconnectToken: credentials[0].reconnectToken };
  const restored = h.send('new', reconnect).find(item => item.connectionId === 'new')!;
  assert.equal(restored.type, 'SNAPSHOT'); assert.equal(restored.game.viewerId, credentials[0].playerId);
  assert.equal(restored.game.players.filter((player: { hand?: unknown }) => player.hand).length, 1);
  assert.equal(h.send('replacement', reconnect)[0].type, 'SESSION_REPLACED');
  assert.deepEqual(h.room.disconnect('new'), []);
  assert.equal(h.send('new', { type: 'SNAPSHOT_REQUEST' })[0].error, 'NOT_AUTHENTICATED');
  assert.equal(h.room.localView().seats[1].connected, true);
  assert.throws(() => h.room.swapSeats(0, 1), /MATCH_STARTED/);
  h.time(50000); h.room.tick();
  assert.equal(h.room.close().length, count - 1);
  assert.equal(h.send('replacement', reconnect)[0].error, 'ROOM_CLOSED');
  console.log(`PASS room: ${count} seats, authentication, private snapshots, actor binding, reconnect replacement, close`);
}
const h = setup();
const joined = h.join('a')[0];
h.room.setHostReady(true); h.send('a', { type: 'READY', ready: true });
h.room.swapSeats(0, 1);
assert.equal(h.send('a', { type: 'READY', ready: true, configurationRevision: 1 })[0].error, 'STALE_CONFIGURATION');
assert.equal(h.room.localView().seats[1].playerId, h.room.hostPlayerId);
assert.ok(h.room.localView().seats.every(seat => !seat.ready));
h.room.changeRules(defaultRules(3));
h.room.kick(joined.playerId);
assert.ok(h.room.localView().seats.every(seat => !seat.ready));
assert.equal(h.send('back', { type: 'RECONNECT', playerId: joined.playerId, reconnectToken: joined.reconnectToken })[0].error, 'AUTH_FAILED');
const detached = h.room.localView(); detached.rules.startingPoints = 999; detached.seats[0].name = 'changed';
assert.equal(h.room.localView().rules.startingPoints, 35000);
assert.equal(h.room.localView().seats[0].name, 'Host');
console.log('PASS room: seat swap, readiness reset, rule update, kick revocation and detached snapshots');
{
  const room = setup(4);
  const first = room.join('east')[0].playerId, second = room.join('south')[0].playerId;
  room.room.setHostReady(true);
  room.send('east', { type: 'READY', ready: true }); room.send('south', { type: 'READY', ready: true });
  const before = room.room.localView().configurationRevision;
  room.room.swapSeats(1, 2);
  const after = room.room.localView();
  assert.equal(after.seats[1].playerId, second); assert.equal(after.seats[2].playerId, first);
  assert.equal(after.configurationRevision, before + 1);
  assert.ok(after.seats.every(seat => !seat.ready), 'guest-to-guest swap requires every player to ready again');
  assert.equal(room.send('east', { type: 'READY', ready: true, configurationRevision: before })[0].error, 'STALE_CONFIGURATION');
}
console.log('PASS room: Host can exchange two guest seats without exposing or changing credentials');
