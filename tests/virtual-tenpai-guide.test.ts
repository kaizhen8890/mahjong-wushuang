import assert from 'node:assert/strict';
import { extendedTableLayout } from './helpers/virtual-table-layout';
import { remainingTileCounts, tenpaiGuide } from '../lib/virtual-mahjong/tenpai-guide';
import type { PlayerVisibleGameState } from '../lib/virtual-mahjong/projection';
import { createTableScenario } from './helpers/virtual-table-scenarios';

/** Independently lists every tile the viewer may legally read. */
function visibleIds(view: PlayerVisibleGameState): number[] {
  const ids: number[] = [];
  const own = view.players.find(player => player.id === view.viewerId);
  for (const tile of own?.hand ?? []) ids.push(tile.id);
  for (const player of view.players) {
    for (const discard of player.river) ids.push(discard.tile.id);
    for (const meld of player.melds) for (const tile of meld.tiles) ids.push(tile.id);
    for (const tile of player.nuki) ids.push(tile.id);
  }
  for (const tile of view.doraIndicators) ids.push(tile.id);
  if (view.phase.call) ids.push(view.phase.call.tile.id);
  return ids;
}

// A 14-tile hand previews discarding the drawn tile, and a selected tile replaces that preview.
const drawScene = createTableScenario('riichi', '123456789m123p4s5s');
const drawView = drawScene.view();
const drawOwn = drawView.players.find(player => player.id === drawView.viewerId)!;
assert.equal(drawOwn.hand!.length, 14);
const drawnType = drawOwn.hand!.find(tile => tile.id === drawOwn.drawnTileId)!.type;
assert.equal(drawnType, 22, 'fixture keep 5s drawn');
const tsumogiri = tenpaiGuide(drawView);
assert.equal(tsumogiri.tenpai, true);
assert.equal(tsumogiri.discardTileId, drawOwn.drawnTileId);
assert.equal(tsumogiri.discardType, 22);
assert.deepEqual(tsumogiri.waits, [{ type: 21, remaining: 3 }]);
const keptFive = tenpaiGuide(drawView, drawOwn.hand!.find(tile => tile.type === 21)!.id);
assert.equal(keptFive.discardType, 21);
assert.deepEqual(keptFive.waits, [{ type: 22, remaining: 3 }]);
assert.equal(tenpaiGuide(drawView, 999_999).discardTileId, drawOwn.drawnTileId, 'unknown selection falls back to tsumogiri');
assert.ok(drawOwn.hand!.some(tile => !tenpaiGuide(drawView, tile.id).tenpai), 'the preview must be able to lose tenpai');

// A 13-tile hand is searched directly, and hidden opponent hands never reduce the unseen count.
const directScene = createTableScenario('riichi', '123456789m123p5s1z');
const directStart = directScene.view();
directScene.act({ kind: 'DISCARD', tileId: directStart.players.find(player => player.id === directStart.viewerId)!.drawnTileId! });
const directView = directScene.view();
const directOwn = directView.players.find(player => player.id === directView.viewerId)!;
assert.equal(directOwn.hand!.length, 13);
const direct = tenpaiGuide(directView);
assert.equal(direct.discardTileId, null);
assert.equal(direct.discardType, null);
assert.deepEqual(direct.waits, [{ type: 22, remaining: 3 }]);
assert.ok(directView.players.filter(player => player.id !== directView.viewerId).every(player => player.hand === undefined));
assert.equal(remainingTileCounts(directView).reduce((sum, count) => sum + count, 0), 136 - new Set(visibleIds(directView)).size);
assert.equal(new Set(visibleIds(directView)).size, 15, 'own hand, one river tile and one revealed indicator');

// A public discard removes a copy, and the same physical tile in a meld is not removed twice.
const shared = structuredClone(directView);
const other = shared.players.find(player => player.id !== shared.viewerId)!;
other.river.push({ tile: { id: 9000, type: 22, red: false }, turnId: 99, riichi: false, tsumogiri: false, calledBy: 'b' });
assert.equal(remainingTileCounts(shared)[22], 2);
other.melds.push({ id: 'called', kind: 'chi', tiles: [{ id: 9000, type: 22, red: false }], sourcePlayerId: null, calledTileId: null, addedTileId: null });
assert.equal(remainingTileCounts(shared)[22], 2, 'one physical tile ID counts once');

// A concealed kan counts as one meld and removes a wait search that needs its fourth copy.
const kanScene = createTableScenario('ankan');
const kanStart = kanScene.view();
kanScene.act({ kind: 'KAN', optionId: kanStart.availableActions.selfKanOptions[0].id });
const kanView = kanScene.view();
const kanOwn = kanView.players.find(player => player.id === kanView.viewerId)!;
assert.equal(kanOwn.melds.length, 1);
const kanGuide = tenpaiGuide(kanView);
assert.equal(kanGuide.meldCount, 1);
assert.equal(kanGuide.discardTileId, kanOwn.drawnTileId);
assert.deepEqual(kanGuide.waits, [{ type: 31, remaining: 1 }]);
assert.equal(remainingTileCounts(kanView)[0], 0, 'own ankan holds all four 1m');

// Sanma uses the engine tile set: man 2-8 are absent and nuki tiles are public.
const nukiScene = createTableScenario('nuki');
const nukiStart = nukiScene.view();
assert.equal(nukiStart.rules.players, 3);
assert.equal(remainingTileCounts(nukiStart)[1], 0, '2m is outside the sanma tile set');
assert.equal(remainingTileCounts(nukiStart).reduce((sum, count) => sum + count, 0), 108 - new Set(visibleIds(nukiStart)).size);
for (let index = 0; index < 4; index++) nukiScene.act({ kind: 'NUKI', tileId: nukiScene.view().availableActions.nukiTileIds[0] });
const nukiView = nukiScene.view();
assert.equal(nukiView.players.find(player => player.id === nukiView.viewerId)!.nuki.length, 4);
assert.equal(remainingTileCounts(nukiView).reduce((sum, count) => sum + count, 0), 108 - new Set(visibleIds(nukiView)).size);

// Thirteen orphans is a structural wait on every orphan type.
const kokushi = createTableScenario('riichi', '19m19p19s1234567z2m').view();
assert.deepEqual(tenpaiGuide(kokushi).waits.map(wait => wait.type), [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

// No structural wait and no own hand: the guide reports no wait, and a spectator snapshot has no hand at all.
const notReady = createTableScenario('riichi', '147m147p147s12345z');
const notReadyView = notReady.view();
const notReadyOwn = notReadyView.players.find(player => player.id === notReadyView.viewerId)!;
const notReadyGuide = tenpaiGuide(notReadyView);
assert.equal(notReadyGuide.tenpai, false);
assert.deepEqual(notReadyGuide.waits, []);
assert.equal(notReadyGuide.discardTileId, notReadyOwn.drawnTileId);
assert.deepEqual(tenpaiGuide(notReady.engine.view({ role: 'spectator' })), { tenpai: false, meldCount: 0, discardTileId: null, discardType: null, waits: [] });
assert.doesNotThrow(() => tenpaiGuide(extendedTableLayout('multi')));
console.log('PASS tenpai guide: tsumogiri/selected previews, 13-tile search, public-only remaining counts, ankan and sanma tile sets');
