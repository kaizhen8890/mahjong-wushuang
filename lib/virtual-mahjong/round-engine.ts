import { ActionGate, type ActionEnvelope } from './action-gate';
import { callDeadline, respondToCall, resolveCalls } from './call-window';
import { selfKanOptions, type SelfKanOption } from './kan';
import { readRoundCheckpoint, requireCheckpoint, resumeClock, type RoundCheckpoint } from './checkpoint';
import type { RoundCarry } from './match-progression';
import { emptyActions, type AuthoritativeGameState, type CallOption, type CallWindow, type Player,
  type PrivateEvent, type RoundResult, type Rules } from './model';
import { projectForViewer, type Viewer } from './projection';
import { validateRules } from './rules';
import { prepareLocalSupply, supplyableTypes, validateLocalAccess, type LocalSupplyAccess, type LocalSupplyRequest } from './local-supply';
import { evaluateWin, nagashiPlayerIds, nagashiSettlement, waits, type WinFacts } from './scoring';
import { createTiles, type Tile } from './tiles';
import { createWall, dealHands, drawLive, drawNukiReplacement, drawRinshan, revealKanDora, type RandomUint32, type Wall } from './wall';

export type RoundIntent = { kind: 'DISCARD' | 'RIICHI'; tileId: number }
  | { kind: 'KAN'; optionId: string }
  | { kind: 'NUKI'; tileId: number }
  | { kind: 'TSUMO' } | { kind: 'RESPOND'; optionId: string } | { kind: 'ABORT_NINE_TERMINALS' };
export type RoundRequest = ActionEnvelope & RoundIntent;
export interface RoundOptions {
  gameId: string; roundId: string; rules: Rules; players: { id: string; name: string }[]; dealerSeat: number;
  /** Trusted match progression only; not a mid-round restore or client-supplied setup. */
  carry?: RoundCarry;
}
export interface HostDependencies {
  now: () => number;
  random?: RandomUint32;
  /** Local cooperative session only. Not part of RoundOptions or any network request. */
  localSupply?: LocalSupplyAccess;
  /** Host-only deterministic fixtures. Never populate this from a room/client message. */
  makeWall?: (rules: Rules, context: { dealerSeat: number; roundWind: RoundCarry['roundWind']; handNumber: number }) => Wall;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (!size) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), size - 1).map(tail => [item, ...tail]));
}

/** Experimental single-round slice. No UI/network dependencies.
 * Implemented: draw/discard, chi/pon, riichi, ron/tsumo, furiten, basic aborts and exhaustive result.
 * Match advancement remains separate. Kan declarations resolve robbery before committing tiles.
 */
export class MahjongRoundEngine {
  private state: AuthoritativeGameState;
  private readonly gate: ActionGate;
  private lastNow: number;
  private firstCycleInterrupted = false;
  private pendingRiichi: string | null = null;
  private forbiddenDiscardTypes: number[] = [];
  private pendingKan: { playerId: string; option: SelfKanOption } | null = null;
  private pendingNuki: { playerId: string; tileId: number } | null = null;
  private rinshanPlayerId: string | null = null;

  constructor(options: RoundOptions, private readonly host: HostDependencies) {
    validateRules(options.rules);
    if (host.localSupply) validateLocalAccess(host.localSupply, options.players.map(player => player.id));
    if (!options.gameId || !options.roundId || options.players.length !== options.rules.players
      || new Set(options.players.map(player => player.id)).size !== options.players.length
      || options.players.some(player => !/^[A-Za-z0-9_-]{1,128}$/.test(player.id)
        || ['__proto__', 'constructor', 'prototype'].includes(player.id) || !player.name.trim())
      || !Number.isInteger(options.dealerSeat) || options.dealerSeat < 0 || options.dealerSeat >= options.players.length) {
      throw new Error('Invalid round setup');
    }
    const now = host.now();
    if (!Number.isFinite(now) || now < 0) throw new Error('Invalid Host clock');
    this.lastNow = now;
    const carry = options.carry;
    if (carry && (!['east', 'south', 'west', 'north'].includes(carry.roundWind)
      || !Number.isSafeInteger(carry.handNumber) || carry.handNumber < 1 || carry.handNumber > options.rules.players
      || !Number.isSafeInteger(carry.honba) || carry.honba < 0
      || !Number.isSafeInteger(carry.riichiSticks) || carry.riichiSticks < 0
      || !carry.points || Object.keys(carry.points).length !== options.players.length
      || options.players.some(player => !Object.hasOwn(carry.points, player.id)
        || !Number.isSafeInteger(carry.points[player.id]) || carry.points[player.id] % 100 !== 0)
      || options.players.reduce((sum, player) => sum + carry.points[player.id], carry.riichiSticks * 1000)
        !== options.rules.startingPoints * options.players.length)) throw new Error('Invalid round carry');
    const wall = structuredClone(host.makeWall?.(structuredClone(options.rules), { dealerSeat: options.dealerSeat,
      roundWind: carry?.roundWind ?? 'east', handNumber: carry?.handNumber ?? 1 })
      ?? createWall(options.rules.players, options.rules.redFives, host.random));
    const expected = createTiles(options.rules.players, options.rules.redFives);
    const actual = [...wall.live, ...wall.dead];
    if (wall.dead.length !== 14 || actual.length !== expected.length || wall.rinshanUsed !== 0 || wall.indicatorsRevealed !== 1
      || new Set(actual.map(tile => tile.id)).size !== expected.length
      || actual.some(tile => !expected.some(item => item.id === tile.id && item.type === tile.type && item.red === tile.red))) {
      throw new Error('Invalid initial wall');
    }
    const hands = dealHands(wall, options.rules.players, options.dealerSeat);
    const dealerId = options.players[options.dealerSeat].id;
    this.state = { schemaVersion: 1, gameId: options.gameId, roundId: options.roundId, turnId: 1, revision: 1,
      mode: 'STANDARD_RIICHI', rules: structuredClone(options.rules), phase: { kind: 'AFTER_DRAW', playerId: dealerId },
      players: options.players.map((player, seat) => ({ id: player.id, name: player.name, seat,
        wind: (['east', 'south', 'west', 'north'] as const)[(seat - options.dealerSeat + options.players.length) % options.players.length],
        points: carry?.points[player.id] ?? options.rules.startingPoints, connected: true, ready: true, hand: hands[seat],
        drawnTileId: seat === options.dealerSeat ? hands[seat][13].id : null, melds: [], nuki: [], river: [], riichi: 'none',
        ippatsu: false, furiten: { temporary: false, riichi: false }, bankMs: options.rules.timer.bankMs })),
      wall, roundWind: carry?.roundWind ?? 'east', handNumber: carry?.handNumber ?? 1, dealerId,
      honba: carry?.honba ?? 0, riichiSticks: carry?.riichiSticks ?? 0, clock: null, actions: {}, events: [] };
    this.gate = new ActionGate(options.gameId, options.roundId);
    if (!carry) this.event('GAME_START', null, now, { rules: this.state.rules });
    this.event('ROUND_START', null, now, { roundId: this.state.roundId, dealerId, roundWind: this.state.roundWind,
      handNumber: this.state.handNumber, honba: this.state.honba, riichiSticks: this.state.riichiSticks,
      points: Object.fromEntries(this.state.players.map(player => [player.id, player.points])), wall: structuredClone(wall) });
    this.event('DEAL', null, now, { hands: structuredClone(hands) });
    this.startClock(dealerId, now);
    this.refreshActions();
  }

  /** Host storage/debug only; never give this to a player component or network send. */
  hostSnapshot(): AuthoritativeGameState { return structuredClone(this.state); }
  view(viewer: Viewer) { return projectForViewer(this.state, viewer); }

  exportCheckpoint(): RoundCheckpoint {
    const { actions: _actions, ...state } = this.hostSnapshot();
    return { format: 'musou.host.round', version: 1, savedAt: this.readNow(), state,
      runtime: { lastNow: this.lastNow, firstCycleInterrupted: this.firstCycleInterrupted, pendingRiichi: this.pendingRiichi,
        forbiddenDiscardTypes: [...this.forbiddenDiscardTypes], pendingKan: structuredClone(this.pendingKan),
        pendingNuki: structuredClone(this.pendingNuki),
        ...(this.host.localSupply ? { localSupply: structuredClone(this.host.localSupply) } : {}),
        rinshanPlayerId: this.rinshanPlayerId, committedActions: this.gate.saveKeys() } };
  }

  /** Restore directly; never deal a throwaway wall or replay network messages. Downtime is paused. */
  static restoreCheckpoint(input: unknown, host: HostDependencies): MahjongRoundEngine {
    const saved = readRoundCheckpoint(input);
    requireCheckpoint(JSON.stringify(saved.runtime.localSupply ?? null) === JSON.stringify(host.localSupply ?? null));
    const engine = Object.create(MahjongRoundEngine.prototype) as MahjongRoundEngine;
    Object.assign(engine, { state: { ...saved.state, actions: {} }, host,
      gate: new ActionGate(saved.state.gameId, saved.state.roundId, saved.runtime.committedActions),
      lastNow: saved.runtime.lastNow, firstCycleInterrupted: saved.runtime.firstCycleInterrupted,
      pendingRiichi: saved.runtime.pendingRiichi, forbiddenDiscardTypes: saved.runtime.forbiddenDiscardTypes,
      pendingKan: saved.runtime.pendingKan, pendingNuki: saved.runtime.pendingNuki,
      rinshanPlayerId: saved.runtime.rinshanPlayerId });
    try {
      const phase = engine.state.phase;
      if (phase.kind === 'WAITING_CALL_RESPONSE') {
        const window = phase.window; const source = engine.player(window.sourcePlayerId);
        if (window.trigger === 'discard') {
          const discard = source.river.at(-1);
          requireCheckpoint(discard && discard.tile.id === window.tile.id && discard.calledBy === null
            && (discard.riichi ? engine.pendingRiichi === source.id : engine.pendingRiichi === null));
        } else if (window.trigger === 'nuki') {
          requireCheckpoint(engine.pendingNuki?.playerId === source.id && engine.pendingNuki.tileId === window.tile.id
            && source.hand.some(tile => tile.id === window.tile.id && tile.type === 30));
        } else {
          const option = engine.pendingKan!.option;
          requireCheckpoint(engine.canKan() && selfKanOptions(source, engine.state.rules.players)
            .some(item => JSON.stringify(item) === JSON.stringify(option)) && option.tileIds.includes(window.tile.id));
        }
        const eligible: CallWindow['eligible'] = {};
        for (const other of engine.state.players) {
          if (other.id === source.id) continue;
          if (window.trigger === 'discard') {
            const options = engine.callOptions(other, source, window.tile);
            if (options.length) eligible[other.id] = options;
          } else {
            const win = evaluateWin(engine.state, other.id, window.tile, engine.winFacts(other, 'ron', source.id));
            if (win && (window.trigger === 'kakan' || window.trigger === 'nuki'
              || win.yaku.some(id => ['kokushi', 'kokushi-13'].includes(id)))) {
              eligible[other.id] = [{ id: 'ron', kind: 'ron', consumeTileIds: [] }];
            }
          }
        }
        requireCheckpoint(JSON.stringify(eligible) === JSON.stringify(window.eligible));
      }
      if (phase.kind === 'WAITING_DISCARD') {
        const player = engine.player(phase.playerId); const meld = player.melds.at(-1)!;
        requireCheckpoint(meld && ['chi', 'pon'].includes(meld.kind) && player.drawnTileId === null);
        const called = meld.tiles.find(tile => tile.id === meld.calledTileId)!;
        const consumeTileIds = meld.tiles.filter(tile => tile.id !== called.id).map(tile => tile.id);
        const expected = engine.forbiddenTypes({ id: 'restore', kind: meld.kind as 'chi' | 'pon', consumeTileIds }, called,
          { ...player, hand: [...player.hand, ...meld.tiles.filter(tile => tile.id !== called.id)] });
        requireCheckpoint(JSON.stringify(expected) === JSON.stringify(engine.forbiddenDiscardTypes));
      } else requireCheckpoint(engine.forbiddenDiscardTypes.length === 0);
      if (phase.kind === 'AFTER_DRAW') requireCheckpoint(engine.player(phase.playerId).drawnTileId !== null);
      engine.refreshActions();
      // Exercise the complete whitelist without publishing anything. Malformed results fail closed.
      projectForViewer(engine.state, { role: 'spectator' });
    } catch { throw new Error('INVALID_HOST_CHECKPOINT'); }
    Object.assign(engine, { host: { ...host, now: resumeClock(host.now, saved.savedAt) } });
    return engine;
  }

  /** Authenticated actor is separate from the untrusted message. Atomic, synchronous commit. */
  dispatch(actorId: string, request: unknown): { ok: true; revision: number } | { ok: false; error: string } {
    if (!this.state.players.some(player => player.id === actorId)) return { ok: false, error: 'UNKNOWN_PLAYER' };
    const check = this.gate.check(actorId, request, { roundId: this.state.roundId, turnId: this.state.turnId,
      ended: this.state.phase.kind === 'ROUND_RESULT' });
    if (check) return { ok: false, error: check };
    const action = request as RoundRequest;
    try {
      this.transaction(now => this.apply(actorId, action, now));
      this.gate.commit(actorId, action.actionId);
      return { ok: true, revision: this.state.revision };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'INVALID_ACTION' }; }
  }

  /** Host scheduler calls tick; clients cannot advance time or draw tiles. */
  localSupplyTypes(): number[] {
    if (!this.host.localSupply) throw new Error('LOCAL_SUPPLY_DISABLED');
    return supplyableTypes(this.state, this.host.localSupply);
  }

  /** Explicit Host-only operation; deliberately absent from dispatch's wire action union. */
  localSupplyDiscard(actorId: string, request: LocalSupplyRequest): { ok: true; revision: number } | { ok: false; error: string } {
    const access = this.host.localSupply;
    if (!access) return { ok: false, error: 'LOCAL_SUPPLY_DISABLED' };
    const check = this.gate.check(actorId, request, { roundId: this.state.roundId, turnId: this.state.turnId,
      ended: this.state.phase.kind === 'ROUND_RESULT' });
    if (check) return { ok: false, error: check };
    try {
      this.transaction(now => {
        const prepared = prepareLocalSupply(this.state, access, actorId, request);
        this.refreshActions();
        const eventStart = this.state.events.length;
        this.discard(this.player(actorId), prepared.tileId, false, now);
        const event = this.state.events.slice(eventStart).find(item => item.type === 'DISCARD');
        if (event) event.data.localSupply = prepared.journal;
      });
      this.gate.commit(actorId, request.actionId);
      return { ok: true, revision: this.state.revision };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'INVALID_SUPPLY' }; }
  }

  /** Host scheduler calls tick; clients cannot advance time or draw tiles. */
  tick(): boolean {
    const now = this.readNow();
    const phase = this.state.phase;
    if (phase.kind === 'WAITING_CALL_RESPONSE' && Object.keys(phase.window.eligible)
      .some(id => !Object.hasOwn(phase.window.responses, id) && now >= callDeadline(phase.window, id))) {
      this.transaction(time => this.finishCalls(time)); return true;
    }
    const clock = this.state.clock;
    if (clock && now >= clock.startedAt + clock.fixedMs + clock.bankMs) {
      this.transaction(time => {
        const player = this.player(clock.playerId);
        const options = this.state.actions[player.id].discardableTileIds;
        const tileId = options.includes(player.drawnTileId ?? -1) ? player.drawnTileId! : options[0];
        if (tileId === undefined) throw new Error('No timeout discard');
        this.discard(player, tileId, false, time, true);
      });
      return true;
    }
    return false;
  }

  private readNow(): number {
    const now = this.host.now();
    if (!Number.isFinite(now) || now < this.lastNow) throw new Error('Invalid Host clock');
    return now;
  }
  private transaction(run: (now: number) => void): void {
    const now = this.readNow();
    const previous = this.state;
    const meta = [this.firstCycleInterrupted, this.pendingRiichi, this.forbiddenDiscardTypes,
      this.pendingKan, this.pendingNuki, this.rinshanPlayerId] as const;
    this.state = structuredClone(previous);
    try { run(now); this.refreshActions(); this.state.revision++; this.lastNow = now; }
    catch (error) {
      this.state = previous;
      [this.firstCycleInterrupted, this.pendingRiichi, this.forbiddenDiscardTypes,
        this.pendingKan, this.pendingNuki, this.rinshanPlayerId] = meta;
      throw error;
    }
  }
  private player(id: string): Player {
    const player = this.state.players.find(item => item.id === id);
    if (!player) throw new Error('UNKNOWN_PLAYER');
    return player;
  }
  private event(type: PrivateEvent['type'], playerId: string | null, now: number, data: PrivateEvent['data'] = {}): void {
    this.state.events.push({ sequenceId: this.state.events.length + 1, timestamp: now, type, playerId, data: structuredClone(data) });
  }
  private startClock(playerId: string, now: number): void {
    this.state.clock = { playerId, startedAt: now, fixedMs: this.state.rules.timer.fixedMs,
      bankMs: this.player(playerId).bankMs, pausedAt: null };
  }
  private stopClock(now: number): void {
    const clock = this.state.clock;
    if (clock) this.player(clock.playerId).bankMs = Math.max(0, clock.bankMs - Math.max(0, now - clock.startedAt - clock.fixedMs));
    this.state.clock = null;
  }
  private winFacts(player: Player, method: 'ron' | 'tsumo', loserId?: string, awardDeposits = false): WinFacts {
    return { method, loserId, awardDeposits,
      source: method === 'ron' && this.state.phase.kind === 'WAITING_CALL_RESPONSE'
        && ['kakan', 'ankan'].includes(this.state.phase.window.trigger) ? 'chankan'
        : method === 'tsumo' && this.rinshanPlayerId === player.id ? 'rinshan'
        : method === 'tsumo' && !this.firstCycleInterrupted && player.river.length === 0
        ? 'first-uninterrupted-draw' : this.state.wall!.live.length === 0 && !this.rinshanPlayerId ? 'last-live' : 'normal' };
  }
  private refreshActions(): void {
    this.state.actions = Object.fromEntries(this.state.players.map(player => [player.id, emptyActions()]));
    const phase = this.state.phase;
    if (phase.kind === 'WAITING_CALL_RESPONSE') {
      for (const [id, options] of Object.entries(phase.window.eligible)) {
        if (Object.hasOwn(phase.window.responses, id)) continue;
        this.state.actions[id].callOptions = structuredClone(options);
        this.state.actions[id].canPass = true;
      }
      return;
    }
    if (phase.kind !== 'AFTER_DRAW' && phase.kind !== 'WAITING_DISCARD') return;
    const player = this.player(phase.playerId);
    const actions = this.state.actions[player.id];
    actions.discardableTileIds = player.hand.filter(tile => !this.forbiddenDiscardTypes.includes(tile.type)
      && (player.riichi === 'none' || tile.id === player.drawnTileId)).map(tile => tile.id);
    if (phase.kind !== 'AFTER_DRAW') return;
    const drawn = player.hand.find(tile => tile.id === player.drawnTileId);
    if (this.canKan()) actions.selfKanOptions = selfKanOptions(player, this.state.rules.players);
    if (this.state.rules.players === 3 && this.state.wall!.live.length > 0) {
      actions.nukiTileIds = player.hand.filter(tile => tile.type === 30
        && (player.riichi === 'none' || tile.id === player.drawnTileId)).map(tile => tile.id);
    }
    actions.canTsumo = Boolean(drawn && evaluateWin(this.state, player.id, drawn, this.winFacts(player, 'tsumo')));
    if (player.riichi === 'none' && player.points >= 1000 && this.state.wall!.live.length >= 4
      && player.melds.every(meld => meld.kind === 'ankan')) {
      actions.riichiDiscardTileIds = actions.discardableTileIds.filter(id =>
        waits({ ...player, hand: player.hand.filter(tile => tile.id !== id) }, this.state.rules.players).length > 0);
    }
    actions.canAbortNineTerminals = this.state.rules.abortiveDraws.nineTerminals && !this.firstCycleInterrupted
      && player.river.length === 0 && new Set(player.hand.filter(tile => tile.type >= 27 || tile.type % 9 === 0 || tile.type % 9 === 8)
        .map(tile => tile.type)).size >= 9;
  }
  private apply(actorId: string, action: RoundIntent, now: number): void {
    const phase = this.state.phase;
    if (action.kind === 'RESPOND') {
      if (phase.kind !== 'WAITING_CALL_RESPONSE' || typeof action.optionId !== 'string') throw new Error('INVALID_PHASE');
      phase.window = respondToCall(phase.window, actorId, action.optionId, now);
      this.spendResponseBank(phase.window, actorId, now);
      this.finishCalls(now);
      return;
    }
    if ((phase.kind !== 'AFTER_DRAW' && phase.kind !== 'WAITING_DISCARD') || phase.playerId !== actorId) throw new Error('NOT_YOUR_TURN');
    const clock = this.state.clock!;
    if (now >= clock.startedAt + clock.fixedMs + clock.bankMs) throw new Error('TURN_EXPIRED');
    const player = this.player(actorId);
    if (action.kind === 'DISCARD' || action.kind === 'RIICHI') {
      if (!Number.isSafeInteger(action.tileId)) throw new Error('INVALID_TILE');
      this.discard(player, action.tileId, action.kind === 'RIICHI', now);
    } else if (action.kind === 'KAN') {
      const option = this.state.actions[actorId].selfKanOptions.find(item => item.id === action.optionId);
      if (!option) throw new Error('ILLEGAL_KAN');
      this.declareKan(player, option, now);
    } else if (action.kind === 'NUKI') {
      if (!Number.isSafeInteger(action.tileId) || !this.state.actions[actorId].nukiTileIds.includes(action.tileId)) {
        throw new Error('ILLEGAL_NUKI');
      }
      this.declareNuki(player, action.tileId, now);
    } else if (action.kind === 'TSUMO') {
      if (!this.state.actions[actorId].canTsumo) throw new Error('NO_LEGAL_WIN');
      const drawn = player.hand.find(tile => tile.id === player.drawnTileId)!;
      this.finishWin([actorId], drawn, 'tsumo', undefined, now);
    } else if (action.kind === 'ABORT_NINE_TERMINALS') {
      if (!this.state.actions[actorId].canAbortNineTerminals) throw new Error('NO_NINE_TERMINALS');
      this.finishDraw('nine-terminals', now);
    } else throw new Error('UNSUPPORTED_ACTION');
  }
  private discard(player: Player, tileId: number, riichi: boolean, now: number, automatic = false): void {
    const actions = this.state.actions[player.id];
    if (!(riichi ? actions.riichiDiscardTileIds : actions.discardableTileIds).includes(tileId)) throw new Error('ILLEGAL_DISCARD');
    this.stopClock(now);
    const tile = player.hand.find(item => item.id === tileId)!;
    const tsumogiri = player.drawnTileId === tileId;
    player.hand = player.hand.filter(item => item.id !== tileId);
    player.drawnTileId = null;
    player.ippatsu = false;
    player.river.push({ tile, turnId: this.state.turnId, riichi, tsumogiri, calledBy: null });
    if (riichi) this.pendingRiichi = player.id;
    this.forbiddenDiscardTypes = [];
    this.event('DISCARD', player.id, now, { tile, tsumogiri, riichi, automatic });
    const window: CallWindow = { id: `call:${this.state.turnId}`, sourcePlayerId: player.id, tile,
      trigger: 'discard', eligible: {}, responses: {}, deadline: now + this.state.rules.timer.responseMs };
    for (const other of this.state.players) {
      if (other.id === player.id) continue;
      const options = this.callOptions(other, player, tile);
      if (options.length) window.eligible[other.id] = options;
    }
    this.state.phase = { kind: 'WAITING_CALL_RESPONSE', window };
    this.startResponseClocks(window, now);
    this.finishCalls(now);
  }
  private forbiddenTypes(option: CallOption, tile: Tile, player: Player): number[] {
    const result = [tile.type];
    if (option.kind === 'chi') {
      const types = option.consumeTileIds.map(id => player.hand.find(item => item.id === id)!.type).sort((a, b) => a - b);
      // No same-tile or opposite-end swap calling (kuikae).
      if (types[1] - types[0] === 1) {
        for (const alternative of [types[0] - 1, types[1] + 1]) {
          if (alternative >= 0 && alternative < 27 && Math.floor(alternative / 9) === Math.floor(tile.type / 9)) result.push(alternative);
        }
      }
    }
    return [...new Set(result)];
  }
  private callOptions(player: Player, source: Player, tile: Tile): CallOption[] {
    const options: CallOption[] = [];
    if (evaluateWin(this.state, player.id, tile, this.winFacts(player, 'ron', source.id))) {
      options.push({ id: 'ron', kind: 'ron', consumeTileIds: [] });
    }
    if (player.riichi !== 'none' || this.state.wall!.live.length === 0 || this.fourKansAbort()) return options;
    const matching = player.hand.filter(item => item.type === tile.type);
    if (this.canKan() && matching.length === 3) options.push({ id: `daiminkan:${matching.map(item => item.id).join(',')}`,
      kind: 'daiminkan', consumeTileIds: matching.map(item => item.id) });
    for (const pair of combinations(player.hand.filter(item => item.type === tile.type), 2)) {
      options.push({ id: `pon:${pair.map(item => item.id).join(',')}`, kind: 'pon', consumeTileIds: pair.map(item => item.id) });
    }
    if (this.state.rules.players === 4 && (source.seat + 1) % 4 === player.seat && tile.type < 27) {
      for (let start = tile.type - 2; start <= tile.type; start++) {
        if (start < 0 || start % 9 > 6 || Math.floor(start / 9) !== Math.floor(tile.type / 9)) continue;
        const needed = [start, start + 1, start + 2].filter(type => type !== tile.type);
        for (const first of player.hand.filter(item => item.type === needed[0])) {
          for (const second of player.hand.filter(item => item.type === needed[1])) {
            options.push({ id: `chi:${first.id},${second.id}`, kind: 'chi', consumeTileIds: [first.id, second.id] });
          }
        }
      }
    }
    return options.filter(option => option.kind === 'ron' || option.kind === 'daiminkan' || player.hand.some(item =>
      !option.consumeTileIds.includes(item.id) && !this.forbiddenTypes(option, tile, player).includes(item.type)));
  }
  private startResponseClocks(window: CallWindow, now: number): void {
    const banks = Object.fromEntries(Object.keys(window.eligible).map(id => [id, this.player(id).bankMs]));
    window.timing = { startedAt: now, fixedMs: this.state.rules.timer.responseMs, banks, respondedAt: {} };
    window.deadline = now + window.timing.fixedMs + Math.max(0, ...Object.values(banks));
  }
  private spendResponseBank(window: CallWindow, id: string, at: number): void {
    if (!window.timing) return; // Preserve the fixed-only semantics of an in-flight legacy save.
    const timing = window.timing;
    this.player(id).bankMs = Math.max(0, timing.banks[id] - Math.max(0, at - timing.startedAt - timing.fixedMs));
  }
  private finishCalls(now: number): void {
    if (this.state.phase.kind !== 'WAITING_CALL_RESPONSE') throw new Error('INVALID_PHASE');
    const window = this.state.phase.window;
    for (const id of Object.keys(window.eligible)) {
      const deadline = callDeadline(window, id);
      if (!Object.hasOwn(window.responses, id) && now >= deadline) {
        window.responses[id] = 'pass';
        if (window.timing) window.timing.respondedAt[id] = deadline;
        this.spendResponseBank(window, id, deadline);
      }
    }
    const result = resolveCalls(window, this.state.players.map(player => player.id), this.state.rules.multiRon, now);
    if (result.kind === 'pending') return;
    if (result.kind === 'ron') { this.pendingRiichi = null; this.finishWin(result.playerIds, window.tile, 'ron', window.sourcePlayerId, now); return; }
    if (result.kind === 'triple-ron-abort') { this.pendingRiichi = null; this.finishDraw('triple-ron', now); return; }
    // Structural completion counts for missed-win furiten even if there was no yaku/prompt.
    for (const player of this.state.players) {
      if (player.id === window.sourcePlayerId || (window.trigger === 'ankan' && !window.eligible[player.id])
        || !waits(player, this.state.rules.players).includes(window.tile.type)) continue;
      if (player.riichi !== 'none') player.furiten.riichi = true;
      else player.furiten.temporary = true;
    }
    if (window.trigger === 'nuki') { this.commitNuki(now); return; }
    if (window.trigger !== 'discard') {
      if (!this.pendingKan) throw new Error('MISSING_PENDING_KAN');
      this.commitSelfKan(now);
      return;
    }
    if (this.pendingRiichi) {
      const player = this.player(this.pendingRiichi);
      player.riichi = !this.firstCycleInterrupted && player.river.length === 1 ? 'double-riichi' : 'riichi';
      player.ippatsu = true; player.points -= 1000; this.state.riichiSticks++;
      this.event('RIICHI', player.id, now, { kind: player.riichi });
      this.pendingRiichi = null;
    }
    if (result.kind === 'meld') {
      if (this.fourKansAbort()) { this.finishDraw('four-kans', now); return; }
      if (result.option.kind === 'ron') throw new Error('INVALID_MELD');
      const player = this.player(result.playerId);
      const source = this.player(window.sourcePlayerId);
      this.forbiddenDiscardTypes = result.option.kind === 'daiminkan' ? [] : this.forbiddenTypes(result.option, window.tile, player);
      const consumed = result.option.consumeTileIds.map(id => player.hand.find(tile => tile.id === id)!);
      player.hand = player.hand.filter(tile => !result.option.consumeTileIds.includes(tile.id));
      player.drawnTileId = null;
      player.melds.push({ id: `meld:${this.state.turnId}`, kind: result.option.kind,
        tiles: [...consumed, window.tile].sort((a, b) => a.type - b.type || a.id - b.id),
        sourcePlayerId: source.id, calledTileId: window.tile.id, addedTileId: null });
      source.river[source.river.length - 1].calledBy = player.id;
      this.firstCycleInterrupted = true;
      for (const item of this.state.players) item.ippatsu = false;
      player.furiten.temporary = false;
      if (result.option.kind === 'daiminkan') {
        this.completeKan(player, player.melds[player.melds.length - 1].id, now);
        return;
      }
      this.state.turnId++;
      this.state.phase = { kind: 'WAITING_DISCARD', playerId: player.id };
      this.startClock(player.id, now);
      this.event(result.option.kind === 'chi' ? 'CHI' : 'PON', player.id, now, { meld: player.melds[player.melds.length - 1] });
      return;
    }
    if (this.fourKansAbort()) { this.finishDraw('four-kans', now); return; }
    if (this.state.rules.players === 4 && this.state.rules.abortiveDraws.fourRiichi
      && this.state.players.every(player => player.riichi !== 'none')) { this.finishDraw('four-riichi', now); return; }
    if (this.state.rules.players === 4 && this.state.rules.abortiveDraws.fourWinds && !this.firstCycleInterrupted
      && this.state.players.every(player => player.river.length === 1)) {
      const first = this.state.players[0].river[0].tile.type;
      if (first >= 27 && first <= 30 && this.state.players.every(player => player.river[0].tile.type === first)) {
        this.finishDraw('four-winds', now); return;
      }
    }
    if (!this.state.wall!.live.length) { this.finishDraw('exhaustive', now); return; }
    const next = this.state.players[(this.player(window.sourcePlayerId).seat + 1) % this.state.players.length];
    const tile = drawLive(this.state.wall!);
    this.rinshanPlayerId = null;
    next.hand.push(tile); next.drawnTileId = tile.id; next.furiten.temporary = false;
    this.state.turnId++;
    this.state.phase = { kind: 'AFTER_DRAW', playerId: next.id };
    this.startClock(next.id, now);
    this.event('DRAW', next.id, now, { tile });
  }
  private canKan(): boolean {
    return this.state.wall!.rinshanUsed < 4 && this.state.wall!.live.length > 0;
  }
  private declareNuki(player: Player, tileId: number, now: number): void {
    this.stopClock(now);
    this.firstCycleInterrupted = true;
    for (const item of this.state.players) item.ippatsu = false;
    const tile = player.hand.find(item => item.id === tileId)!;
    this.pendingNuki = { playerId: player.id, tileId };
    const window: CallWindow = { id: `nuki:${this.state.turnId}`, trigger: 'nuki', sourcePlayerId: player.id,
      tile, eligible: {}, responses: {}, deadline: now + this.state.rules.timer.responseMs };
    this.state.phase = { kind: 'WAITING_CALL_RESPONSE', window };
    for (const other of this.state.players) {
      if (other.id === player.id) continue;
      if (evaluateWin(this.state, other.id, tile, this.winFacts(other, 'ron', player.id))) {
        window.eligible[other.id] = [{ id: 'ron', kind: 'ron', consumeTileIds: [] }];
      }
    }
    this.event('NUKI', player.id, now, { stage: 'declared', tile });
    this.startResponseClocks(window, now);
    this.finishCalls(now);
  }
  private commitNuki(now: number): void {
    if (!this.pendingNuki) throw new Error('MISSING_PENDING_NUKI');
    const { playerId, tileId } = this.pendingNuki;
    const player = this.player(playerId);
    const tile = player.hand.find(item => item.id === tileId);
    if (!tile || tile.type !== 30 || this.state.rules.players !== 3) throw new Error('ILLEGAL_NUKI');
    player.hand = player.hand.filter(item => item.id !== tileId);
    player.nuki.push(tile);
    this.pendingNuki = null;
    this.event('NUKI', player.id, now, { stage: 'completed', tile });
    const replacement = drawNukiReplacement(this.state.wall!);
    player.hand.push(replacement); player.drawnTileId = replacement.id; player.furiten.temporary = false;
    this.rinshanPlayerId = player.id;
    this.state.turnId++;
    this.state.phase = { kind: 'AFTER_DRAW', playerId: player.id };
    this.startClock(player.id, now);
    this.event('DRAW', player.id, now, { tile: replacement, source: 'rinshan', nuki: true });
  }
  private fourKansAbort(): boolean {
    return this.state.rules.abortiveDraws.fourKans && this.state.wall!.rinshanUsed === 4
      && this.state.players.filter(player => player.melds.some(meld => !['chi', 'pon'].includes(meld.kind))).length > 1;
  }
  private declareKan(player: Player, option: SelfKanOption, now: number): void {
    this.stopClock(now);
    this.firstCycleInterrupted = true;
    for (const item of this.state.players) item.ippatsu = false;
    const tile = player.hand.find(item => item.id === (option.tileIds.includes(player.drawnTileId ?? -1)
      ? player.drawnTileId : option.tileIds[0]))!;
    this.pendingKan = { playerId: player.id, option: structuredClone(option) };
    const window: CallWindow = { id: `kan:${this.state.turnId}`, trigger: option.kind, sourcePlayerId: player.id,
      tile, eligible: {}, responses: {}, deadline: now + this.state.rules.timer.responseMs };
    this.state.phase = { kind: 'WAITING_CALL_RESPONSE', window };
    for (const other of this.state.players) {
      if (other.id === player.id) continue;
      const win = evaluateWin(this.state, other.id, tile, this.winFacts(other, 'ron', player.id));
      // Project convention: only kokushi may rob an ankan. Kakan allows all legal ron hands.
      if (win && (option.kind === 'kakan' || win.yaku.some(yaku => yaku === 'kokushi' || yaku === 'kokushi-13'))) {
        window.eligible[other.id] = [{ id: 'ron', kind: 'ron', consumeTileIds: [] }];
      }
    }
    this.event('KAN', player.id, now, { stage: 'declared', option, tile });
    this.startResponseClocks(window, now);
    this.finishCalls(now);
  }
  private commitSelfKan(now: number): void {
    const { playerId, option } = this.pendingKan!;
    const player = this.player(playerId);
    const tiles = player.hand.filter(tile => option.tileIds.includes(tile.id));
    let meld;
    if (option.kind === 'kakan') {
      meld = player.melds.find(item => item.kind === 'pon' && item.tiles[0].type === tiles[0].type)!;
      meld.kind = 'kakan'; meld.tiles.push(tiles[0]); meld.addedTileId = tiles[0].id;
    } else {
      meld = { id: `meld:${this.state.turnId}`, kind: 'ankan' as const, tiles,
        sourcePlayerId: null, calledTileId: null, addedTileId: null };
      player.melds.push(meld);
    }
    player.hand = player.hand.filter(tile => !option.tileIds.includes(tile.id));
    this.pendingKan = null;
    this.completeKan(player, meld.id, now);
  }
  private completeKan(player: Player, meldId: string, now: number): void {
    this.state.phase = { kind: 'KAN_PROCESSING', playerId: player.id, meldId };
    this.event('KAN', player.id, now, { stage: 'completed', meld: player.melds.find(meld => meld.id === meldId) });
    this.state.phase = { kind: 'RINSHAN_DRAW', playerId: player.id, meldId };
    const tile = drawRinshan(this.state.wall!);
    // Explicit project convention: all completed kans reveal before the rinshan action prompt.
    revealKanDora(this.state.wall!);
    this.event('DORA_REVEAL', player.id, now, { indicator: this.state.wall!.dead[2 + 2 * this.state.wall!.indicatorsRevealed] });
    player.hand.push(tile); player.drawnTileId = tile.id; player.furiten.temporary = false;
    this.rinshanPlayerId = player.id;
    this.forbiddenDiscardTypes = [];
    this.state.turnId++;
    this.state.phase = { kind: 'AFTER_DRAW', playerId: player.id };
    this.startClock(player.id, now);
    this.event('DRAW', player.id, now, { tile, source: 'rinshan' });
  }
  private finishWin(ids: string[], tile: Tile, method: 'ron' | 'tsumo', loserId: string | undefined, now: number): void {
    this.stopClock(now);
    const wins = ids.map((id, index) => evaluateWin(this.state, id, tile,
      this.winFacts(this.player(id), method, loserId, index === 0)));
    if (wins.some(win => !win)) throw new Error('NO_LEGAL_WIN');
    const deltas = Object.fromEntries(this.state.players.map(player => [player.id, 0]));
    for (const win of wins) {
      deltas[win!.playerId] += win!.winnerGain;
      for (const [id, amount] of Object.entries(win!.payments)) deltas[id] -= amount;
      this.event(method === 'ron' ? 'RON' : 'TSUMO', win!.playerId, now, { win });
    }
    this.state.riichiSticks = 0;
    this.finishResult({ reason: method, wins: wins.map(win => win!), tenpaiPlayerIds: [], deltas }, now);
  }
  private finishDraw(reason: Exclude<RoundResult['reason'], 'ron' | 'tsumo'>, now: number): void {
    this.stopClock(now);
    const tenpai = reason === 'exhaustive' ? this.state.players.filter(player => waits(player, this.state.rules.players).length > 0) : [];
    const nagashi = reason === 'exhaustive' ? nagashiPlayerIds(this.state) : [];
    if (nagashi.length) reason = 'nagashi';
    const deltas = Object.fromEntries(this.state.players.map(player => [player.id, 0]));
    if (nagashi.length) {
      for (const id of nagashi) {
        const score = nagashiSettlement(this.state, id);
        deltas[id] += score.winnerGain;
        for (const [payer, amount] of Object.entries(score.payments)) deltas[payer] -= amount;
      }
    } else if (tenpai.length > 0 && tenpai.length < this.state.players.length) {
      for (const player of this.state.players) deltas[player.id] = tenpai.includes(player)
        ? 3000 / tenpai.length : -3000 / (this.state.players.length - tenpai.length);
    }
    this.event('DRAW_GAME', null, now, { reason, tenpaiPlayerIds: tenpai.map(player => player.id), nagashiPlayerIds: nagashi });
    this.finishResult({ reason, wins: [], tenpaiPlayerIds: tenpai.map(player => player.id), nagashiPlayerIds: nagashi, deltas }, now);
  }
  private finishResult(result: RoundResult, now: number): void {
    this.pendingKan = null;
    this.pendingNuki = null;
    this.state.result = result;
    for (const player of this.state.players) player.points += result.deltas[player.id];
    this.state.phase = { kind: 'ROUND_RESULT' };
    this.event('SCORE_CHANGE', null, now, { deltas: result.deltas });
    this.event('ROUND_END', null, now, { result });
  }
}
