// Books-import column mapping: Zoho Books fields on one side, uploaded CSV
// headers on the other. Pure — ImportItemsPage and the self-test share it.

// "Material(Custom Feild)" / "GSM (custom field)" → "Material" / "GSM".
// Same tolerance as the backend (booksImport.js) — the Books sheet misspells it.
const CF_SUFFIX = /\s*\(\s*custom\s*fe?i?e?ld\s*\)\s*$/i;
// Books *exports* write custom fields as "CF.Material" — same field, strip it too.
const CF_PREFIX = /^cf\./i;

export const normHeader = (h) =>
  String(h || '').replace(CF_SUFFIX, '').replace(CF_PREFIX, '').trim().toLowerCase();

// booksFields → matching CSV header (case/CF-suffix-insensitive), '' when none.
export function autoMap(booksFields, csvHeaders) {
  const byNorm = new Map();
  for (const h of csvHeaders) {
    const n = normHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  const mapping = {};
  for (const f of booksFields) mapping[f] = byNorm.get(normHeader(f)) || '';
  return mapping;
}

// Rows keyed by CSV headers → rows keyed by Books fields, unmapped columns dropped.
export function applyMapping(rows, mapping) {
  return rows.map((row) => {
    const o = {};
    for (const [field, csv] of Object.entries(mapping)) {
      if (csv && row[csv] !== undefined) o[field] = row[csv];
    }
    return o;
  });
}
