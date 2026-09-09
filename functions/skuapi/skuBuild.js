"use strict";
const { idOk, nameFilter } = require("./store");

/**
 * Assemble the SKU / Name / Description strings from resolved property values.
 * Shared by the manual generate route (routes/sku.js) and bulk import
 * (importItems.js) so the two never drift.
 *
 * - `properties`: active Property[] already ordered by skuPosition.
 * - `selectedValues`: { propertyId: PropertyValueROWID | rangeNumberString }.
 * - `sep`: the industry separator (may be "").
 * - `getPv(rowid)`: async lookup returning the PropertyValue object (out()-shape)
 *   or null. The caller controls how it's fetched/cached.
 *
 * Throws Error(message) on invalid input (bad number, out-of-range, unknown
 * value id) — callers turn that into a 400 / per-row failure. The returned `sku`
 * carries NO numerical-series suffix; that's appended by the caller.
 */
async function assemble(properties, selectedValues, sep, getPv) {
  const inName = nameFilter(properties);

  // Clubbed properties (same non-empty clubKey) concatenate their codes with NO
  // separator into one segment; unclubbed props are each their own segment.
  const segByKey = new Map();
  const segments = [];
  const pushCode = (prop, code) => {
    const key = prop.clubKey || "__" + prop.id;
    let seg = segByKey.get(key);
    if (!seg) { seg = []; segByKey.set(key, seg); segments.push(seg); }
    seg.push(code);
  };
  const nameParts = [];
  const descParts = [];
  const missingRequired = [];

  for (const prop of properties) {
    const rawValue = selectedValues[prop.id];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (prop.required) missingRequired.push(prop.caption);
      continue;
    }

    if (prop.valueType === "Range") {
      const num = parseFloat(rawValue);
      if (isNaN(num)) throw new Error(`${prop.caption} must be a number`);
      if (prop.rangeMin !== null && num < prop.rangeMin)
        throw new Error(`${prop.caption} must be >= ${prop.rangeMin}`);
      if (prop.rangeMax !== null && num > prop.rangeMax)
        throw new Error(`${prop.caption} must be <= ${prop.rangeMax}`);
      pushCode(prop, String(rawValue));
      if (inName(prop)) nameParts.push(String(rawValue));
      descParts.push(`${prop.caption}: ${rawValue}${prop.unit ? " " + prop.unit : ""}`);
    } else {
      if (!idOk(rawValue)) throw new Error(`Invalid value for ${prop.caption}`);
      const pv = await getPv(rawValue);
      if (!pv) throw new Error(`Value ${rawValue} not found`);
      pushCode(prop, pv.sku);
      if (inName(prop)) nameParts.push(pv.name);
      descParts.push(`${prop.caption}: ${pv.displayValue || pv.name}${prop.unit ? " " + prop.unit : ""}`);
    }
  }

  return {
    sku: segments.map((s) => s.join("")).join(sep),
    name: nameParts.join(" "),
    description: descParts.join("\n"),
    missingRequired,
  };
}

module.exports = { assemble };
