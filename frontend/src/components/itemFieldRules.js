// Client side of the org-wise extra item fields (CR-209/CR-231). The rules
// come with the catalogue from /api/sku-items/settings (`digits`, `maxLen`,
// `lengths`), so they live once, on the server (functions/skuapi/itemFields.js).

// What the input keeps as the user types.
export function cleanFieldValue(f, value) {
  let v = value ?? '';
  if (f.digits) v = v.replace(/\D/g, '');
  return f.maxLen ? v.slice(0, f.maxLen) : v;
}

// First broken rule across the enabled fields, as the message to toast; null when fine.
export function itemFieldError(extraFields, fields) {
  for (const f of extraFields) {
    const v = (fields?.[f.key] ?? '').trim();
    if (v && f.lengths && !f.lengths.includes(v.length)) {
      return `${f.label} must be ${f.lengths.join(', ').replace(/, (\d+)$/, ' or $1')} digits`;
    }
  }
  return null;
}
