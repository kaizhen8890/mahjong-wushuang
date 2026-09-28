import assert from 'node:assert/strict';
import { emptyActions } from '../lib/virtual-mahjong/model';
import { automaticIntent, DEFAULT_TABLE_ASSISTS, displayHandOrder, moveHandTile } from '../app/components/virtual-mahjong/table-assists';
import type { Tile } from '../lib/virtual-mahjong/tiles';

const tiles: Tile[] = [1, 2, 3, 4].map(id => ({ id, type: id, red: false }));
const order = moveHandTile(tiles.map(tile => tile.id), 1, 4, true);
assert.deepEqual(order, [2, 3, 4, 1]);
assert.deepEqual(displayHandOrder(tiles, order, false).map(tile => tile.id), order);
assert.deepEqual(displayHandOrder([...tiles.slice(1), { id: 5, type: 5, red: false }], order, false).map(tile => tile.id), [2, 3, 4, 5]);
assert.deepEqual(displayHandOrder(tiles, order, true).map(tile => tile.id), [1, 2, 3, 4]);

const actions = emptyActions();
assert.deepEqual(DEFAULT_TABLE_ASSISTS, { sort: true, win: false, call: false, cut: false });
assert.equal(automaticIntent(actions, 1, DEFAULT_TABLE_ASSISTS, false), null);
actions.discardableTileIds = [1]; actions.canTsumo = true;
const allOn = { sort: true, win: true, call: true, cut: true };
assert.deepEqual(automaticIntent(actions, 1, allOn, false), { kind: 'TSUMO' });
actions.canTsumo = false;
actions.callOptions = [
  { id: 'chi', kind: 'chi', consumeTileIds: [2, 3] },
  { id: 'pon', kind: 'pon', consumeTileIds: [2, 3] },
  { id: 'ron', kind: 'ron', consumeTileIds: [] },
];
actions.canPass = true;
assert.deepEqual(automaticIntent(actions, 1, allOn, false), { kind: 'RESPOND', optionId: 'ron' });
assert.equal(automaticIntent(actions, 1, { ...allOn, win: false }, false), null, 'manual ron remains available');
actions.callOptions.pop();
assert.deepEqual(automaticIntent(actions, 1, allOn, false), { kind: 'RESPOND', optionId: 'pon' });
actions.callOptions = [];
actions.canPass = false;
assert.deepEqual(automaticIntent(actions, 1, allOn, false), { kind: 'DISCARD', tileId: 1 });
assert.equal(automaticIntent(actions, 1, allOn, true), null, 'staged riichi is never silently confirmed');
assert.equal(automaticIntent(actions, 2, allOn, false), null, 'drawn tile must be offered for discard');
console.log('PASS table assists: manual order survives hand changes; automatic intents use legal offers and priority');
