import { createTableScenario } from './virtual-table-scenarios';
import { createTiles } from '../../lib/virtual-mahjong/tiles';
/** Synthetic rendering fixture only; never submitted to the game engine or shipped in APKs. */
export function denseTableLayout() {
  const scenario = createTableScenario('chi');
  scenario.act({ kind: 'RESPOND', optionId: scenario.view().availableActions.callOptions.find(option => option.kind === 'chi')!.id });
  const view = scenario.view();
  const tiles = createTiles(4, true);
  view.players.forEach((player, seat) => {
    player.river = Array.from({ length: 19 }, (_, i) => ({ tile: tiles[(seat * 24 + i) % tiles.length], turnId: i, riichi: i === 4, tsumogiri: i % 2 === 0, calledBy: i === 8 ? view.viewerId : null }));
    if (player.id !== view.viewerId) {
      player.melds = [{ id: `layout-${seat}`, kind: 'ankan', tiles: tiles.slice(seat * 4, seat * 4 + 4), sourcePlayerId: null, calledTileId: null, addedTileId: null }];
      player.handCount = 10;
    }
  });
  view.phase.playerId = view.players.find(player => player.id !== view.viewerId)!.id;
  return view;
}

/** Synthetic visual stress only: never dispatched to an engine. */
export function extendedTableLayout(kind: 'long' | 'multi' | 'sanma') {
  const view = denseTableLayout();
  const pool = createTiles(4, true);
  if (kind === 'sanma') {
    view.players = view.players.slice(0, 3); view.rules.players = 3;
  }
  for (const [seat, player] of view.players.entries()) {
    player.river = Array.from({ length: kind === 'long' ? 27 : 24 }, (_, index) => ({
      tile: { ...pool[index % pool.length], id: 1000 + seat * 100 + index }, turnId: index,
      riichi: index === 4, tsumogiri: false, calledBy: null,
    }));
    if (kind !== 'multi') continue;
    player.melds = (['chi', 'pon', 'ankan', 'kakan'] as const).map((type, i) => {
      const tiles = pool.slice(i * 4, i * 4 + (type === 'chi' || type === 'pon' ? 3 : 4)).map((tile, n) => ({ ...tile, id: 2000 + seat * 100 + i * 4 + n }));
      return { id: `stress-${seat}-${i}`, kind: type, tiles, sourcePlayerId: type === 'ankan' ? null : view.players[(seat + i + 1) % view.players.length].id,
        calledTileId: type === 'ankan' ? null : tiles[0].id, addedTileId: type === 'kakan' ? tiles[3].id : null };
    });
    player.handCount = 2;
    if (player.hand) { player.hand = player.hand.slice(0, 2); player.drawnTileId = null; }
  }
  return view;
}
