import assert from 'node:assert/strict';
import { isVisibleDora } from '../lib/virtual-mahjong/dora-display';
import type { Tile } from '../lib/virtual-mahjong/tiles';

const tile = (type: number, red = false): Tile => ({ id: type + (red ? 100 : 0), type, red });
assert.equal(isVisibleDora(tile(7), [tile(6)], 4), true); // 七万指示八万
assert.equal(isVisibleDora(tile(6), [tile(6)], 4), false); // 指示牌本身没有扫光
assert.equal(isVisibleDora(tile(4, true), [], 4), true); // 赤五万
assert.equal(isVisibleDora(tile(4), [], 4), false);
assert.equal(isVisibleDora(tile(8), [tile(0)], 3), true); // 三麻一万指示九万
assert.equal(isVisibleDora(tile(0), [tile(8)], 3), true);
