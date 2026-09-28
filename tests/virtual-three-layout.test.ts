import assert from 'node:assert/strict';
import { layoutTable, seatPoint } from '../app/components/virtual-mahjong/three/table-layout';
import { denseTableLayout, extendedTableLayout } from './helpers/virtual-table-layout';
import { createTiles } from '../lib/virtual-mahjong/tiles';
import { createTableScenario } from './helpers/virtual-table-scenarios';
const selection = { selected: null, legal: [] as number[], riichi: false, highlight: null };
const view = denseTableLayout();
const tiles = layoutTable(view, selection);
assert.equal(new Set(tiles.map(t => t.key)).size, tiles.length);
assert.equal(tiles.filter(t => t.key.startsWith('river:')).length, 72);
for (const player of view.players.filter(p => p.id !== view.viewerId)) {
  const backs = tiles.filter(t => t.key.startsWith(`back:${player.id}:`));
  assert.equal(backs.length, player.handCount);
  assert.ok(backs.every(t => t.tileId === undefined && t.face === undefined && !t.enabled));
}
const bounds = (t: typeof tiles[number]) => {
  const width = (t.sideways ? 1.4 : 1) * (t.scale ?? 1);
  const depth = (t.sideways ? 1 : 1.4) * (t.scale ?? 1);
  const swap = Math.abs(Math.sin(t.yaw)) > .5;
  return { x: t.x, z: t.z, w: swap ? depth : width, d: swap ? width : depth };
};
for (const length of [18, 19, 21, 22, 24, 27]) {
  const fixture = structuredClone(view);
  for (const [seat, p] of fixture.players.entries()) p.river = Array.from({length}, (_,i) => ({ ...p.river[i % p.river.length], tile: { ...p.river[i % p.river.length].tile, id:1000+seat*100+i }, calledBy:null, riichi:i===4 }));
  const rows = layoutTable(fixture, selection).filter(t=>t.key.startsWith('river:'));
  assert.equal(rows.length, length*4);
  const mine = rows.filter(t => t.key.startsWith(`river:${view.viewerId}:`));
  assert.ok(mine.every(t => t.scale === 1.28));
  if (length > 18) { assert.equal(mine[18].z, mine[0].z); assert.ok(mine[18].x > mine[5].x + 1); }
  if (length > 21) { assert.equal(mine[21].x, mine[18].x); assert.ok(mine[21].z > mine[18].z); }
  if (length > 24) { assert.equal(mine[24].x, mine[18].x); assert.equal(mine[24].z, mine[12].z); }
  for (let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
    const a=bounds(rows[i]), b=bounds(rows[j]);
    assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2-.001 || Math.abs(a.z-b.z)>=(a.d+b.d)/2-.001, `river overlap ${length}: ${rows[i].key} / ${rows[j].key}`);
  }
}
const riichi=createTableScenario('riichi').view();
const own=riichi.players.find(p=>p.id===riichi.viewerId)!;
const layouts=layoutTable(riichi,{...selection,legal:riichi.availableActions.discardableTileIds});
assert.equal(layouts.filter(t=>t.enabled).length,0);
assert.ok(layouts.every(t=>!own.hand!.some(tile=>tile.id===t.tileId)));
assert.deepEqual(seatPoint(2,3,0),{x:2,z:3,yaw:0});
assert.ok(seatPoint(0,10,1).x > 9);
assert.ok(seatPoint(0,10,3).x < -9);
// Four extracted Norths must stay separate from dense rivers, hands and four melds.
for (const kind of ['long', 'multi', 'sanma'] as const) {
  const fixture = extendedTableLayout(kind);
  const norths = createTiles(3, false).filter(t => t.type === 30);
  assert.equal(norths.length, 4);
  for (const player of fixture.players) {
    player.nuki = norths;
    const full = layoutTable(fixture, selection);
    const extracted = full.filter(t => t.key.startsWith(`nuki:${player.id}:`));
    assert.equal(extracted.length, 4);
    assert.ok(extracted.every(t => t.flat && t.face?.column === 3 && t.face.row === 3 && !t.enabled && t.motion === 'nuki'));
    for (const north of extracted) for (const other of full.filter(t => t.key !== north.key)) {
      const a = bounds(north), b = bounds(other);
      assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2-.001 || Math.abs(a.z-b.z)>=(a.d+b.d)/2-.001, `North overlap: ${north.key} / ${other.key}`);
    }
    player.nuki = norths.slice(0, 1);
    assert.deepEqual(layoutTable(fixture, selection).find(t => t.key === extracted[0].key), extracted[0]);
    assert.ok(layoutTable(fixture, selection, true).filter(t => t.key.startsWith('nuki:')).every(t => !t.motion));
    player.nuki = [];
  }
}
// Actual dora and red fives receive the face overlay in rivers and open melds;
// the indicator and concealed backs never do.
const doraFixture = extendedTableLayout('multi');
doraFixture.doraIndicators = [{ id: 9999, type: 6, red: false }]; // 7m indicates 8m
const doraPlayer = doraFixture.players[0];
doraPlayer.river[0].tile = { id: 9001, type: 7, red: false };
doraPlayer.river[1].tile = { id: 9002, type: 4, red: true };
doraPlayer.melds[0].tiles[0] = { id: 9003, type: 7, red: false };
doraPlayer.melds[0].calledTileId = 9003;
const doraLayout = layoutTable(doraFixture, selection);
assert.equal(doraLayout.find(t => t.key === `river:${doraPlayer.id}:9001`)?.dora, true);
assert.equal(doraLayout.find(t => t.key === `river:${doraPlayer.id}:9002`)?.dora, true);
assert.equal(doraLayout.find(t => t.key === `meld:${doraPlayer.melds[0].id}:9003`)?.dora, true);
assert.ok(doraLayout.filter(t => t.key.startsWith('back:')).every(t => !t.dora && !t.face));
console.log('PASS 3D layout: anonymous backs, called discard removal, stable keys, 18 + right-side 3-column extension without world overlap, legal picking and hand anchor');
