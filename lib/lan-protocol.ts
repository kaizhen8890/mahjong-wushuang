import type { PlayerState, Wind, TurnClock } from '@/lib/mahjong';
import type { TablePresentation } from './presentation';
import { validCharacterChoice, type CharacterChoice } from './characters';

export const LAN_PROTOCOL_VERSION = 5 as const;

function parseTurnClock(value: unknown): TurnClock {
  const clock = expectRecord(value, 'clock');
  const fixedRemaining = expectInteger(clock, 'fixedRemaining', 0, 3600);
  const extraRemaining = expectInteger(clock, 'extraRemaining', 0, 86400);
  return {
    enabled: expectBoolean(clock, 'enabled'), playerId: expectString(clock, 'playerId'),
    fixedRemaining, extraRemaining, totalRemaining: fixedRemaining + extraRemaining,
    usingExtra: expectBoolean(clock, 'usingExtra'), expired: expectBoolean(clock, 'expired'),
  };
}
export const DEFAULT_LAN_PORT = 8765;
export const MAX_LAN_PORT_OFFSET = 20;
// Keep the browser-side protocol limit aligned with the native WebSocket server.
export const MAX_WIRE_BYTES = 32 * 1024;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const MAX_ID_LENGTH = 128;
const MAX_SHORT_TEXT_LENGTH = 160;
const MAX_EFFECT_TEXT_LENGTH = 500;
const MAX_TILE_COUNT = 32;
const MAX_TARGET_COUNT = 4;
const MAX_LIST_COUNT = 256;
const MAX_CATALOG_CARD_COUNT = 1_024;

export type SkillDuration = 'once' | 'hand' | 'match' | 'manual';
export type ControllerEffectDirection = 'incoming' | 'self' | 'team' | 'outgoing' | 'table' | 'hidden-own';
export type ControllerNotificationKind = 'skill-affected' | 'table-effect' | 'score-changed' | 'match-reset';
export type RequestErrorCode =
  | 'INVALID_MESSAGE'
  | 'UNSUPPORTED_VERSION'
  | 'AUTH_FAILED'
  | 'ROOM_CLOSED'
  | 'SEAT_TAKEN'
  | 'HOST_APPROVAL_REQUIRED'
  | 'STALE_STATE'
  | 'HAND_CHANGED'
  | 'NOT_ALLOWED'
  | 'INVALID_PAYLOAD'
  | 'INVALID_TARGET'
  | 'ALREADY_RIICHI'
  | 'INSUFFICIENT_POINTS'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface DiscoveredRoom {
  roomId: string;
  serviceName: string;
  host: string;
  port: number;
  protocol: number;
  playerCount?: 3 | 4;
}

export interface ControllerNotification {
  notificationId: string;
  eventId: string;
  kind: ControllerNotificationKind;
  title: string;
  body: string;
  sourceLabel?: string;
  effectId?: string;
  durationLabel?: string;
  requiresAck: boolean;
  createdAt: string;
}

export interface ControllerRealtimeEvent {
  eventId: string;
  kind: 'emote' | 'draw';
  actorPlayerId: string;
  actorName: string;
  emoteId?: string;
  createdAt: number;
}

export interface ControllerEffect {
  effectId: string;
  cardId: number;
  cardName: string;
  effectText: string;
  direction: ControllerEffectDirection;
  sourceLabel: string;
  duration: SkillDuration;
  state: 'armed' | 'active' | 'triggered';
  hidden: boolean;
  createdAt?: string;
}

export interface ControllerSkillCard {
  id: number;
  name: string;
  typeCode: string;
  effectDescription: string;
}

export interface ControllerSnapshot {
  presentations?: TablePresentation[];
  roomId: string;
  matchId: string;
  handId: string;
  revision: number;
  self: {
    playerId: string;
    name: string;
    character?: CharacterChoice;
    wind: Wind;
    team: string;
    score: number;
    riichi: boolean;
    participation: PlayerState['participation'];
  };
  table: {
    roundWind: Wind;
    handNumber: number;
    honba: number;
    riichiSticks: number;
    wallCount: number;
    handEnded: boolean;
    isMyTurn: boolean;
    wushuang: boolean;
    openTanyao?: boolean;
    kiriageMangan?: boolean;
    kazoeYakuman?: boolean;
    timerEnabled?: boolean;
    turnState?: 'waiting' | 'thinking';
    timerPaused?: boolean;
    clock?: TurnClock;
    turnPlayerId?: string;
    turnWind?: Wind;
    turnStartedAt?: number;
    turnFixedSeconds?: number;
    turnExtraSeconds?: number;
  };
  targetOptions: Array<{
    playerId: string;
    wind: Wind;
    active: boolean;
  }>;
  controls: {
    canDraw: boolean;
    canDiscard?: boolean;
    canRiichi: boolean;
    canWin: boolean;
    canUseSkill: boolean;
  };
  effects: ControllerEffect[];
  pendingNotifications: ControllerNotification[];
  skillCatalogRevision: string;
}

/** A shorter name used by the phone-only UI. */
export type RemoteSnapshot = ControllerSnapshot;

export interface RemoteWinDraft {
  analysis?: { winningTile: string; meldText: string; automatic: boolean };
  winType: 'ron' | 'tsumo';
  loserPlayerId?: string;
  tiles: string[];
  closed: boolean;
  fu: number;
  selectedYakuIds: string[];
  yakuOverrides: Record<string, number>;
  dora: number;
  uraDora: number;
  akaDora: number;
  flowerDora: number;
  bonusHan: number;
  extraPoints: number;
}

export interface ScoreAdjustInput {
  direction: 'add' | 'deduct';
  amount: number;
  counterpartyPlayerId?: string;
  reason: string;
}

export interface SkillActivationInput {
  cardId: number;
  targetPlayerIds: string[];
  duration: SkillDuration;
  faceDown: boolean;
  effectText?: string;
}

export interface TrapRevealInput {
  effectId: string;
  targetPlayerIds: string[];
  effectText?: string;
}

export type ControllerCommand =
  | { kind: 'character.select'; character: CharacterChoice }
  | { kind: 'draw.confirm'; turnStartedAt: number }
  | { kind: 'discard.confirm'; turnStartedAt: number }
  | { kind: 'riichi.declare' }
  | { kind: 'emote.send'; emoteId: string }
  | { kind: 'skill.activate'; input: SkillActivationInput }
  | { kind: 'skill.reveal'; input: TrapRevealInput }
  | { kind: 'effect.resolve-own'; effectId: string }
  | { kind: 'score.adjust'; input: ScoreAdjustInput }
  | { kind: 'win.preview'; draft: RemoteWinDraft }
  | { kind: 'win.commit'; draft: RemoteWinDraft };

export interface WireBase {
  protocol: typeof LAN_PROTOCOL_VERSION;
  type: string;
  sentAt: number;
  requestId?: string;
  roomId?: string;
}

export interface ClientHello extends WireBase {
  type: 'client.hello';
  requestId: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
}

export interface JoinRequest extends WireBase {
  type: 'room.join';
  requestId: string;
  /** Manual IP entry may not know the room id until server.hello arrives. */
  roomId?: string;
  roomCode: string;
  desiredPlayerId?: string;
}

export interface ResumeRequest extends WireBase {
  type: 'room.resume';
  requestId: string;
  roomId: string;
  deviceId: string;
  seatToken: string;
  lastRevision: number;
}

export interface CommandRequest extends WireBase {
  type: 'command.request';
  requestId: string;
  roomId: string;
  commandId: string;
  matchId: string;
  handId: string;
  baseRevision: number;
  command: ControllerCommand;
}

export interface NotificationAck extends WireBase {
  type: 'notification.ack';
  requestId: string;
  roomId: string;
  notificationId: string;
}

export interface PingMessage extends WireBase {
  type: 'ping';
  requestId: string;
  nonce: string;
}

export type ClientMessage = ClientHello | JoinRequest | ResumeRequest | CommandRequest | NotificationAck | PingMessage;

export interface ServerHello extends WireBase {
  type: 'server.hello';
  requestId: string;
  roomId: string;
  serviceName: string;
  playerCount: 3 | 4;
  requiresApproval: boolean;
}

export interface SeatOffer extends WireBase {
  type: 'seat.offer';
  requestId: string;
  roomId: string;
  seats: Array<{
    playerId: string;
    playerName: string;
    currentWind: Wind;
    occupied: boolean;
  }>;
}

export interface JoinPending extends WireBase {
  type: 'room.join-pending';
  requestId: string;
  roomId: string;
  approvalId: string;
}

export interface JoinAccepted extends WireBase {
  type: 'room.join-accepted';
  requestId: string;
  roomId: string;
  playerId: string;
  seatToken: string;
  snapshot: ControllerSnapshot;
}

export interface RequestRejected extends WireBase {
  type: 'request.rejected';
  requestId: string;
  roomId?: string;
  errorCode: RequestErrorCode;
  message: string;
  retryable: boolean;
}

export interface ScorePreview {
  label: string;
  totalHan: number;
  yakuman: number;
  winnerGain: number;
  payments: Array<{ playerId: string; amount: number }>;
}

export interface CommandResult extends WireBase {
  type: 'command.result';
  requestId: string;
  roomId: string;
  commandId: string;
  status: 'accepted' | 'rejected';
  revision: number;
  replayed?: boolean;
  errorCode?: RequestErrorCode;
  message?: string;
  preview?: ScorePreview;
}

export interface ControllerSnapshotMessage extends WireBase {
  type: 'state.snapshot';
  roomId: string;
  snapshot: ControllerSnapshot;
}

export interface NotificationPush extends WireBase {
  type: 'notification.push';
  roomId: string;
  notification: ControllerNotification;
}

export interface RealtimeEventPush extends WireBase {
  type: 'realtime.event';
  roomId: string;
  event: ControllerRealtimeEvent;
}

export interface TimerTick extends WireBase {
  type: 'timer.tick';
  roomId: string;
  turnStartedAt: number;
  clock: TurnClock;
}

export interface CatalogSnapshot extends WireBase {
  type: 'catalog.snapshot';
  roomId: string;
  revision: string;
  cards: ControllerSkillCard[];
}

export interface RoomClosed extends WireBase {
  type: 'room.closed';
  roomId: string;
  reason: string;
}

export interface PongMessage extends WireBase {
  type: 'pong';
  requestId: string;
  nonce: string;
}

export type ServerMessage =
  | ServerHello
  | SeatOffer
  | JoinPending
  | JoinAccepted
  | RequestRejected
  | CommandResult
  | ControllerSnapshotMessage
  | NotificationPush
  | RealtimeEventPush
  | TimerTick
  | CatalogSnapshot
  | RoomClosed
  | PongMessage;

export interface ProtocolParseError {
  code: 'FRAME_TOO_LARGE' | 'INVALID_JSON' | 'INVALID_MESSAGE' | 'UNSUPPORTED_VERSION';
  message: string;
}

export type ProtocolParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProtocolParseError };

class ValidationFault extends Error {
  constructor(
    readonly code: ProtocolParseError['code'],
    message: string,
  ) {
    super(message);
  }
}

function secureRandomBytes(length: number) {
  const provider = globalThis.crypto;
  if (!provider?.getRandomValues) throw new Error('当前运行环境不支持安全随机数');
  return provider.getRandomValues(new Uint8Array(length));
}

export function createProtocolId(prefix = 'id') {
  const safePrefix = /^[a-z][a-z0-9-]{0,15}$/i.test(prefix) ? prefix.toLowerCase() : 'id';
  const bytes = secureRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${safePrefix}_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createRoomCode(length = ROOM_CODE_LENGTH) {
  if (!Number.isInteger(length) || length < 4 || length > 10) {
    throw new RangeError('房间码长度必须是 4 到 10 位整数');
  }
  const bytes = secureRandomBytes(length);
  let code = '';
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte & 31];
  return code;
}

export function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidRoomCode(value: string, length = ROOM_CODE_LENGTH) {
  const normalized = normalizeRoomCode(value);
  if (normalized.length !== length) return false;
  for (let index = 0; index < normalized.length; index += 1) {
    if (!ROOM_CODE_ALPHABET.includes(normalized.charAt(index))) return false;
  }
  return true;
}

export function createCommandRequest(snapshot: ControllerSnapshot, command: ControllerCommand): CommandRequest {
  return {
    protocol: LAN_PROTOCOL_VERSION,
    type: 'command.request',
    sentAt: Date.now(),
    requestId: createProtocolId('req'),
    roomId: snapshot.roomId,
    commandId: createProtocolId('cmd'),
    matchId: snapshot.matchId,
    handId: snapshot.handId,
    baseRevision: snapshot.revision,
    command,
  };
}

export function createNotificationAck(snapshot: ControllerSnapshot, notificationId: string): NotificationAck {
  return {
    protocol: LAN_PROTOCOL_VERSION,
    type: 'notification.ack',
    sentAt: Date.now(),
    requestId: createProtocolId('req'),
    roomId: snapshot.roomId,
    notificationId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string) {
  if (!isRecord(value)) throw new ValidationFault('INVALID_MESSAGE', `${label}必须是对象`);
  return value;
}

function expectString(record: Record<string, unknown>, key: string, maximum = MAX_ID_LENGTH, minimum = 1) {
  const value = record[key];
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new ValidationFault('INVALID_MESSAGE', `${key}必须是 ${minimum} 到 ${maximum} 个字符的字符串`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string, maximum = MAX_ID_LENGTH) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum) {
    throw new ValidationFault('INVALID_MESSAGE', `${key}必须是至多 ${maximum} 个字符的字符串`);
  }
  return value;
}

function expectBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'boolean') throw new ValidationFault('INVALID_MESSAGE', `${key}必须是布尔值`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ValidationFault('INVALID_MESSAGE', `${key}必须是布尔值`);
  return value;
}

function expectInteger(record: Record<string, unknown>, key: string, minimum: number, maximum: number) {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ValidationFault('INVALID_MESSAGE', `${key}必须是 ${minimum} 到 ${maximum} 的整数`);
  }
  return value as number;
}

function optionalInteger(record: Record<string, unknown>, key: string, minimum: number, maximum: number) {
  if (record[key] === undefined) return undefined;
  return expectInteger(record, key, minimum, maximum);
}

function expectLiteral<T extends string | number>(record: Record<string, unknown>, key: string, values: readonly T[]) {
  const value = record[key];
  if ((typeof value !== 'string' && typeof value !== 'number') || !values.includes(value as T)) {
    throw new ValidationFault('INVALID_MESSAGE', `${key}不是受支持的值`);
  }
  return value as T;
}

function expectStringArray(value: unknown, label: string, maximumItems: number, maximumLength = MAX_ID_LENGTH, unique = true) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new ValidationFault('INVALID_MESSAGE', `${label}必须是至多 ${maximumItems} 项的数组`);
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length < 1 || item.length > maximumLength) {
      throw new ValidationFault('INVALID_MESSAGE', `${label}包含无效字符串`);
    }
    if (!unique || !seen.has(item)) {
      seen.add(item);
      output.push(item);
    }
  }
  return output;
}

function parseWireBase(record: Record<string, unknown>, expectedType: string) {
  if (record.protocol !== LAN_PROTOCOL_VERSION) {
    throw new ValidationFault('UNSUPPORTED_VERSION', `仅支持协议版本 ${LAN_PROTOCOL_VERSION}`);
  }
  if (record.type !== expectedType) throw new ValidationFault('INVALID_MESSAGE', `消息类型必须是 ${expectedType}`);
  return {
    protocol: LAN_PROTOCOL_VERSION,
    type: expectedType,
    sentAt: expectInteger(record, 'sentAt', 0, Number.MAX_SAFE_INTEGER),
    requestId: optionalString(record, 'requestId'),
    roomId: optionalString(record, 'roomId'),
  };
}

function parseJsonFrame(text: string): ProtocolParseResult<unknown> {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > MAX_WIRE_BYTES) {
    return { ok: false, error: { code: 'FRAME_TOO_LARGE', message: `消息不能超过 ${MAX_WIRE_BYTES} 字节` } };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: { code: 'INVALID_JSON', message: '消息不是有效的 JSON' } };
  }
}

function parseRemoteWinDraft(value: unknown): RemoteWinDraft {
  const record = expectRecord(value, 'draft');
  const winType = expectLiteral(record, 'winType', ['ron', 'tsumo'] as const);
  const loserPlayerId = optionalString(record, 'loserPlayerId');
  if (winType === 'ron' && !loserPlayerId) {
    throw new ValidationFault('INVALID_MESSAGE', '荣和必须选择放铳者');
  }
  const overridesRecord = expectRecord(record.yakuOverrides, 'yakuOverrides');
  const yakuOverrides: Record<string, number> = {};
  if (Object.keys(overridesRecord).length > MAX_LIST_COUNT) {
    throw new ValidationFault('INVALID_MESSAGE', 'yakuOverrides项目过多');
  }
  for (const [key, entry] of Object.entries(overridesRecord)) {
    if (!key || key.length > MAX_ID_LENGTH || !Number.isSafeInteger(entry) || (entry as number) < 0 || (entry as number) > 100) {
      throw new ValidationFault('INVALID_MESSAGE', 'yakuOverrides包含无效番数');
    }
    yakuOverrides[key] = entry as number;
  }
  // Physical tiles are an ordered multiset, unlike IDs/targets: never deduplicate them.
  const tiles = expectStringArray(record.tiles, 'tiles', MAX_TILE_COUNT, 16, false);
  for (const tile of tiles) {
    if (!/^(?:[0-9][mps]|[1-7]z|chun|dong|ju|lan|mei|qiu|xia|zu)$/.test(tile)) {
      throw new ValidationFault('INVALID_MESSAGE', `未知牌张：${tile}`);
    }
  }
  return {
    winType,
    ...(record.analysis ? { analysis: (() => { const a = expectRecord(record.analysis, 'analysis'); return { winningTile: expectString(a, 'winningTile', 4, 0), meldText: expectString(a, 'meldText', 200, 0), automatic: expectBoolean(a, 'automatic') }; })() } : {}),
    ...(loserPlayerId ? { loserPlayerId } : {}),
    tiles,
    closed: expectBoolean(record, 'closed'),
    fu: expectInteger(record, 'fu', 20, 200),
    selectedYakuIds: expectStringArray(record.selectedYakuIds, 'selectedYakuIds', MAX_LIST_COUNT),
    yakuOverrides,
    dora: expectInteger(record, 'dora', 0, 100),
    uraDora: expectInteger(record, 'uraDora', 0, 100),
    akaDora: expectInteger(record, 'akaDora', 0, 100),
    flowerDora: expectInteger(record, 'flowerDora', 0, 100),
    bonusHan: expectInteger(record, 'bonusHan', 0, 100),
    extraPoints: expectInteger(record, 'extraPoints', 0, 1_000_000),
  };
}

function parseControllerCommand(value: unknown): ControllerCommand {
  const record = expectRecord(value, 'command');
  const kind = expectString(record, 'kind', 40);
  if (kind === 'character.select') {
    if (!validCharacterChoice(record.character)) throw new ValidationFault('INVALID_MESSAGE', '角色资料无效');
    return { kind, character: record.character };
  }
  if (kind === 'riichi.declare') return { kind };
  if (kind === 'draw.confirm' || kind === 'discard.confirm') return { kind, turnStartedAt: expectInteger(record, 'turnStartedAt', 0, Number.MAX_SAFE_INTEGER) };
  if (kind === 'emote.send') {
    const emoteId = expectString(record, 'emoteId', 64);
    if (!/^[a-z0-9-]+$/.test(emoteId)) throw new ValidationFault('INVALID_MESSAGE', 'emoteId格式不正确');
    return { kind, emoteId };
  }
  if (kind === 'effect.resolve-own') {
    return { kind, effectId: expectString(record, 'effectId') };
  }
  if (kind === 'score.adjust') {
    const input = expectRecord(record.input, 'input');
    const counterpartyPlayerId = optionalString(input, 'counterpartyPlayerId');
    return {
      kind,
      input: {
        direction: expectLiteral(input, 'direction', ['add', 'deduct'] as const),
        amount: expectInteger(input, 'amount', 1, 1_000_000),
        ...(counterpartyPlayerId ? { counterpartyPlayerId } : {}),
        reason: expectString(input, 'reason', MAX_SHORT_TEXT_LENGTH),
      },
    };
  }
  if (kind === 'skill.activate') {
    const input = expectRecord(record.input, 'input');
    const effectText = optionalString(input, 'effectText', MAX_EFFECT_TEXT_LENGTH);
    return {
      kind,
      input: {
        cardId: expectInteger(input, 'cardId', 1, Number.MAX_SAFE_INTEGER),
        targetPlayerIds: expectStringArray(input.targetPlayerIds, 'targetPlayerIds', MAX_TARGET_COUNT),
        duration: expectLiteral(input, 'duration', ['once', 'hand', 'match', 'manual'] as const),
        faceDown: expectBoolean(input, 'faceDown'),
        ...(effectText === undefined ? {} : { effectText }),
      },
    };
  }
  if (kind === 'skill.reveal') {
    const input = expectRecord(record.input, 'input');
    const effectText = optionalString(input, 'effectText', MAX_EFFECT_TEXT_LENGTH);
    return {
      kind,
      input: {
        effectId: expectString(input, 'effectId'),
        targetPlayerIds: expectStringArray(input.targetPlayerIds, 'targetPlayerIds', MAX_TARGET_COUNT),
        ...(effectText === undefined ? {} : { effectText }),
      },
    };
  }
  if (kind === 'win.preview' || kind === 'win.commit') {
    return { kind, draft: parseRemoteWinDraft(record.draft) };
  }
  throw new ValidationFault('INVALID_MESSAGE', `未知控制命令：${kind}`);
}

function parseClientRecord(record: Record<string, unknown>): ClientMessage {
  const type = expectString(record, 'type', 40);
  if (type === 'client.hello') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      deviceId: expectString(record, 'deviceId'),
      deviceName: expectString(record, 'deviceName', MAX_SHORT_TEXT_LENGTH),
      appVersion: expectString(record, 'appVersion', 40),
    };
  }
  if (type === 'room.join') {
    const base = parseWireBase(record, type);
    const rawRoomCode = expectString(record, 'roomCode', 20);
    const roomCode = normalizeRoomCode(rawRoomCode);
    if (!isValidRoomCode(roomCode)) throw new ValidationFault('INVALID_MESSAGE', 'roomCode格式不正确');
    const desiredPlayerId = optionalString(record, 'desiredPlayerId');
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomCode,
      ...(base.roomId === undefined ? {} : { roomId: base.roomId }),
      ...(desiredPlayerId === undefined ? {} : { desiredPlayerId }),
    };
  }
  if (type === 'room.resume') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      deviceId: expectString(record, 'deviceId'),
      seatToken: expectString(record, 'seatToken', 256),
      lastRevision: expectInteger(record, 'lastRevision', 0, Number.MAX_SAFE_INTEGER),
    };
  }
  if (type === 'command.request') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      commandId: expectString(record, 'commandId'),
      matchId: expectString(record, 'matchId'),
      handId: expectString(record, 'handId'),
      baseRevision: expectInteger(record, 'baseRevision', 0, Number.MAX_SAFE_INTEGER),
      command: parseControllerCommand(record.command),
    };
  }
  if (type === 'notification.ack') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      notificationId: expectString(record, 'notificationId'),
    };
  }
  if (type === 'ping') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      nonce: expectString(record, 'nonce'),
    };
  }
  throw new ValidationFault('INVALID_MESSAGE', `未知客户端消息：${type}`);
}

export function parseClientMessage(text: string): ProtocolParseResult<ClientMessage> {
  const parsed = parseJsonFrame(text);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, value: parseClientRecord(expectRecord(parsed.value, '消息')) };
  } catch (error) {
    if (error instanceof ValidationFault) return { ok: false, error: { code: error.code, message: error.message } };
    return { ok: false, error: { code: 'INVALID_MESSAGE', message: '客户端消息格式不正确' } };
  }
}

const WINDS = ['东', '南', '西', '北'] as const;
const PARTICIPATIONS = ['playing', 'won', 'eliminated'] as const;
const EFFECT_DIRECTIONS = ['incoming', 'self', 'team', 'outgoing', 'table', 'hidden-own'] as const;
const EFFECT_DURATIONS = ['once', 'hand', 'match', 'manual'] as const;
const EFFECT_STATES = ['armed', 'active', 'triggered'] as const;
const NOTIFICATION_KINDS = ['skill-affected', 'table-effect', 'score-changed', 'match-reset'] as const;
const REQUEST_ERROR_CODES = [
  'INVALID_MESSAGE',
  'UNSUPPORTED_VERSION',
  'AUTH_FAILED',
  'ROOM_CLOSED',
  'SEAT_TAKEN',
  'HOST_APPROVAL_REQUIRED',
  'STALE_STATE',
  'HAND_CHANGED',
  'NOT_ALLOWED',
  'INVALID_PAYLOAD',
  'INVALID_TARGET',
  'ALREADY_RIICHI',
  'INSUFFICIENT_POINTS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

function expectArray(value: unknown, label: string, maximumItems: number) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new ValidationFault('INVALID_MESSAGE', `${label}必须是至多 ${maximumItems} 项的数组`);
  }
  return value;
}

function parseControllerNotification(value: unknown): ControllerNotification {
  const record = expectRecord(value, 'notification');
  const sourceLabel = optionalString(record, 'sourceLabel', MAX_SHORT_TEXT_LENGTH);
  const effectId = optionalString(record, 'effectId');
  const durationLabel = optionalString(record, 'durationLabel', MAX_SHORT_TEXT_LENGTH);
  return {
    notificationId: expectString(record, 'notificationId'),
    eventId: expectString(record, 'eventId'),
    kind: expectLiteral(record, 'kind', NOTIFICATION_KINDS),
    title: expectString(record, 'title', MAX_SHORT_TEXT_LENGTH),
    body: expectString(record, 'body', MAX_EFFECT_TEXT_LENGTH),
    ...(sourceLabel === undefined ? {} : { sourceLabel }),
    ...(effectId === undefined ? {} : { effectId }),
    ...(durationLabel === undefined ? {} : { durationLabel }),
    requiresAck: expectBoolean(record, 'requiresAck'),
    createdAt: expectString(record, 'createdAt', 64),
  };
}

function parseControllerEffect(value: unknown): ControllerEffect {
  const record = expectRecord(value, 'effect');
  const createdAt = optionalString(record, 'createdAt', 64);
  return {
    effectId: expectString(record, 'effectId'),
    cardId: expectInteger(record, 'cardId', 1, Number.MAX_SAFE_INTEGER),
    cardName: expectString(record, 'cardName', MAX_SHORT_TEXT_LENGTH),
    effectText: expectString(record, 'effectText', MAX_EFFECT_TEXT_LENGTH, 0),
    direction: expectLiteral(record, 'direction', EFFECT_DIRECTIONS),
    sourceLabel: expectString(record, 'sourceLabel', MAX_SHORT_TEXT_LENGTH),
    duration: expectLiteral(record, 'duration', EFFECT_DURATIONS),
    state: expectLiteral(record, 'state', EFFECT_STATES),
    hidden: expectBoolean(record, 'hidden'),
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

function parsePresentation(value: unknown): TablePresentation {
  const p = expectRecord(value, 'presentation');
  const textList = (key: string) => expectArray(p[key], key, 32).map(value => expectString({ value }, 'value'));
  return {
    id: expectString(p, 'id'), createdAt: expectInteger(p, 'createdAt', 0, Number.MAX_SAFE_INTEGER),
    kind: expectLiteral(p, 'kind', ['riichi', 'win'] as const),
    playerId: expectString(p, 'playerId'), playerName: expectString(p, 'playerName'),
    winType: p.winType === undefined ? undefined : expectLiteral(p, 'winType', ['ron', 'tsumo'] as const),
    loserId: optionalString(p, 'loserId'),
    han: expectInteger(p, 'han', 0, 10000), fu: expectInteger(p, 'fu', 0, 10000),
    yakuman: expectInteger(p, 'yakuman', 0, 1000), limit: typeof p.limit === 'string' ? p.limit.slice(0, 160) : '',
    points: expectInteger(p, 'points', 0, Number.MAX_SAFE_INTEGER), yaku: textList('yaku'),
    tiles: textList('tiles').filter(tile => /^(?:[0-9][mps]|[1-7]z|chun|dong|ju|lan|mei|qiu|xia|zu)$/.test(tile)),
    scores: expectArray(p.scores, 'scores', 4).map(value => {
      const score = expectRecord(value, 'score');
      return { playerId: expectString(score, 'playerId'), before: expectInteger(score, 'before', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        after: expectInteger(score, 'after', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) };
    }),
  };
}

function parseControllerSnapshot(value: unknown): ControllerSnapshot {
  const record = expectRecord(value, 'snapshot');
  const self = expectRecord(record.self, 'snapshot.self');
  if (self.character !== undefined && !validCharacterChoice(self.character)) throw new ValidationFault('INVALID_MESSAGE', '角色资料无效');
  const table = expectRecord(record.table, 'snapshot.table');
  const controls = expectRecord(record.controls, 'snapshot.controls');

  const targetOptions = expectArray(record.targetOptions, 'snapshot.targetOptions', MAX_TARGET_COUNT).map((entry) => {
    const target = expectRecord(entry, 'targetOption');
    return {
      playerId: expectString(target, 'playerId'),
      wind: expectLiteral(target, 'wind', WINDS),
      active: expectBoolean(target, 'active'),
    };
  });
  const effects = expectArray(record.effects, 'snapshot.effects', MAX_LIST_COUNT).map(parseControllerEffect);
  const pendingNotifications = expectArray(
    record.pendingNotifications,
    'snapshot.pendingNotifications',
    MAX_LIST_COUNT,
  ).map(parseControllerNotification);

  return {
    roomId: expectString(record, 'roomId'),
    matchId: expectString(record, 'matchId'),
    handId: expectString(record, 'handId'),
    revision: expectInteger(record, 'revision', 0, Number.MAX_SAFE_INTEGER),
    self: {
      playerId: expectString(self, 'playerId'),
      name: expectString(self, 'name', MAX_SHORT_TEXT_LENGTH),
      ...(self.character === undefined ? {} : { character: self.character as CharacterChoice }),
      wind: expectLiteral(self, 'wind', WINDS),
      team: expectString(self, 'team', MAX_SHORT_TEXT_LENGTH, 0),
      score: expectInteger(self, 'score', -1_000_000_000, 1_000_000_000),
      riichi: expectBoolean(self, 'riichi'),
      participation: expectLiteral(self, 'participation', PARTICIPATIONS),
    },
    table: {
      roundWind: expectLiteral(table, 'roundWind', WINDS),
      handNumber: expectInteger(table, 'handNumber', 1, 4),
      honba: expectInteger(table, 'honba', 0, 1_000_000),
      riichiSticks: expectInteger(table, 'riichiSticks', 0, 1_000_000),
      wallCount: expectInteger(table, 'wallCount', 0, 1_000_000),
      handEnded: expectBoolean(table, 'handEnded'),
      isMyTurn: expectBoolean(table, 'isMyTurn'),
      wushuang: expectBoolean(table, 'wushuang'),
      openTanyao: table.openTanyao === undefined ? true : expectBoolean(table, 'openTanyao'),
      kiriageMangan: table.kiriageMangan === undefined ? false : expectBoolean(table, 'kiriageMangan'),
      kazoeYakuman: table.kazoeYakuman === undefined ? true : expectBoolean(table, 'kazoeYakuman'),
      timerEnabled: table.timerEnabled === undefined ? false : expectBoolean(table, 'timerEnabled'),
      turnState: table.turnState === undefined ? 'waiting' : expectLiteral(table, 'turnState', ['waiting', 'thinking'] as const),
      timerPaused: table.timerPaused === undefined ? false : expectBoolean(table, 'timerPaused'),
      clock: table.clock === undefined ? undefined : parseTurnClock(table.clock),
      turnPlayerId: optionalString(table, 'turnPlayerId'),
      turnWind: table.turnWind === undefined ? undefined : expectLiteral(table, 'turnWind', WINDS),
      turnStartedAt: optionalInteger(table, 'turnStartedAt', 0, Number.MAX_SAFE_INTEGER),
      turnFixedSeconds: optionalInteger(table, 'turnFixedSeconds', 0, 3600),
      turnExtraSeconds: optionalInteger(table, 'turnExtraSeconds', 0, 86_400),
    },
    targetOptions,
    controls: {
      canDraw: expectBoolean(controls, 'canDraw'),
      canDiscard: controls.canDiscard === undefined ? false : expectBoolean(controls, 'canDiscard'),
      canRiichi: expectBoolean(controls, 'canRiichi'),
      canWin: expectBoolean(controls, 'canWin'),
      canUseSkill: expectBoolean(controls, 'canUseSkill'),
    },
    effects,
    pendingNotifications,
    skillCatalogRevision: expectString(record, 'skillCatalogRevision'),
    presentations: record.presentations === undefined ? [] : expectArray(record.presentations, 'presentations', 8).map(parsePresentation),
  };
}

function parseScorePreview(value: unknown): ScorePreview {
  const record = expectRecord(value, 'preview');
  const payments = expectArray(record.payments, 'preview.payments', MAX_TARGET_COUNT).map((entry) => {
    const payment = expectRecord(entry, 'payment');
    return {
      playerId: expectString(payment, 'playerId'),
      amount: expectInteger(payment, 'amount', 0, 1_000_000_000),
    };
  });
  return {
    label: expectString(record, 'label', MAX_SHORT_TEXT_LENGTH),
    totalHan: expectInteger(record, 'totalHan', 0, 1_000),
    yakuman: expectInteger(record, 'yakuman', 0, 100),
    winnerGain: expectInteger(record, 'winnerGain', 0, 1_000_000_000),
    payments,
  };
}

function parseControllerSkillCard(value: unknown): ControllerSkillCard {
  const record = expectRecord(value, 'card');
  return {
    id: expectInteger(record, 'id', 1, Number.MAX_SAFE_INTEGER),
    name: expectString(record, 'name', MAX_SHORT_TEXT_LENGTH),
    typeCode: expectString(record, 'typeCode', 16),
    effectDescription: expectString(record, 'effectDescription', MAX_EFFECT_TEXT_LENGTH, 0),
  };
}

function parseServerRecord(record: Record<string, unknown>): ServerMessage {
  const type = expectString(record, 'type', 40);
  if (type === 'server.hello') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      serviceName: expectString(record, 'serviceName', MAX_SHORT_TEXT_LENGTH),
      playerCount: expectLiteral(record, 'playerCount', [3, 4] as const),
      requiresApproval: expectBoolean(record, 'requiresApproval'),
    };
  }
  if (type === 'seat.offer') {
    const base = parseWireBase(record, type);
    const seats = expectArray(record.seats, 'seats', MAX_TARGET_COUNT).map((entry) => {
      const seat = expectRecord(entry, 'seat');
      return {
        playerId: expectString(seat, 'playerId'),
        playerName: expectString(seat, 'playerName', MAX_SHORT_TEXT_LENGTH),
        currentWind: expectLiteral(seat, 'currentWind', WINDS),
        occupied: expectBoolean(seat, 'occupied'),
      };
    });
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      seats,
    };
  }
  if (type === 'room.join-pending') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      approvalId: expectString(record, 'approvalId'),
    };
  }
  if (type === 'room.join-accepted') {
    const base = parseWireBase(record, type);
    const roomId = expectString(record, 'roomId');
    const snapshot = parseControllerSnapshot(record.snapshot);
    if (snapshot.roomId !== roomId) throw new ValidationFault('INVALID_MESSAGE', 'snapshot房间与消息房间不一致');
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId,
      playerId: expectString(record, 'playerId'),
      seatToken: expectString(record, 'seatToken', 256),
      snapshot,
    };
  }
  if (type === 'request.rejected') {
    const base = parseWireBase(record, type);
    const roomId = optionalString(record, 'roomId');
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      ...(roomId === undefined ? {} : { roomId }),
      errorCode: expectLiteral(record, 'errorCode', REQUEST_ERROR_CODES),
      message: expectString(record, 'message', MAX_EFFECT_TEXT_LENGTH),
      retryable: expectBoolean(record, 'retryable'),
    };
  }
  if (type === 'command.result') {
    const base = parseWireBase(record, type);
    const replayed = optionalBoolean(record, 'replayed');
    const errorCode = record.errorCode === undefined
      ? undefined
      : expectLiteral(record, 'errorCode', REQUEST_ERROR_CODES);
    const message = optionalString(record, 'message', MAX_EFFECT_TEXT_LENGTH);
    const preview = record.preview === undefined ? undefined : parseScorePreview(record.preview);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      roomId: expectString(record, 'roomId'),
      commandId: expectString(record, 'commandId'),
      status: expectLiteral(record, 'status', ['accepted', 'rejected'] as const),
      revision: expectInteger(record, 'revision', 0, Number.MAX_SAFE_INTEGER),
      ...(replayed === undefined ? {} : { replayed }),
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(message === undefined ? {} : { message }),
      ...(preview === undefined ? {} : { preview }),
    };
  }
  if (type === 'state.snapshot') {
    const base = parseWireBase(record, type);
    const roomId = expectString(record, 'roomId');
    const snapshot = parseControllerSnapshot(record.snapshot);
    if (snapshot.roomId !== roomId) throw new ValidationFault('INVALID_MESSAGE', 'snapshot房间与消息房间不一致');
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      roomId,
      snapshot,
    };
  }
  if (type === 'notification.push') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      roomId: expectString(record, 'roomId'),
      notification: parseControllerNotification(record.notification),
    };
  }
  if (type === 'timer.tick') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION, type, sentAt: base.sentAt,
      roomId: expectString(record, 'roomId'),
      turnStartedAt: expectInteger(record, 'turnStartedAt', 0, Number.MAX_SAFE_INTEGER),
      clock: parseTurnClock(record.clock),
    };
  }
  if (type === 'realtime.event') {
    const base = parseWireBase(record, type);
    const event = expectRecord(record.event, 'event');
    const kind = expectLiteral(event, 'kind', ['emote', 'draw'] as const);
    const emoteId = optionalString(event, 'emoteId', 64);
    if (kind === 'emote' && (!emoteId || !/^[a-z0-9-]+$/.test(emoteId))) {
      throw new ValidationFault('INVALID_MESSAGE', '表情事件缺少有效 emoteId');
    }
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      roomId: expectString(record, 'roomId'),
      event: {
        eventId: expectString(event, 'eventId'),
        kind,
        actorPlayerId: expectString(event, 'actorPlayerId'),
        actorName: expectString(event, 'actorName', MAX_SHORT_TEXT_LENGTH),
        ...(emoteId ? { emoteId } : {}),
        createdAt: expectInteger(event, 'createdAt', 0, Number.MAX_SAFE_INTEGER),
      },
    };
  }
  if (type === 'catalog.snapshot') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      roomId: expectString(record, 'roomId'),
      revision: expectString(record, 'revision'),
      cards: expectArray(record.cards, 'cards', MAX_CATALOG_CARD_COUNT).map(parseControllerSkillCard),
    };
  }
  if (type === 'room.closed') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      roomId: expectString(record, 'roomId'),
      reason: expectString(record, 'reason', MAX_EFFECT_TEXT_LENGTH),
    };
  }
  if (type === 'pong') {
    const base = parseWireBase(record, type);
    return {
      protocol: LAN_PROTOCOL_VERSION,
      type,
      sentAt: base.sentAt,
      requestId: expectString(record, 'requestId'),
      nonce: expectString(record, 'nonce'),
    };
  }
  throw new ValidationFault('INVALID_MESSAGE', `未知服务端消息：${type}`);
}

export function parseServerMessage(text: string): ProtocolParseResult<ServerMessage> {
  const parsed = parseJsonFrame(text);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, value: parseServerRecord(expectRecord(parsed.value, '消息')) };
  } catch (error) {
    if (error instanceof ValidationFault) return { ok: false, error: { code: error.code, message: error.message } };
    return { ok: false, error: { code: 'INVALID_MESSAGE', message: '服务端消息格式不正确' } };
  }
}

export function parseDiscoveredRoom(value: unknown): ProtocolParseResult<DiscoveredRoom> {
  try {
    const record = expectRecord(value, '发现的房间');
    const playerCount = optionalInteger(record, 'playerCount', 3, 4);
    if (playerCount !== undefined && playerCount !== 3 && playerCount !== 4) {
      throw new ValidationFault('INVALID_MESSAGE', 'playerCount必须为 3 或 4');
    }
    return {
      ok: true,
      value: {
        roomId: expectString(record, 'roomId'),
        serviceName: expectString(record, 'serviceName', MAX_SHORT_TEXT_LENGTH),
        host: expectString(record, 'host', 255),
        port: expectInteger(record, 'port', 1, 65_535),
        protocol: expectInteger(record, 'protocol', 1, Number.MAX_SAFE_INTEGER),
        ...(playerCount === undefined ? {} : { playerCount }),
      },
    };
  } catch (error) {
    if (error instanceof ValidationFault) return { ok: false, error: { code: error.code, message: error.message } };
    return { ok: false, error: { code: 'INVALID_MESSAGE', message: '房间发现资料格式不正确' } };
  }
}

export function serializeWireMessage(message: ClientMessage | ServerMessage) {
  const text = JSON.stringify(message);
  if (new TextEncoder().encode(text).byteLength > MAX_WIRE_BYTES) {
    throw new RangeError(`消息不能超过 ${MAX_WIRE_BYTES} 字节`);
  }
  return text;
}
