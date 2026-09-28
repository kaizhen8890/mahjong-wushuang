import assert from 'node:assert/strict';
import { VirtualRoomHost, VIRTUAL_ROOM_PROTOCOL } from '../lib/virtual-mahjong/room';
import { readRoomSnapshot } from '../lib/virtual-mahjong/room-wire';
import { defaultRules } from '../lib/virtual-mahjong/rules';

function setup(players: 3 | 4 = 4) {
  let now = 0, serial = 0;
  const room = new VirtualRoomHost({ roomId: 'bot-room', code: 'ABCDEF', hostName: '房主', rules: defaultRules(players) },
    { now: () => now, random: () => 12345 }, () => `identity-${++serial}`);
  const send = (connectionId: string, message: object) => room.receive(connectionId, JSON.stringify({
    protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'bot-room', ...message,
  })).map(delivery => ({ connectionId: delivery.connectionId, ...JSON.parse(delivery.text) }));
  return { room, send, time: (value: number) => { now = value; } };
}

for (const players of [3, 4] as const) {
  const h = setup(players);
  for (let i = 1; i < players; i++) h.room.addBot();
  const seats = h.room.localView().seats;
  assert.equal(seats.length, players);
  assert.equal(seats.filter(seat => seat.bot).length, players - 1);
  assert.ok(seats.slice(1).every(seat => seat.ready && seat.connected));
  assert.throws(() => h.room.addBot(), /ROOM_FULL/);
  assert.equal(h.send('stranger', { type: 'JOIN', code: 'ABCDEF', name: '迟到者' })[0].error, 'ROOM_FULL');
  assert.equal(h.send('stranger', { type: 'ADD_BOT' })[0].error, 'NOT_AUTHENTICATED');
  const bot = seats[1];
  const token = h.room.exportCheckpoint().seats[1].token;
  assert.equal(h.send('stranger', { type: 'RECONNECT', playerId: bot.playerId, reconnectToken: token })[0].error, 'AUTH_FAILED');
  h.room.swapSeats(0, 1);
  assert.equal(h.room.localView().seats[0].bot, true);
  assert.equal(h.room.localView().seats[0].ready, true);
  h.room.swapSeats(0, 1);
  h.room.changeRules(defaultRules(players));
  assert.ok(h.room.localView().seats.slice(1).every(seat => seat.ready && seat.connected));
  h.room.setHostReady(true);
  h.room.start();
  assert.throws(() => h.room.addBot(), /MATCH_STARTED/);
  assert.equal(h.room.localView().game!.players.filter(player => player.hand).length, 1);
  assert.ok(h.room.localView().game!.players.slice(1).every(player => player.drawnTileId === undefined));
  const before = h.room.localView().game!;
  h.room.hostAction({ kind: 'DISCARD', tileId: before.players[0].drawnTileId!, actionId: 'host-discard',
    gameId: before.gameId, roundId: before.roundId, turnId: before.turnId });
  h.time(0); assert.deepEqual(h.room.tick(), []);
  h.time(500); assert.deepEqual(h.room.tick(), []);
  assert.ok(h.room.localView().game!.players.slice(1).every(player => player.river.length === 0));
  let botDiscarded = false;
  for (let ms = 750; ms <= 12000; ms += 250) {
    h.time(ms); h.room.tick();
    if (h.room.localView().game!.players.slice(1).some(player => player.river.length)) { botDiscarded = true; break; }
  }
  assert.ok(botDiscarded, `${players}-seat bot should act before timeout`);
  for (const player of h.room.localView().game!.players.slice(1)) {
    assert.ok(player.river.every(discard => discard.tsumogiri));
    assert.equal(player.melds.length, 0);
    assert.equal(player.riichi, 'none');
  }
  const resumed = VirtualRoomHost.restoreCheckpoint(h.room.exportCheckpoint(), { now: () => 90000,
    random: () => { throw new Error('Restored match must not shuffle'); } });
  assert.ok(resumed.localView().seats.slice(1).every(seat => seat.bot && seat.ready && seat.connected));
  assert.equal(resumed.localView().game!.roundId, h.room.localView().game!.roundId);
  console.log(`PASS ${players}-seat Host-only bots: capacity, private hands, ready/swap, and paced tsumogiri`);
}

{
  const h = setup(3);
  const guest = h.send('guest', { type: 'JOIN', code: 'ABCDEF', name: '真人' })[0];
  assert.equal(h.send('guest', { type: 'ADD_BOT' })[0].error, 'NOT_ALLOWED');
  h.room.addBot(); h.room.setHostReady(true);
  h.send('guest', { type: 'READY', ready: true, configurationRevision: h.room.localView().configurationRevision });
  const delivery = h.room.start().find(item => item.connectionId === 'guest')!;
  const wire = JSON.parse(delivery.text);
  assert.equal(wire.seats[2].bot, true);
  assert.equal(wire.game.viewerId, guest.playerId);
  assert.ok(wire.game.players.find((player: { id: string }) => player.id === guest.playerId).hand);
  assert.equal(wire.game.players[2].hand, undefined);
  assert.equal(wire.game.players[2].drawnTileId, undefined);
  assert.equal(JSON.stringify(wire).includes(h.room.exportCheckpoint().seats[2].token), false);
  const { protocol: _protocol, roomId: _roomId, type: _type, ...snapshot } = wire;
  assert.equal(readRoomSnapshot(snapshot, guest.playerId).seats[2].bot, true);
  console.log('PASS mixed human and bot LAN room starts with private targeted snapshots');
}

{
  const h = setup(3);
  const joined = h.send('guest', { type: 'JOIN', code: 'ABCDEF', name: '真人' })[0];
  h.room.addBot();
  const botId = h.room.localView().seats[2].playerId;
  const botToken = h.room.exportCheckpoint().seats[2].token;
  const guestView = h.send('guest', { type: 'SNAPSHOT_REQUEST' })[0];
  assert.equal(guestView.seats[2].bot, true);
  assert.equal(JSON.stringify(guestView).includes(botToken), false);
  assert.equal(readRoomSnapshot({ revision: guestView.revision, configurationRevision: guestView.configurationRevision,
    hostPlayerId: guestView.hostPlayerId, serverNow: guestView.serverNow, rules: guestView.rules, seats: guestView.seats }, joined.playerId).seats[2].bot, true);
  const old = structuredClone(h.room.exportCheckpoint());
  for (const seat of old.seats) delete seat.bot;
  // A pre-bot v1 room checkpoint still restores as a human-only room.
  const restoredOld = VirtualRoomHost.restoreCheckpoint(old, { now: () => 50000 });
  assert.ok(restoredOld.localView().seats.every(seat => !seat.bot));
  const saved = h.room.exportCheckpoint();
  const restored = VirtualRoomHost.restoreCheckpoint(saved, { now: () => 50000 });
  assert.equal(restored.localView().seats.find(seat => seat.playerId === botId)?.connected, true);
  assert.equal(restored.localView().seats.find(seat => seat.playerId === botId)?.ready, true);
  assert.equal(restored.localView().seats.find(seat => seat.playerId === joined.playerId)?.connected, false);
  assert.equal(restored.receive('fake', JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: 'bot-room',
    type: 'RECONNECT', playerId: botId, reconnectToken: botToken })).map(item => JSON.parse(item.text))[0].error, 'AUTH_FAILED');
  h.room.kick(botId);
  assert.equal(h.room.localView().seats.length, 2);
  h.room.addBot();
  assert.equal(h.room.localView().seats[2].bot, true);
  console.log('PASS bot save recovery, old v1 checkpoint, wire visibility, authentication, and removal');
}

{
  const h = setup(3);
  h.room.addBot(); h.room.addBot(); h.room.setHostReady(true); h.room.start();
  let ended = false;
  for (let step = 0; step < 1200; step++) {
    const view = h.room.localView().game!;
    if (view.result) { ended = true; break; }
    const action = view.availableActions.canPass ? { kind: 'RESPOND', optionId: 'pass' } as const
      : view.phase.playerId === h.room.hostPlayerId && view.availableActions.discardableTileIds.length
        ? { kind: 'DISCARD', tileId: view.availableActions.discardableTileIds.includes(view.players[0].drawnTileId ?? -1)
          ? view.players[0].drawnTileId! : view.availableActions.discardableTileIds[0] } as const : null;
    if (action) h.room.hostAction({ ...action, actionId: `human-${step}`, gameId: view.gameId,
      roundId: view.roundId, turnId: view.turnId });
    h.time((step + 1) * 250); h.room.tick();
  }
  assert.ok(ended, 'Host and two auto-tsumogiri bots should finish a full round');
  const final = h.room.localView().game!;
  assert.ok(final.players.slice(1).every(player => player.river.every(discard => discard.tsumogiri)
    && player.melds.length === 0 && player.riichi === 'none'));
  console.log('PASS Host and two bots complete a round with only tsumogiri/pass');
}
