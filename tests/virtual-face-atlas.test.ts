import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FACE_CODES } from '../app/components/virtual-mahjong/three/face-atlas';
assert.equal(FACE_CODES.length,36);assert.equal(new Set(FACE_CODES.map(f=>f.code)).size,36);
assert(!FACE_CODES.some(f=>f.code==='5z'));
for(const f of FACE_CODES){assert(existsSync(`public/virtual-tiles/faces/${f.code}.svg`));const svg=readFileSync(`public/virtual-tiles/faces/${f.code}.svg`,'utf8');assert(svg.includes('viewBox="0 0 19 26"'));assert(!/<script|<image|https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg','')));}
for(const [code,row] of [['0s',0],['0m',1],['0p',2]] as const)assert(FACE_CODES.some(f=>f.code===code&&f.row===row&&f.column===9));
console.log('PASS transparent faces: 36 supplied SVGs, blank white tile, red five mapping, no scripts/linked images');
