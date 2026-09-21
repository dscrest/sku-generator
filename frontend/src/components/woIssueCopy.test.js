// Self-check for the Material Issue Copy roll-up. Run: node frontend/src/components/woIssueCopy.test.js
import assert from 'node:assert';
import { combineIssued } from './woIssueCopy.js';

const line = (rmItemId, qty, extra = {}) => ({ rmItemId, qty, name: `Item ${rmItemId}`, sku: `S${rmItemId}`, uom: 'Nos', ...extra });
const txn = (type, status, lines, confirmedAt = '2026-09-01') => ({ type, status, lines, confirmedAt });

const out = combineIssued([
  txn('issue', 'Confirmed', [line(1, 4), line(2, 1)], '2026-09-01'),                       // FG 1
  txn('issue', 'Confirmed', [line(1, 6, { tracking: { serials: ['A1'] } })], '2026-09-05'), // FG 2, same item
  txn('issue', 'Draft', [line(1, 100)]),
  txn('issue', 'Cancelled', [line(1, 100)]),
  txn('reserve', 'Confirmed', [line(1, 100)]),
  txn('return', 'Confirmed', [line(1, 3), line(9, 2)]),
]);

assert.equal(out.type, 'issueCopy');
assert.equal(out.txnNumber, '2 issue movements');
assert.equal(out.confirmedAt, '2026-09-05');
assert.deepEqual(out.lines.map(l => [l.rmItemId, l.qty, l.returned]), [[1, 10, 3], [2, 1, 0]]);
assert.deepEqual(out.lines[0].tracking.serials, ['A1']);

assert.deepEqual(combineIssued(null).lines, []);
assert.equal(combineIssued([txn('issue', 'Confirmed', [line(1, 1)])]).txnNumber, '1 issue movement');

console.log('woIssueCopy ok');
