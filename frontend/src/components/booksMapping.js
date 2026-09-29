// Books-import column mapping: Zoho Books fields on one side, uploaded CSV
// headers on the other. Pure — ImportItemsPage and the self-test share it.

// "Material(Custom Feild)" / "GSM (custom field)" → "Material" / "GSM".
// Same tolerance as the backend (booksImport.js) — the Books sheet misspells it.
const CF_SUFFIX = /\s*\(\s*custom\s*fe?i?e?ld\s*\)\s*$/i;
// Books *exports* write custom fields as "CF.Material" — same field, strip it too.
const CF_PREFIX = /^cf\./i;

export const normHeader = (h) =>
  String(h || '').replace(CF_SUFFIX, '').replace(CF_PREFIX, '').trim().toLowerCase();

// Books exports name some columns differently from the field they feed:
// the item's category arrives as "Category Name", not a "Category" custom field,
// and the fixed columns differ from the import sheet's (Rate vs Selling Price).
// The field's own name still wins when the file has it.
const ALIASES = {
  category: ['category name'],
  'selling price': ['rate'],
  'purchase price': ['purchase rate'],
  'sales description': ['description'],
  'reorder level': ['reorder point'],
  'preferred vendor': ['vendor'],
  'warehouse name': ['location name'],
};

// booksFields → matching CSV header (case/CF-suffix-insensitive), '' when none.
export function autoMap(booksFields, csvHeaders) {
  const byNorm = new Map();
  for (const h of csvHeaders) {
    const n = normHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  const mapping = {};
  for (const f of booksFields) {
    const n = normHeader(f);
    mapping[f] = [n, ...(ALIASES[n] || [])].map((k) => byNorm.get(k)).find(Boolean) || '';
  }
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
