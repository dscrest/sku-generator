"use strict";
// Optional Zoho Books item fields an org can switch on (Settings → SKU →
// Extra item fields, CR-209). Key = the Books item API field, so a stored
// value rides onto the push body unchanged through pushableBooksFields.
// Values live in SKUItem.booksData (no column per field). Org-wise gate:
// OrgSetting `skuItemFields` = comma-separated keys; blank = the org sees
// none of these. Adding a field = one entry here. `source` (optional) = an
// app route returning the allowed values — the forms render a dropdown from
// it (Books master, CR-210/CR-231) and fall back to a text input if it fails.
// `digits` / `lengths` (CR-231): digits-only input, allowed lengths — the
// forms read these from the catalogue so the rule lives here only.
const ITEM_FIELDS = [
  { key: "hsn_or_sac", label: "HSN Code", maxLen: 8, digits: true, lengths: [4, 6, 8] },
  { key: "manufacturer", label: "Manufacturer", maxLen: 100, source: "/api/sku-items/manufacturers" },
];
const KEYS = ITEM_FIELDS.map((f) => f.key);

const enabledKeys = (s) => String((s && s.skuItemFields) || "").split(",").filter((k) => KEYS.includes(k));

// Only the org's enabled keys, trimmed and capped; a present-but-blank value
// clears. Keys the org has not enabled are dropped even if the client sent them.
function pickItemFields(enabled, body) {
  const picked = {};
  for (const f of ITEM_FIELDS) {
    if (!enabled.includes(f.key) || !body || body[f.key] === undefined) continue;
    let v = String(body[f.key] ?? "").trim();
    if (f.digits) v = v.replace(/\D/g, "");
    picked[f.key] = v.slice(0, f.maxLen);
  }
  return picked;
}

// First rule a picked (non-blank) value breaks, as a user-facing message; null
// when all good. Blank = clear, always allowed.
function itemFieldError(picked) {
  for (const f of ITEM_FIELDS) {
    const v = picked && picked[f.key];
    if (v && f.lengths && !f.lengths.includes(v.length)) {
      return `${f.label} must be ${f.lengths.join(", ").replace(/, (\d+)$/, " or $1")} digits`;
    }
  }
  return null;
}

// Merge onto the row's booksData JSON so sheet-import keys (rate, _gstRate…)
// survive an edit. Blank values delete the key. Returns the new JSON string,
// null when nothing is left, undefined when there was nothing to change.
function mergeBooksData(existingJson, picked) {
  if (!picked || !Object.keys(picked).length) return undefined;
  let stored = {};
  try { stored = existingJson ? JSON.parse(existingJson) : {}; } catch { stored = {}; }
  for (const [k, v] of Object.entries(picked)) {
    if (v) stored[k] = v; else delete stored[k];
  }
  return Object.keys(stored).length ? JSON.stringify(stored) : null;
}

// The catalogue subset of a parsed booksData — what the composite
// (Manufacturing) push carries, not the whole sheet import.
function catalogueFields(stored) {
  return Object.fromEntries(Object.entries(stored || {}).filter(([k, v]) => KEYS.includes(k) && v));
}

module.exports = { ITEM_FIELDS, enabledKeys, pickItemFields, itemFieldError, mergeBooksData, catalogueFields };
