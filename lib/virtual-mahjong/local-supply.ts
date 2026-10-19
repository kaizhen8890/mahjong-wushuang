import type { AuthoritativeGameState } from './model';
import { tileTypes, type Tile } from './tiles';

/** Explicit Host capability. Never create this from room options or wire messages. */
export interface LocalSupplyAccess { humanPlayerId: string; botIds: string[] }
export interface LocalSupplyRequest {
  gameId: string; roundId: string; turnId: number; actionId: string;
  tileType?: number; keepTypes: number[];
}

export function validateLocalAccess(access: LocalSupplyAccess, ids: readonly string[]): void {
  if (!access || !ids.includes(access.humanPlayerId) || !Array.isArray(access.botIds)
    || access.botIds.length !== ids.length - 1 || new Set(access.botIds).size !== access.botIds.length
    || access.botIds.some(id => id === access.humanPlayerId || !ids.includes(id))) throw new Error('INVALID_LOCAL_ACCESS');
}

interface Slot { tiles: Tile[]; index: number; playerId: string | null; source: string }
/** Hidden tile locations stay entirely inside the Host. */
function slots(state: AuthoritativeGameState, access: LocalSupplyAccess, actorId?: string): Slot[] {
  const result: Slot[] = [];
  const addHand = (id: string) => {
    const player = state.players.find(item => item.id === id)!;
    // Cooperative seats never declare riichi. Do not disturb a committed riichi hand.
    if (player.riichi !== 'none') return;
    player.hand.forEach((_, index) => result.push({ tiles: player.hand, index, playerId: id, source: 'hand' }));
  };
  if (actorId) addHand(actorId);
  state.wall?.live.forEach((_, index) => result.push({ tiles: state.wall!.live, index, playerId: null, source: 'live' }));
  for (const id of access.botIds) if (id !== actorId) addHand(id);
  state.wall?.dead.forEach((_, index) => {
    const publicIndicator = index >= 4 && index % 2 === 0 && (index - 4) / 2 < state.wall!.indicatorsRevealed;
    if (!publicIndicator) result.push({ tiles: state.wall!.dead, index, playerId: null, source: 'dead' });
  });
  return result;
}

export function supplyableTypes(state: AuthoritativeGameState, access: LocalSupplyAccess): number[] {
  return [...new Set(slots(state, access).map(slot => slot.tiles[slot.index].type))].sort((a, b) => a - b);
}

/** Mutates a transaction's private clone only. The caller must discard atomically. */
export function prepareLocalSupply(state: AuthoritativeGameState, access: LocalSupplyAccess,
  actorId: string, request: LocalSupplyRequest): { tileId: number; journal: Record<string, unknown> } {
  if (!access.botIds.includes(actorId) || !['AFTER_DRAW', 'WAITING_DISCARD'].includes(state.phase.kind)
    || !('playerId' in state.phase) || state.phase.playerId !== actorId) throw new Error('INVALID_SUPPLY_TURN');
  const actor = state.players.find(player => player.id === actorId)!;
  if (actor.riichi !== 'none') throw new Error('SUPPLY_AFTER_RIICHI');
  const allowed = tileTypes(state.rules.players);
  if (!Array.isArray(request.keepTypes) || request.keepTypes.some(type => !Number.isInteger(type) || !allowed.includes(type))
    || (request.tileType !== undefined && (!Number.isInteger(request.tileType) || !allowed.includes(request.tileType)))) {
    throw new Error('INVALID_SUPPLY_TILE');
  }
  const legal = state.actions[actorId].discardableTileIds;
  if (!legal.length) throw new Error('NO_SUPPLY_DISCARD');
  const keep = new Set(request.keepTypes);
  const candidates = slots(state, access, actorId).filter(slot => {
    const tile = slot.tiles[slot.index];
    return (request.tileType === undefined ? !keep.has(tile.type) : tile.type === request.tileType)
      && (slot.playerId !== actorId || legal.includes(tile.id));
  });
  if (request.tileType !== undefined) candidates.sort((a, b) => Number(b.tiles[b.index].red) - Number(a.tiles[a.index].red));
  else {
    // Preserve the familiar draw/discard rhythm in the absence of instructions.
    candidates.sort((a, b) => Number(b.tiles[b.index].id === actor.drawnTileId) - Number(a.tiles[a.index].id === actor.drawnTileId));
  }
  const source = candidates[0];
  if (!source) throw new Error(request.tileType === undefined ? 'ALL_SUPPLY_TILES_KEPT' : 'SUPPLY_TILE_UNAVAILABLE');
  const supplied = source.tiles[source.index];
  const journal: Record<string, unknown> = { type: supplied.type, suppliedTileId: supplied.id, source: source.source,
    sourcePlayerId: source.playerId, swapped: source.playerId !== actorId };
  if (source.playerId !== actorId) {
    const replacementId = legal.includes(actor.drawnTileId ?? -1) ? actor.drawnTileId! : legal[0];
    const index = actor.hand.findIndex(tile => tile.id === replacementId);
    const displaced = actor.hand[index];
    source.tiles[source.index] = displaced;
    actor.hand[index] = supplied;
    if (actor.drawnTileId === displaced.id) actor.drawnTileId = supplied.id;
    if (source.playerId) {
      const donor = state.players.find(player => player.id === source.playerId)!;
      if (donor.drawnTileId === supplied.id) donor.drawnTileId = displaced.id;
    }
    journal.displacedTileId = displaced.id;
  }
  return { tileId: supplied.id, journal };
}
