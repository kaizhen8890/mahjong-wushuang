import assert from 'node:assert/strict';
import { Box3, BufferGeometry, Material, Mesh } from 'three';
import { createCenterDial } from '../app/components/virtual-mahjong/three/center-dial';
import { CENTER_HEIGHT } from '../app/components/virtual-mahjong/three/center-projection';
const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
const dial = createCenterDial(value => { geometries.add(value); return value; }, value => { materials.add(value); return value; });
dial.updateMatrixWorld(true);
const box = new Box3().setFromObject(dial);
// The nearest river tile edge is 4.704; bevels must remain clear at every seat.
assert.ok(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) < 4.4);
assert.ok(box.max.y < CENTER_HEIGHT && box.max.y > .6);
let meshCount = 0;
dial.traverse(object => { if (object instanceof Mesh) { meshCount++; assert.ok(geometries.has(object.geometry)); assert.ok(materials.has(object.material)); } });
assert.equal(meshCount, 22);
for (const geometry of geometries) geometry.dispose();
for (const material of materials) material.dispose();
console.log('PASS center dial: layered hardware fits river clearance, projected face is above geometry, all GPU assets owned');
