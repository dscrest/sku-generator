// Self-check for Books-import column mapping. Run: node frontend/src/components/booksMapping.test.js
import assert from 'node:assert';
import { autoMap, applyMapping } from './booksMapping.js';

const books = ['Item Name', 'SKU', 'Selling Price', 'Material (Custom Field)', 'GSM (Custom Field)'];
const csv = ['item name', 'Sku', 'Sell Price', 'Material(Custom Feild)', 'CF.GSM', 'Extra Col'];

const m = autoMap(books, csv);
// case-insensitive exact match
assert.equal(m['Item Name'], 'item name');
assert.equal(m['SKU'], 'Sku');
// custom-field suffix (and its misspelling) and the export-style CF. prefix ignored
assert.equal(m['Material (Custom Field)'], 'Material(Custom Feild)');
assert.equal(m['GSM (Custom Field)'], 'CF.GSM');
// no rename guessing — unmatched stays unmapped
assert.equal(m['Selling Price'], '');

const rows = applyMapping(
  [{ 'item name': 'Chair', Sku: 'CH-1', 'Sell Price': '99', 'Extra Col': 'x' }],
  { ...m, 'Selling Price': 'Sell Price' },
);
assert.deepEqual(rows[0], { 'Item Name': 'Chair', SKU: 'CH-1', 'Selling Price': '99' });

console.log('booksMapping self-check OK');
