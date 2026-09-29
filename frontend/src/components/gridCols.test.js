// Self-check for the column-pref merge. Run: node frontend/src/components/gridCols.test.js
import assert from 'node:assert';
import { orderCols, matches } from './gridCols.js';

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

// search: blank / whitespace query matches everything
assert.equal(matches('', 'CF8'), true);
assert.equal(matches('   ', 'CF8'), true);
assert.equal(matches(undefined, 'CF8'), true);
// case-insensitive substring over any value
assert.equal(matches('cf8', 'IC CF8M', 'other'), true);
assert.equal(matches(' CF8 ', 'x', 'ic cf8'), true);
// null / undefined / numeric values are safe
assert.equal(matches('30', null, undefined, 300), true);
assert.equal(matches('cf8', null, undefined), false);
// no hit
assert.equal(matches('wcb', 'CF8', 'CI'), false);

console.log('gridCols.test.js OK');
