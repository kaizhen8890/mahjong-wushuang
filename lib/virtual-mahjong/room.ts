import { MahjongMatchEngine, type MatchCheckpoint } from './match-engine';
import { cloneCheckpoint, requireCheckpoint, resumeClock } from './checkpoint';
import { validateRules } from './rules';
import type { Rules } from './model';
import type { HostDependencies } from './round-engine';
import { MAX_WIRE_BYTES } from '../lan-protocol';
import { GAME_EMOTES_BY_ID } from '../emotes';
import { EMOTE_INTERVAL, type VirtualEmote } from './emotes';

import { VIRTUAL_ROOM_PROTOCOL } from './room-wire';
import { characterChoice, defaultSeatCharacter, validCharacterChoice, type CharacterChoice } from '../characters';
export { VIRTUAL_ROOM_PROTOCOL } from './room-wire';
interface Seat { id: string; name: string; token: string; ready: boolean; connected: boolean; bot?: boolean; character?: CharacterChoice }
export interface RoomDelivery { connectionId: string; text: string }
interface RoomOptions { roomId: string; code: string; hostName: string; rules: Rules }
/** Local Host storage only; includes credentials and hidden game information. */
export interface RoomCheckpoint {
  format: 'musou.host.room'; version: 1; savedAt: number; options: RoomOptions;
  hostPlayerId: string; seats: Seat[]; revision: number; configurationRevision: number;
  match: MatchCheckpoint | null;
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MESSAGE');
  return value as Record<string, unknown>;
};
const short = (value: unknown, max = 128): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_MESSAGE');
  return value.trim();
};

/** Host-only room authority. Transport passes its own connection ID, never a client-supplied actor. */
export class VirtualRoomHost {
  readonly hostPlayerId: string;
  private seats: Seat[];
  private rules: Rules;
  private engine: MahjongMatchEngine | null = null;
  private bindings = new Map<string, string>();
  private revision = 1;
  private configurationRevision = 1;
  private closed = false;
  private options: RoomOptions;
  private emoteTimes = new Map<string, number>();
  private emoteRequests = new Map<string, string[]>();
  private emotes: VirtualEmote[] = [];
  private botPending: { key: string; due: number } | null = null;
  private botBlocked: string | null = null;
  takeEmotes() { return this.emotes.splice(0); }
  hostEmote(emoteId: string) { return this.emitEmote(this.hostPlayerId, emoteId, this.credential()); }
  private emitEmote(actor: string, emoteId: unknown, requestId: unknown): RoomDelivery[] {
    if (this.closed || !this.engine || !this.seat(actor).connected) throw new Error('NOT_CONNECTED');
    if (typeof emoteId !== 'string' || !GAME_EMOTES_BY_ID.has(emoteId)) throw new Error('INVALID_EMOTE');
    const id = short(requestId), now = this.dependencies.now();
    const seen = this.emoteRequests.get(actor) ?? [];
    if (seen.includes(id)) return [];
    if (now - (this.emoteTimes.get(actor) ?? -Infinity) < EMOTE_INTERVAL) throw new Error('EMOTE_RATE_LIMIT');
    const game = this.engine.view({ role: 'player', playerId: actor });
    const event: VirtualEmote = { id: this.credential(), playerId: actor, emoteId, gameId: game.gameId, roundId: game.roundId };
    this.emoteTimes.set(actor, now); this.emoteRequests.set(actor, [...seen, id].slice(-32));
    this.emotes.push(event); this.emotes = this.emotes.slice(-16);
    return [...this.bindings.keys()].map(connectionId => ({ connectionId, text: this.message('EMOTE', { event }) }));
  }
  constructor(options: RoomOptions, private readonly dependencies: HostDependencies,
    private readonly credential: () => string = () => crypto.randomUUID()) {
    validateRules(options.rules);
    this.options = { ...options, roomId: short(options.roomId), code: short(options.code, 32), hostName: short(options.hostName, 24), rules: structuredClone(options.rules) };
    this.rules = structuredClone(options.rules);
    this.hostPlayerId = credential();
    this.seats = [{ id: this.hostPlayerId, name: this.options.hostName, token: credential(), ready: false, connected: true, bot: false, character: defaultSeatCharacter(0) }];
  }
  private seat(id: string) { const seat = this.seats.find(item => item.id === id); if (!seat) throw new Error('UNKNOWN_PLAYER'); return seat; }
  private waiting() { if (this.closed) throw new Error('ROOM_CLOSED'); if (this.engine) throw new Error('MATCH_STARTED'); }
  private message(type: string, data: object) { return JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: this.options.roomId, type, ...data }); }
  private snapshot(playerId: string) {
    const game = this.engine?.view({ role: 'player', playerId });
    if (game) for (const player of game.players) player.connected = this.seat(player.id).connected;
    return { revision: this.revision, configurationRevision: this.configurationRevision, hostPlayerId: this.hostPlayerId, serverNow: this.dependencies.now(), rules: structuredClone(this.rules),
      seats: this.seats.map((seat, index) => ({ playerId: seat.id, name: seat.name, seat: index, ready: seat.ready, connected: seat.connected, bot: Boolean(seat.bot), character: characterChoice(seat.character ?? defaultSeatCharacter(index)) })),
      ...(game ? { game } : {}) };
  }
  /** Local Host UI receives the same filtered shape as another player. */
  localView() { return this.snapshot(this.hostPlayerId); }
  exportCheckpoint(): RoomCheckpoint {
    if (this.closed) throw new Error('ROOM_CLOSED');
    const match = this.engine?.exportCheckpoint() ?? null;
    return { format: 'musou.host.room', version: 1, savedAt: match?.lastNow ?? this.dependencies.now(),
      options: { ...this.options, rules: structuredClone(this.rules) }, hostPlayerId: this.hostPlayerId,
      seats: structuredClone(this.seats), revision: this.revision, configurationRevision: this.configurationRevision, match };
  }
  static restoreCheckpoint(input: unknown, dependencies: HostDependencies): VirtualRoomHost {
    try {
      const saved = cloneCheckpoint<RoomCheckpoint>(input);
      requireCheckpoint(saved.format === 'musou.host.room' && saved.version === 1 && Number.isFinite(saved.savedAt) && saved.savedAt >= 0);
      validateRules(saved.options.rules);
      for (const [value, limit] of [[saved.options.roomId, 128], [saved.options.code, 32], [saved.options.hostName, 24]] as const) requireCheckpoint(short(value, limit) === value);
      requireCheckpoint(Number.isSafeInteger(saved.revision) && saved.revision >= 1 && Number.isSafeInteger(saved.configurationRevision) && saved.configurationRevision >= 1);
      requireCheckpoint(Array.isArray(saved.seats) && saved.seats.length >= 1 && saved.seats.length <= saved.options.rules.players);
      requireCheckpoint(new Set(saved.seats.map(seat => seat.id)).size === saved.seats.length && new Set(saved.seats.map(seat => seat.token)).size === saved.seats.length);
      for (const seat of saved.seats) requireCheckpoint(/^[A-Za-z0-9_-]{1,128}$/.test(seat.id) && !['__proto__', 'constructor', 'prototype'].includes(seat.id)
        && short(seat.token) === seat.token && short(seat.name, 24) === seat.name && typeof seat.ready === 'boolean' && typeof seat.connected === 'boolean'
        && (seat.bot === undefined || typeof seat.bot === 'boolean') && (seat.character === undefined || validCharacterChoice(seat.character)) && (!seat.bot || (seat.ready && seat.connected)));
      requireCheckpoint(saved.seats.some(seat => seat.id === saved.hostPlayerId && seat.name === saved.options.hostName && !seat.bot));
      const host = { ...dependencies, now: resumeClock(dependencies.now, saved.savedAt) };
      let engine: MahjongMatchEngine | null = null;
      if (saved.match !== null) {
        requireCheckpoint(saved.match.lastNow === saved.savedAt && JSON.stringify(saved.match.options.rules) === JSON.stringify(saved.options.rules)
          && JSON.stringify(saved.match.options.players) === JSON.stringify(saved.seats.map(seat => ({ id: seat.id, name: seat.name }))));
        engine = MahjongMatchEngine.restoreCheckpoint(saved.match, host);
      }
      const room = Object.create(VirtualRoomHost.prototype) as VirtualRoomHost;
      Object.assign(room, { options: saved.options, rules: saved.options.rules, hostPlayerId: saved.hostPlayerId,
        seats: saved.seats.map(seat => ({ ...seat, bot: Boolean(seat.bot), connected: Boolean(seat.bot) || seat.id === saved.hostPlayerId,
          ready: Boolean(seat.bot) || (engine ? seat.ready : false) })),
        revision: saved.revision + 1, configurationRevision: saved.configurationRevision + 1,
        bindings: new Map(), emoteTimes: new Map(), emoteRequests: new Map(), emotes: [], botPending: null, botBlocked: null,
        closed: false, engine, dependencies: host, credential: () => crypto.randomUUID() });
      return room;
    } catch { throw new Error('INVALID_ROOM_CHECKPOINT'); }
  }
  private publish(): RoomDelivery[] {
    return [...this.bindings].map(([connectionId, playerId]) => ({ connectionId, text: this.message('SNAPSHOT', this.snapshot(playerId)) }));
  }
  receive(connectionId: string, text: string): RoomDelivery[] {
    try {
      if (this.closed) throw new Error('ROOM_CLOSED');
      if (new TextEncoder().encode(text).length > MAX_WIRE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
      const request = record(JSON.parse(text));
      if (request.protocol !== VIRTUAL_ROOM_PROTOCOL) throw new Error('WRONG_PROTOCOL');
      if (request.type === 'HELLO') return [{ connectionId, text: this.message('INFO', {
        hostName: this.options.hostName, capacity: this.rules.players, occupied: this.seats.length, started: this.engine !== null,
      }) }];
      if (request.roomId !== this.options.roomId) throw new Error('WRONG_ROOM');
      if (request.type === 'JOIN') {
        this.waiting();
        if (this.bindings.has(connectionId)) throw new Error('ALREADY_JOINED');
        if (request.code !== this.options.code) throw new Error('AUTH_FAILED');
        if (this.seats.length >= this.rules.players) throw new Error('ROOM_FULL');
        const name = short(request.name, 24);
        const seat = { id: this.credential(), token: this.credential(), name, ready: false, connected: true, bot: false, character: defaultSeatCharacter(this.seats.length) };
        this.seats.push(seat); this.bindings.set(connectionId, seat.id); this.revision++;
        return [{ connectionId, text: this.message('WELCOME', { playerId: seat.id, reconnectToken: seat.token }) }, ...this.publish()];
      }
      if (request.type === 'RECONNECT') {
        if (this.bindings.has(connectionId)) throw new Error('ALREADY_JOINED');
        const seat = this.seats.find(item => item.id === request.playerId && item.id !== this.hostPlayerId && !item.bot && item.token === request.reconnectToken);
        if (!seat) throw new Error('AUTH_FAILED');
        const replaced: RoomDelivery[] = [];
        for (const [old, id] of this.bindings) if (id === seat.id) {
          this.bindings.delete(old); replaced.push({ connectionId: old, text: this.message('SESSION_REPLACED', {}) });
        }
        this.bindings.set(connectionId, seat.id); seat.connected = true; this.revision++;
        return [...replaced, ...this.publish()];
      }
      const actor = this.bindings.get(connectionId);
      if (!actor) throw new Error('NOT_AUTHENTICATED');
      if (request.type === 'CHARACTER') {
        if (Object.keys(request).some(k => !['protocol', 'roomId', 'type', 'character'].includes(k)) || !validCharacterChoice(request.character)) throw new Error('INVALID_CHARACTER');
        this.seat(actor).character = characterChoice(request.character);
        this.revision++; return this.publish();
      }
      if (request.type === 'EMOTE') {
        if (Object.keys(request).some(k => !['protocol', 'roomId', 'type', 'emoteId', 'requestId', 'roundId'].includes(k))) throw new Error('INVALID_EMOTE');
        if (!this.engine || request.roundId !== this.engine.view({ role: 'player', playerId: actor }).roundId) throw new Error('STALE_ROUND');
        return this.emitEmote(actor, request.emoteId, request.requestId);
      }
      if (request.type === 'SNAPSHOT_REQUEST') return [{ connectionId, text: this.message('SNAPSHOT', this.snapshot(actor)) }];
      if (request.type === 'READY') {
        this.waiting(); if (typeof request.ready !== 'boolean') throw new Error('INVALID_MESSAGE');
        if (request.configurationRevision !== this.configurationRevision) throw new Error('STALE_CONFIGURATION');
        this.seat(actor).ready = request.ready;
      } else if (request.type === 'ACTION') {
        if (!this.engine) throw new Error('MATCH_NOT_STARTED');
        const result = this.engine.dispatch(actor, request.action);
        if (!result.ok) throw new Error(result.error);
      } else throw new Error('NOT_ALLOWED');
      this.revision++;
      return this.publish();
    } catch (cause) {
      const error = cause instanceof SyntaxError ? 'INVALID_MESSAGE' : cause instanceof Error ? cause.message : 'INVALID_MESSAGE';
      return [{ connectionId, text: this.message('ERROR', { error }) }];
    }
  }
  disconnect(connectionId: string): RoomDelivery[] {
    const actor = this.bindings.get(connectionId); if (!actor) return [];
    this.bindings.delete(connectionId);
    const seat = this.seat(actor); seat.connected = false; if (!this.engine) seat.ready = false;
    this.revision++; return this.publish();
  }
  /** Transport uses these bindings to authorize image transfers; clients cannot supply a seat ID. */
  characterAssetOwner(connectionId: string, hash: string) {
    const playerId = this.bindings.get(connectionId);
    const choice = playerId && this.seat(playerId).character;
    return Boolean(choice && [choice.avatarHash, choice.portraitHash].includes(hash));
  }
  characterAssetConnection(hash: string) {
    return [...this.bindings].find(([, id]) => {
      const choice = this.seat(id).character;
      return [choice?.avatarHash, choice?.portraitHash].includes(hash);
    })?.[0];
  }
  characterAssetKnown(hash: string) {
    return this.seats.some(seat => [seat.character?.avatarHash, seat.character?.portraitHash].includes(hash));
  }
  characterAssetPeer(connectionId: string) { return this.bindings.has(connectionId); }
  characterAssetPeers() { return [...this.bindings.keys()]; }
  setHostCharacter(value: CharacterChoice) {
    if (this.closed || !validCharacterChoice(value)) throw new Error('INVALID_CHARACTER');
    this.seat(this.hostPlayerId).character = characterChoice(value);
    this.revision++; return this.publish();
  }
  setHostReady(ready: boolean) { this.waiting(); this.seat(this.hostPlayerId).ready = ready; this.revision++; return this.publish(); }
  /** Host-local only. Bots have no transport binding and can never authenticate as a remote player. */
  addBot() {
    this.waiting(); if (this.seats.length >= this.rules.players) throw new Error('ROOM_FULL');
    const used = new Set(this.seats.filter(seat => seat.bot).map(seat => seat.name));
    let number = 1; while (used.has(`人机 ${number}`)) number++;
    this.seats.push({ id: this.credential(), token: this.credential(), name: `人机 ${number}`, ready: true, connected: true, bot: true, character: defaultSeatCharacter(this.seats.length) });
    for (const seat of this.seats) seat.ready = Boolean(seat.bot);
    this.configurationRevision++; this.revision++; return this.publish();
  }
  changeRules(rules: Rules) {
    this.waiting(); validateRules(rules); if (this.seats.length > rules.players) throw new Error('TOO_MANY_PLAYERS');
    this.rules = structuredClone(rules); for (const seat of this.seats) seat.ready = Boolean(seat.bot);
    this.configurationRevision++;
    this.revision++; return this.publish();
  }
  swapSeats(a: number, b: number) {
    this.waiting(); if (![a, b].every(index => Number.isInteger(index) && index >= 0 && index < this.seats.length)) throw new Error('INVALID_SEAT');
    [this.seats[a], this.seats[b]] = [this.seats[b], this.seats[a]];
    for (const seat of this.seats) seat.ready = Boolean(seat.bot);
    this.configurationRevision++;
    this.revision++; return this.publish();
  }
  kick(playerId: string) {
    this.waiting(); if (playerId === this.hostPlayerId) throw new Error('HOST_SEAT'); this.seat(playerId);
    const removed: RoomDelivery[] = [];
    for (const [connectionId, id] of this.bindings) if (id === playerId) {
      this.bindings.delete(connectionId); removed.push({ connectionId, text: this.message('KICKED', {}) });
    }
    this.seats = this.seats.filter(seat => seat.id !== playerId);
    for (const seat of this.seats) seat.ready = Boolean(seat.bot);
    this.configurationRevision++; this.revision++;
    return [...removed, ...this.publish()];
  }
  start() {
    this.waiting(); if (this.seats.length !== this.rules.players || this.seats.some(seat => !seat.connected || !seat.ready)) throw new Error('NOT_READY');
    this.engine = new MahjongMatchEngine({ gameId: this.credential(), rules: this.rules, dealerSeat: 0,
      players: this.seats.map(seat => ({ id: seat.id, name: seat.name })) }, this.dependencies);
    this.revision++; return this.publish();
  }
  hostAction(action: unknown) {
    if (!this.engine || this.closed) throw new Error('MATCH_NOT_STARTED');
    const result = this.engine.dispatch(this.hostPlayerId, action); if (!result.ok) throw new Error(result.error);
    this.revision++; return this.publish();
  }
  nextRound(roundId: string) {
    if (!this.engine || this.closed) throw new Error('MATCH_NOT_STARTED');
    const result = this.engine.advanceRound({ gameId: this.localView().game!.gameId, roundId });
    if (!result.ok) throw new Error(result.error);
    this.revision++; return this.publish();
  }
  private botDecision() {
    if (!this.engine) return null;
    for (const seat of this.seats) {
      if (!seat.bot) continue;
      const view = this.engine.view({ role: 'player', playerId: seat.id });
      const key = `${view.gameId}:${view.roundId}:${view.turnId}:${view.phase.kind}:${seat.id}`;
      if (view.availableActions.canPass) return { seat, view, key, intent: { kind: 'RESPOND', optionId: 'pass' } as const };
      if (view.phase.playerId === seat.id && view.availableActions.discardableTileIds.length) {
        const own = view.players.find(player => player.id === seat.id)!;
        const legal = view.availableActions.discardableTileIds;
        if (own.drawnTileId !== null && own.drawnTileId !== undefined && legal.includes(own.drawnTileId))
          return { seat, view, key, intent: { kind: 'DISCARD', tileId: own.drawnTileId } as const };
      }
    }
    return null;
  }
  /** At most one Host-authorized bot intent per scheduler tick. */
  tick() {
    if (this.closed || !this.engine) return [];
    let changed = false;
    const decision = this.botDecision();
    if (!decision || decision.key === this.botBlocked) this.botPending = null;
    else if (this.botPending?.key !== decision.key) this.botPending = { key: decision.key, due: this.dependencies.now() + 700 };
    else if (this.dependencies.now() >= this.botPending.due) {
      this.botPending = null;
      const { seat, view, key, intent } = decision;
      const result = this.engine.dispatch(seat.id, { ...intent, actionId: this.credential(), gameId: view.gameId,
        roundId: view.roundId, turnId: view.turnId });
      if (result.ok) changed = true; else this.botBlocked = key;
    }
    if (this.engine.tick()) changed = true;
    if (!changed) return [];
    this.revision++; return this.publish();
  }
  close() {
    const messages = [...this.bindings.keys()].map(connectionId => ({ connectionId, text: this.message('CLOSED', {}) }));
    this.closed = true; this.bindings.clear(); return messages;
  }
}
