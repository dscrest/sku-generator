// CR-190 — Material Issue Copy: every confirmed issue on a WO rolled up to one
// row per material (qty summed across movements and FGs). Returns a pseudo-txn
// so the existing IssueSlip prints it.
export function combineIssued(transactions) {
  const byItem = new Map();
  let movements = 0;
  let latest = null;
  for (const t of transactions || []) {
    if (t.status !== 'Confirmed' || (t.type !== 'issue' && t.type !== 'return')) continue;
    if (t.type === 'issue') {
      movements++;
      const at = t.confirmedAt || t.createdAt;
      if (at && (!latest || at > latest)) latest = at;
    }
    for (const l of t.lines || []) {
      const key = String(l.rmItemId);
      let row = byItem.get(key);
      if (!row) {
        row = { rmItemId: l.rmItemId, name: l.name, sku: l.sku, uom: l.uom, qty: 0, returned: 0, tracking: { serials: [], batches: [] } };
        byItem.set(key, row);
      }
      const qty = Number(l.qty) || 0;
      if (t.type === 'return') { row.returned += qty; continue; }
      row.qty += qty;
      row.tracking.serials.push(...(l.tracking?.serials || []));
      row.tracking.batches.push(...(l.tracking?.batches || []));
    }
  }
  // A return with no matching issue on this WO is not an issued item.
  const lines = [...byItem.values()]
    .filter(r => r.qty > 0)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return {
    type: 'issueCopy',
    txnNumber: `${movements} issue movement${movements === 1 ? '' : 's'}`,
    confirmedAt: latest,
    lines,
  };
}
