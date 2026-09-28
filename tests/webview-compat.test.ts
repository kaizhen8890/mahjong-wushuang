import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Exercise the shipped compatibility bundle with the APIs absent on WebView 92.
const context = createContext({ setTimeout, clearTimeout });
runInContext('delete Object.hasOwn; delete Array.prototype.at; delete Array.prototype.findLast; delete globalThis.structuredClone', context);
runInContext(readFileSync('node_modules/core-js-bundle/minified.js', 'utf8'), context);
assert.equal(runInContext(`(() => {
  const record = Object.create(null); record.own = undefined;
  const source = { hand: [1, 2], optional: undefined, missing: NaN };
  source.self = source;
  const clone = structuredClone(source); clone.hand.push(3);
  return Object.hasOwn(record, 'own') && !Object.hasOwn(record, 'toString')
    && [1, 2].at(-1) === 2 && [1, 2, 3].findLast(n => n < 3) === 2
    && source.hand.length === 2 && clone.self === clone
    && Object.hasOwn(clone, 'optional') && Number.isNaN(clone.missing);
})()`, context), true);
console.log('PASS old WebView compatibility: own keys, negative index, reverse search, isolated/cyclic clone and undefined');
