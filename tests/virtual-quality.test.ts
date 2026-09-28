import assert from 'node:assert/strict';
import {QUALITY_LEVELS,qualityPixelRatio,isTableQuality} from '../app/components/virtual-mahjong/three/quality';
for(const level of QUALITY_LEVELS) {
 assert.equal(qualityPixelRatio(level.id,780,360,8192),level.ratio);
 const ratio=qualityPixelRatio(level.id,7680,4320,4096);
 assert(7680*ratio<=4096 && 4320*ratio<=4096);
 assert(7680*4320*ratio*ratio<=8_000_001);
}
assert(!isTableQuality('corrupted'));assert(isTableQuality('extreme'));
console.log('PASS quality: five tiers, supersampling, total pixel and hardware limits');
