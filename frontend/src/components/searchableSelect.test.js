// Self-check for the searchable dropdown panel. Run: node frontend/src/components/searchableSelect.test.js
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { optionRows, filterRows, stepActive, placePanel, isOpenKey } from './searchableSelect.js';

const select = {
  selectedIndex: 2,
  options: [
    { text: '— select —' },
    { text: 'CF8 Body' },
    { text: 'CF8M Bonnet' },
    { text: 'Retired', disabled: true },
  ],
};
const rows = optionRows(select);
const labels = r => r.map(x => x.label).join('|');

// rows mirror the select: index, label, disabled, selected
assert.deepEqual(rows[2], { i: 2, label: 'CF8M Bonnet', disabled: false, selected: true });
assert.equal(rows[3].disabled, true);
assert.equal(rows[0].selected, false);

// filter: blank / whitespace keeps everything (placeholder included)
assert.equal(filterRows(rows, '').length, 4);
assert.equal(filterRows(rows, '   ').length, 4);
// case-insensitive substring, query trimmed; placeholder drops out; index survives
assert.equal(labels(filterRows(rows, ' cf8 ')), 'CF8 Body|CF8M Bonnet');
assert.equal(filterRows(rows, 'bonnet')[0].i, 2);
assert.deepEqual(filterRows(rows, 'zzz'), []);

// stepping skips disabled rows and stays put at both ends
assert.equal(stepActive(rows, -1, 1), 0);
assert.equal(stepActive(rows, 1, 1), 2);
assert.equal(stepActive(rows, 2, 1), 2);   // only a disabled row below
assert.equal(stepActive(rows, 0, -1), 0);
assert.equal(stepActive([{ disabled: true }, { disabled: true }], -1, 1), -1);
assert.equal(stepActive([], -1, 1), -1);

// placement: below with the full list height when there is room
const rect = (left, top, width, height = 30) => ({ left, top, width, height, right: left + width, bottom: top + height });
let p = placePanel(rect(100, 100, 220), 1200, 800);
assert.equal(p.top, 134);
assert.equal(p.bottom, undefined);
assert.equal(p.left, 100);
assert.equal(p.minWidth, 220);
assert.equal(p.maxHeight, 240);
// near the bottom (grid footer) → flips above
p = placePanel(rect(100, 740, 220), 1200, 800);
assert.equal(p.top, undefined);
assert.equal(p.bottom, 64);
assert.equal(p.maxHeight, 240);
// tiny select (page size, table cell) still gets a usable width
assert.equal(placePanel(rect(100, 100, 40), 1200, 800).minWidth, 180);
// right edge → pulled back inside the viewport
assert.equal(placePanel(rect(1150, 100, 40), 1200, 800).left, 1012);
// short viewport (widget iframe) → list shrinks to the room there is
p = placePanel(rect(10, 100, 200), 400, 300);
assert.equal(p.top, 134);
assert.equal(p.maxHeight, 110);
// narrow viewport → never wider than it
assert.equal(placePanel(rect(0, 0, 500), 320, 600).minWidth, 304);

// keys that open the panel from a focused select
const key = (k, mods = {}) => ({ key: k, ...mods });
for (const k of [' ', 'ArrowDown', 'ArrowUp', 'F4', 'a', '7']) assert.equal(isOpenKey(key(k)), true, k);
assert.equal(isOpenKey(key('ArrowDown', { altKey: true })), true);
for (const k of ['Enter', 'Tab', 'Escape', 'Shift']) assert.equal(isOpenKey(key(k)), false, k);
assert.equal(isOpenKey(key('a', { ctrlKey: true })), false);
assert.equal(isOpenKey(key('a', { metaKey: true })), false);

// the widgets carry a pasted copy (self-contained HTML) — it must not drift
const here = p => new URL(p, import.meta.url);
const body = readFileSync(here('./searchableSelect.js'), 'utf8').split('\nexport {')[0].trim();
for (const f of [
  '../../../functions/skuapi/widget.html',
  '../../../functions/skuapi/configurator.html',
  '../../../functions/skuapi/packing.html',
  '../../../books-widget/app/widget.html',
]) {
  const html = readFileSync(here(f), 'utf8');
  assert.ok(html.includes(body), `${f}: searchableSelect copy is missing or out of date`);
  assert.ok(html.includes('installSearchableSelects(document);'), `${f}: enhancer not installed`);
}

console.log('searchableSelect self-check passed');
