"use strict";

/**
 * Finished-good serial numbers (CR-150): `<prefix><year><NNN>` — KGV2025001,
 * BV2025002, BV2025003, KGV2026001. One running number per calendar year for
 * the whole org (shared across prefixes), 3 digits, restarts at 001 each
 * January. Prefix = the code before the dash of the FG item's `cf_valve_type`
 * custom field ("KGV-Knife Edge Gate Valve" → KGV, CR-177), else the SKU code
 * of the FG's "Valve Type" property value. Counter lives in OrgSetting
 * `serialSeq` as "YYYY:N" (no schema).
 */
const { zStr } = require("../store");
const { getItem } = require("../zoho/booksApi");
const { byOrg, settings, setSetting } = require("./store");

const SEQ_KEY = "serialSeq";
const PAD = 3;

// Pure. padStart never truncates, so unit 1000 in a year just widens to 4 digits.
function formatSerials(prefix, year, from, count, pad = PAD) {
  return Array.from({ length: count }, (_, i) => `${prefix}${year}${String(from + i).padStart(pad, "0")}`);
}

// Pure. stored = "YYYY:N" (or empty). A different year resets N to 0.
function advanceSeq(stored, year, count) {
  const m = /^(\d{4}):(\d+)$/.exec(String(stored || ""));
  const n = m && Number(m[1]) === Number(year) ? Number(m[2]) : 0;
  return { from: n + 1, next: `${year}:${n + count}` };
}

// Pure. The prefix the user confirms in the Assemble modal (CR-155).
function normalizePrefix(s) {
  const p = String(s || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(p)) {
    const e = new Error("Serial prefix must be 1–10 letters or digits");
    e.status = 400; throw e;
  }
  return p;
}

// Pure (CR-177): the code before the dash of a Books item's `cf_valve_type`
// custom field (label "Valve Type" as fallback). value_formatted covers the
// lookup-typed variant of the field (value = record id there); "" when absent.
function prefixFromItem(item) {
  const cfs = (item && item.custom_fields) || [];
  const cf = cfs.find((c) => c.api_name === "cf_valve_type")
    || cfs.find((c) => /valve\s*type/i.test(String(c.label || "")));
  const text = cf ? String(cf.value_formatted ?? cf.value ?? "") : "";
  const m = /^\s*([A-Za-z0-9]+)\s*-/.exec(text);
  return m ? m[1].toUpperCase() : "";
}

// Prefill for an FG: the item's cf_valve_type code (CR-177), else its SKU
// item's "Valve Type" value code (else the lowest skuPosition property's value
// code), else the leading letters of the SKU, else "" (the user types the
// prefix in the modal).
async function serialPrefix(catalyst, orgId, fg) {
  if (fg.fgItemId) {
    const p = prefixFromItem(await getItem(catalyst, fg.fgItemId).catch(() => null));
    if (p) return p;
  }
  let items = fg.fgItemId ? await byOrg(catalyst, orgId, "SKUItem", `zohoItemId = ${zStr(String(fg.fgItemId))}`) : [];
  if (!items.length && fg.fgSku) items = await byOrg(catalyst, orgId, "SKUItem", `sku = ${zStr(String(fg.fgSku))}`);
  if (items.length) {
    const vals = (await byOrg(catalyst, orgId, "SKUItemValue", `skuItemId = ${zStr(String(items[0].ROWID))}`))
      .filter((v) => v.valueId);
    if (vals.length) {
      const props = await byOrg(catalyst, orgId, "Property", `ROWID IN (${vals.map((v) => v.propertyId).join(",")})`);
      const prop = props.find((p) => /valve\s*type/i.test(`${p.name} ${p.caption}`))
        || props.sort((a, b) => (Number(a.skuPosition) || 0) - (Number(b.skuPosition) || 0))[0];
      const val = prop && vals.find((v) => String(v.propertyId) === String(prop.ROWID));
      const pv = val && (await byOrg(catalyst, orgId, "PropertyValue", `ROWID = ${zStr(String(val.valueId))}`))[0];
      if (pv && pv.sku) return String(pv.sku).trim();
    }
  }
  const m = /^[A-Za-z]+/.exec(String(fg.fgSku || ""));
  return m ? m[0].toUpperCase() : "";
}

// Next `count` serials. commit() persists the counter — call it only after
// Zoho accepted the bundle so a failed assembly burns no numbers.
// ponytail: read-then-write is not atomic — two simultaneous assemblies can
// pick the same numbers; Zoho rejects duplicate serials on the same item, the
// loser retries. Upgrade path: counter row + conditional update.
async function nextSerials(catalyst, orgId, prefix, count) {
  const year = new Date().getFullYear();
  const { from, next } = advanceSeq((await settings(catalyst, orgId))[SEQ_KEY], year, count);
  return {
    serials: formatSerials(prefix, year, from, count),
    commit: () => setSetting(catalyst, orgId, SEQ_KEY, next),
  };
}

module.exports = { formatSerials, advanceSeq, normalizePrefix, prefixFromItem, serialPrefix, nextSerials };
