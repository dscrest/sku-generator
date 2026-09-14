// Self-check for the column-pref merge. Run: node frontend/src/components/gridCols.test.js
import assert from 'node:assert';
import { orderCols } from './gridCols.js';

const cols = [
  { key: 'a', label: 'A', lock: true },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
  { key: 'd', label: 'D' },
];
const keys = r => r.map(c => c.key).join(',');

// no prefs -> code order
assert.equal(keys(orderCols(cols, null)), 'a,b,c,d');
assert.equal(keys(orderCols(cols, { order: [], hidden: [] })), 'a,b,c,d');

// saved order respected; unknown saved key dropped; unsaved (new) column appended
assert.equal(keys(orderCols(cols, { order: ['c', 'zombie', 'a', 'b'], hidden: [] })), 'c,a,b,d');

// hidden removed
assert.equal(keys(orderCols(cols, { order: [], hidden: ['b', 'd'] })), 'a,c');

// lock ignores hidden
assert.equal(keys(orderCols(cols, { order: [], hidden: ['a', 'c'] })), 'a,b,d');

// duplicate saved keys collapse
assert.equal(keys(orderCols(cols, { order: ['b', 'b', 'c'], hidden: [] })), 'b,c,a,d');

console.log('gridCols.test.js OK');
