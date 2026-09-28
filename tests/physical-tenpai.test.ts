import assert from 'node:assert/strict';
import { inspectPhysicalTenpai } from '../lib/physical-tenpai';

const waiting = ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','5s'];
assert.deepEqual(inspectPhysicalTenpai(waiting, '', 4).previews[0].waits, ['5s']);
const fourteen = inspectPhysicalTenpai([...waiting, '5s'], '', 4);
assert.ok(fourteen.previews.some(preview => preview.discard === '5s' && preview.waits.includes('5s')));
assert.equal(inspectPhysicalTenpai(waiting, '', 3).error, '牌张不合法；三麻不使用二至八万');
assert.deepEqual(inspectPhysicalTenpai(['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p'], '碰5s', 4).previews[0].waits, ['1p']);
assert.match(inspectPhysicalTenpai(['5s','5s','5s','5s','1m','2m','3m','4m','5m','6m'], '碰5s', 4).error ?? '', /最多四张/);
console.log('Physical remote tenpai: concealed, discard preview, open meld, sanma and tile limits passed.');
