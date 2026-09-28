import { MAX_WIRE_BYTES } from '../lan-protocol';
import { readRoomSnapshot, VIRTUAL_ROOM_PROTOCOL, type RoomSnapshot } from './room-wire';
import type { RoundIntent } from './round-engine';
import { readVirtualEmote, type VirtualEmote } from './emotes';
import { GAME_EMOTES_BY_ID } from '../emotes';
import { validCharacterChoice, type CharacterChoice } from '../characters';
export interface RoomCredentials { roomId: string; playerId: string; reconnectToken: string }
/** Client session has no engine, wall, random tile generation or rule decisions. */
export class VirtualRoomClient {
  private credentials: RoomCredentials | null;
  private snapshot: RoomSnapshot | null = null;
  private roomId = '';
  private status: 'offline' | 'hello' | 'joining' | 'restoring' | 'active' | 'closed' = 'offline';
  error = '';
  private emotes: VirtualEmote[] = [];
  private seenEmotes: string[] = [];
  takeEmotes() { return this.emotes.splice(0); }
  emote(emoteId: string, requestId = crypto.randomUUID()) {
    if (!this.active || !this.snapshot?.game) throw new Error('NOT_CONNECTED');
    if (!GAME_EMOTES_BY_ID.has(emoteId)) throw new Error('INVALID_EMOTE');
    return this.wire('EMOTE', { emoteId, requestId, roundId: this.snapshot.game.roundId });
  }
  constructor(private readonly name: string, private readonly code: string, credentials?: RoomCredentials) { this.credentials = credentials ? { ...credentials } : null; }
  private wire(type: string, data: object = {}) { return JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: this.roomId, type, ...data }); }
  connected() { if (this.status === 'closed') throw new Error('SESSION_CLOSED'); this.status = 'hello'; this.error = ''; return this.wire('HELLO'); }
  disconnected() { this.emotes = []; if (this.status !== 'closed') this.status = 'offline'; }
  get active() { return this.status === 'active'; }
  view() { return this.snapshot ? structuredClone(this.snapshot) : null; }
  savedCredentials() { return this.credentials ? { ...this.credentials } : null; }
  receive(text: string): string[] {
    if (this.status === 'offline' || this.status === 'closed') return [];
    if (new TextEncoder().encode(text).length > MAX_WIRE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
    const message = JSON.parse(text) as Record<string, unknown>;
    if (!message || typeof message !== 'object' || message.protocol !== VIRTUAL_ROOM_PROTOCOL || typeof message.roomId !== 'string') throw new Error('WRONG_PROTOCOL');
    if (message.type === 'INFO' && this.status === 'hello') {
      if (this.credentials && this.credentials.roomId !== message.roomId) throw new Error('ROOM_CHANGED');
      this.roomId = message.roomId;
      this.status = this.credentials ? 'restoring' : 'joining';
      return [this.credentials ? this.wire('RECONNECT', this.credentials) : this.wire('JOIN', { name: this.name, code: this.code })];
    }
    if (message.roomId !== this.roomId) throw new Error('WRONG_ROOM');
    if (message.type === 'EMOTE') {
      if (!this.active || !this.snapshot?.game) return [];
      if (Object.keys(message).some(k => !['protocol','roomId','type','event'].includes(k))) throw new Error('INVALID_EMOTE');
      const event = readVirtualEmote(message.event), game = this.snapshot.game;
      if (event.gameId !== game.gameId || event.roundId !== game.roundId || !game.players.some(p => p.id === event.playerId)) return [];
      if (!this.seenEmotes.includes(event.id)) { this.seenEmotes = [...this.seenEmotes, event.id].slice(-64); this.emotes = [...this.emotes, event].slice(-16); }
      return [];
    }
    if (message.type === 'WELCOME' && this.status === 'joining') {
      if (typeof message.playerId !== 'string' || !message.playerId || typeof message.reconnectToken !== 'string' || !message.reconnectToken || message.reconnectToken.length > 128) throw new Error('INVALID_CREDENTIALS');
      this.credentials = { roomId: this.roomId, playerId: message.playerId, reconnectToken: message.reconnectToken };
      this.status = 'restoring'; return [];
    }
    if (message.type === 'SNAPSHOT' && this.credentials && ['restoring', 'active'].includes(this.status)) {
      const { protocol: _protocol, roomId: _room, type: _type, ...payload } = message;
      const next = readRoomSnapshot(payload, this.credentials.playerId);
      if (this.snapshot && next.revision < this.snapshot.revision) return [];
      if (next.game?.roundId !== this.snapshot?.game?.roundId) this.emotes = [];
      this.snapshot = next; this.status = 'active'; this.error = ''; return [];
    }
    if (['CLOSED', 'KICKED', 'SESSION_REPLACED'].includes(String(message.type))) {
      this.emotes = []; this.status = 'closed'; this.credentials = null; this.error = String(message.type); return [];
    }
    if (message.type === 'ERROR') {
      this.error = typeof message.error === 'string' ? message.error : 'INVALID_MESSAGE';
      return this.active && this.error === 'STALE_CONFIGURATION' ? [this.wire('SNAPSHOT_REQUEST')] : [];
    }
    throw new Error('UNEXPECTED_MESSAGE');
  }
  ready(ready: boolean) {
    if (!this.active || !this.snapshot) throw new Error('NOT_CONNECTED');
    return this.wire('READY', { ready, configurationRevision: this.snapshot.configurationRevision });
  }
  character(value: CharacterChoice) {
    if (!this.active || !validCharacterChoice(value)) throw new Error('INVALID_CHARACTER');
    return this.wire('CHARACTER', { character: value });
  }
  action(intent: RoundIntent, actionId = crypto.randomUUID()) {
    if (!this.active || !this.snapshot?.game) throw new Error('NOT_CONNECTED');
    const game = this.snapshot.game;
    return this.wire('ACTION', { action: { ...intent, actionId, gameId: game.gameId, roundId: game.roundId, turnId: game.turnId } });
  }
}
