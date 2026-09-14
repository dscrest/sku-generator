// Self-check for DateInput date helpers. Run: node frontend/src/components/DateInput.test.js
import assert from 'node:assert';
import { parseDMY, toDMY } from './dateText.js';

assert.equal(toDMY('2026-09-30'), '30/09/2026');
assert.equal(toDMY(''), '');
assert.equal(toDMY(null), '');

assert.equal(parseDMY('30/09/2026'), '2026-09-30');
assert.equal(parseDMY('1/2/2026'), '2026-02-01');
assert.equal(parseDMY('01-02-2026'), '2026-02-01');
assert.equal(parseDMY(' 30/09/2026 '), '2026-09-30');
assert.equal(parseDMY('31/02/2026'), null); // no Feb 31
assert.equal(parseDMY('29/02/2025'), null); // not a leap year
assert.equal(parseDMY('29/02/2024'), '2024-02-29');
assert.equal(parseDMY('30/09/26'), null); // 4-digit year required
assert.equal(parseDMY('garbage'), null);
assert.equal(parseDMY(''), null);

// round-trip
for (const iso of ['2026-01-01', '2026-12-31', '2024-02-29']) {
  assert.equal(parseDMY(toDMY(iso)), iso);
}

console.log('DateInput.test.js OK');
