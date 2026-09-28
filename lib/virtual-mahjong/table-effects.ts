import type { PlayerVisibleGameState } from './projection';
export type TableEffect = { kind: 'deal' | 'draw' | 'discard' | 'chi' | 'pon' | 'kan' | 'nuki' | 'dora' | 'riichi'; playerId?: string; tileId?: number };
export function isNewDeal(before: PlayerVisibleGameState, after: PlayerVisibleGameState) {
  return before.gameId === after.gameId && before.viewerId === after.viewerId && before.roundId !== after.roundId
    && !!before.result && !after.result && after.players.every(p => !p.river.length && !p.melds.length);
}
/** Derive only changes actually observed live, never missing history or hidden identities. */
export function tableEffects(before: PlayerVisibleGameState | null, after: PlayerVisibleGameState): TableEffect[] {
  if (!before || before.gameId !== after.gameId || before.viewerId !== after.viewerId || after.result) return [];
  if (isNewDeal(before, after)) return [{ kind: 'deal' }];
  if (before.roundId !== after.roundId || before.result || after.revision !== before.revision + 1) return [];
  const effects: TableEffect[] = [];
  for (const p of after.players) {
    const old = before.players.find(v => v.id === p.id); if (!old) continue;
    if (p.handCount > old.handCount) effects.push({ kind: 'draw', playerId: p.id });
    for (const tile of p.nuki) if (!old.nuki.some(t => t.id === tile.id)) effects.push({ kind: 'nuki', playerId: p.id, tileId: tile.id });
    for (const discard of p.river) if (!old.river.some(d => d.tile.id === discard.tile.id)) effects.push({ kind: 'discard', playerId: p.id, tileId: discard.tile.id });
    for (const meld of p.melds) if (!old.melds.some(m => m.id === meld.id && m.kind === meld.kind)) effects.push({ kind: meld.kind === 'chi' || meld.kind === 'pon' ? meld.kind : 'kan', playerId: p.id });
    if (old.riichi === 'none' && p.riichi !== 'none') effects.push({ kind: 'riichi', playerId: p.id });
  }
  for (const tile of after.doraIndicators) if (!before.doraIndicators.some(t => t.id === tile.id)) effects.push({ kind: 'dora', tileId: tile.id });
  return effects;
}
