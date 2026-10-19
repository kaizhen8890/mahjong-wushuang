import { LocalGameClock } from './local-clock';
import { MahjongMatchEngine } from './match-engine';
import type { HostDependencies, RoundIntent } from './round-engine';
import { localRules, type LocalSettings } from './local-settings';
import { simpleBotIntent } from './simple-bot';
import { tileTypes } from './tiles';
import { createWall } from './wall';
import { prepareZenithWall } from './local-zenith-hand';

export const LOCAL_HUMAN_ID = 'a';
export interface SupplyDirective { type: number; target: string }
export interface LocalControlState {
  mode: LocalSettings['botMode']; paused: boolean; supply: SupplyDirective | null;
  keepTypes: number[]; availableTypes: number[]; error: string;
}
type Outcome = { ok: true } | { ok: false; error: string };
const messages: Record<string, string> = {
  SUPPLY_TILE_UNAVAILABLE: '这张牌当前已无可供出的实体牌，请重新指定。',
  ALL_SUPPLY_TILES_KEPT: '当前可供出的牌均被保留，请取消部分保留。',
  LOCAL_PAUSED: '对局已暂停。',
  INVALID_SUPPLY_TILE: '请选择当前牌局存在的牌。',
  INVALID_SUPPLY_TARGET: '请选择当前的人机席位。',
};

/** Local orchestration only. React receives view()/controls(), never the Host engine. */
export class LocalVirtualSession {
  readonly clock: LocalGameClock;
  readonly settings: LocalSettings;
  readonly botIds: string[];
  private readonly engine: MahjongMatchEngine;
  private sequence = 0;
  private directiveRevision = 0;
  private pending: { key: string; due: number; actor: string } | null = null;
  private supply: SupplyDirective | null = null;
  private keepTypes: number[] = [];
  private error = '';
  constructor(settings: LocalSettings, host: Partial<HostDependencies> = {}, gameId = crypto.randomUUID()) {
    this.settings = { ...settings };
    this.clock = new LocalGameClock(host.now);
    const ids = ['a', 'b', 'c', 'd'].slice(0, settings.players);
    this.botIds = ids.slice(1);
    const names = settings.players === 3 ? ['我', '下家', '上家'] : ['我', '下家', '对家', '上家'];
    const makeWall: HostDependencies['makeWall'] = settings.zenithHand
      ? (rules, context) => prepareZenithWall(host.makeWall?.(rules, context)
        ?? createWall(rules.players, rules.redFives, host.random), rules, 0, context.dealerSeat, host.random)
      : host.makeWall;
    this.engine = new MahjongMatchEngine({ gameId, rules: localRules(settings), dealerSeat: 0,
      players: ids.map((id, i) => ({ id, name: names[i] })) }, { ...host, makeWall, now: this.clock.now,
      localSupply: settings.botMode === 'cooperative' ? { humanPlayerId: LOCAL_HUMAN_ID, botIds: this.botIds } : undefined });
  }
  view() { return this.engine.view({ role: 'player', playerId: LOCAL_HUMAN_ID }); }
  controls(): LocalControlState {
    return { mode: this.settings.botMode, paused: this.clock.paused, supply: this.supply ? { ...this.supply } : null,
      keepTypes: [...this.keepTypes], availableTypes: this.settings.botMode === 'cooperative' ? this.engine.localSupplyTypes() : [],
      error: this.error };
  }
  /** Test/debug on the Host only, never use as UI props or a transport payload. */
  hostSnapshot() { return this.engine.hostSnapshot(); }
  pause(reason: string) { this.clock.pause(reason); }
  resume(reason: string) { this.clock.resume(reason); }
  private envelope() {
    const view = this.view();
    return { gameId: view.gameId, roundId: view.roundId, turnId: view.turnId, actionId: 'local:' + (++this.sequence) };
  }
  private changedControls() {
    this.directiveRevision++; this.pending = null; this.error = ''; this.clock.resume('supply-conflict');
  }
  requestSupply(type: number, target = 'next'): Outcome {
    if (this.settings.botMode !== 'cooperative') return { ok: false, error: 'LOCAL_SUPPLY_DISABLED' };
    if (target !== 'next' && !this.botIds.includes(target)) return { ok: false, error: 'INVALID_SUPPLY_TARGET' };
    if (!tileTypes(this.settings.players).includes(type)) return { ok: false, error: 'INVALID_SUPPLY_TILE' };
    if (!this.engine.localSupplyTypes().includes(type)) return { ok: false, error: 'SUPPLY_TILE_UNAVAILABLE' };
    this.supply = { type, target }; this.keepTypes = this.keepTypes.filter(item => item !== type);
    this.changedControls(); return { ok: true };
  }
  cancelSupply() { this.supply = null; this.changedControls(); }
  setKeepTypes(input: readonly number[]): Outcome {
    if (this.settings.botMode !== 'cooperative') return { ok: false, error: 'LOCAL_SUPPLY_DISABLED' };
    const types = [...new Set(input)].sort((a, b) => a - b);
    if (types.some(type => !tileTypes(this.settings.players).includes(type))) return { ok: false, error: 'INVALID_SUPPLY_TILE' };
    const available = this.engine.localSupplyTypes();
    if (available.length && available.every(type => types.includes(type))) return { ok: false, error: 'ALL_SUPPLY_TILES_KEPT' };
    this.keepTypes = types;
    if (this.supply && types.includes(this.supply.type)) this.supply = null;
    this.changedControls(); return { ok: true };
  }
  clearControls() { this.supply = null; this.keepTypes = []; this.changedControls(); }
  send(intent: RoundIntent): Outcome {
    if (this.clock.paused) return { ok: false, error: 'LOCAL_PAUSED' };
    const response = this.engine.dispatch(LOCAL_HUMAN_ID, { ...intent, ...this.envelope() });
    if (!response.ok) this.error = '操作状态已更新，请重新选择。';
    else this.error = '';
    return response;
  }
  advance(): Outcome {
    if (this.clock.paused) return { ok: false, error: 'LOCAL_PAUSED' };
    const view = this.view();
    const response = this.engine.advanceRound({ gameId: view.gameId, roundId: view.roundId });
    if (response.ok) this.clearControls();
    else this.error = '暂时无法进入下一局，请重试。';
    return response;
  }
  tick(): boolean {
    if (this.clock.paused) return false;
    const view = this.view();
    if (view.result || view.matchResult) { this.pending = null; return false; }
    const cooperativeBotTurn = this.settings.botMode === 'cooperative'
      && Boolean(view.phase.playerId && this.botIds.includes(view.phase.playerId));
    // Resolve expired human/normal-bot clocks and response windows before preparing
    // an action. A long background interval must not submit an already-expired move.
    if (!cooperativeBotTurn && this.engine.tick()) { this.pending = null; return true; }
    let actor: string | undefined;
    if (view.phase.kind === 'WAITING_CALL_RESPONSE') {
      actor = this.botIds.find(id => this.engine.view({ role: 'player', playerId: id }).availableActions.canPass);
    } else if (view.phase.playerId && this.botIds.includes(view.phase.playerId)) actor = view.phase.playerId;
    if (actor) {
      const key = [view.gameId, view.roundId, view.turnId, view.phase.kind, actor, this.directiveRevision].join(':');
      if (this.pending?.key !== key) this.pending = { key, actor, due: this.clock.now() + 700 };
      else if (this.clock.now() >= this.pending.due) {
        this.pending = null;
        const botView = this.engine.view({ role: 'player', playerId: actor });
        const envelope = this.envelope();
        const cooperative = this.settings.botMode === 'cooperative';
        let response: Outcome;
        let usesSupply = false;
        if (cooperative && !botView.availableActions.canPass) {
          usesSupply = Boolean(this.supply && (this.supply.target === 'next' || this.supply.target === actor));
          // Other seats must not accidentally consume the last copy of a pending supply.
          const keep = usesSupply || !this.supply ? this.keepTypes : [...this.keepTypes, this.supply.type];
          response = this.engine.localSupplyDiscard(actor, { ...envelope, keepTypes: keep,
            ...(usesSupply ? { tileType: this.supply!.type } : {}) });
        } else {
          const intent = cooperative ? { kind: 'RESPOND' as const, optionId: 'pass' } : simpleBotIntent(botView);
          response = intent ? this.engine.dispatch(actor, { ...intent, ...envelope }) : { ok: false, error: 'NO_BOT_ACTION' };
        }
        if (!response.ok) {
          this.error = messages[response.error] ?? '人机操作未完成，请调整供牌设置后继续。';
          if (cooperative) this.clock.pause('supply-conflict');
          return true;
        }
        if (usesSupply) this.supply = null;
        this.error = '';
        return true;
      }
    } else this.pending = null;
    // Cooperative bot turns must never bypass keep instructions through timeout tsumogiri.
    return false;
  }
}

export function localControlMessage(error: string): string { return messages[error] ?? '设置未生效，请重新选择。'; }
