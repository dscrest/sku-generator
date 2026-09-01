"use strict";

/**
 * Per-property-combination numerical series (CR-089). When an industry has
 * seriesStart >= 1, every generated SKU gets a 4-digit suffix appended after
 * the property segments; the sequence is scoped to the exact segment prefix
 * (FAB-RED-0001, FAB-RED-0002, FAB-BLU-0001). No counter table — next number
 * is max(existing suffixes for the prefix) + 1, same philosophy as the
 * work-order nextNumber().
 */
const { rowList, zStr, orgClause } = require("./store");

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Pure: next zero-padded suffix for base+sep among existing skus. Only skus of
// the exact shape `${base}${sep}NNNN` count — a LIKE 'base*' scan also returns
// longer combinations (FAB-RED-X-0001), filtered out here. Case-insensitive to
// match ZCQL LIKE and the DB unique constraint.
function nextSuffix(existingSkus, base, sep, start) {
  const re = new RegExp(`^${escRe(base + sep)}(\\d{4})$`, "i");
  let max = 0;
  for (const s of existingSkus) {
    const m = re.exec(String(s || ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = max ? max + 1 : Math.max(1, Number(start) || 1);
  return String(n).padStart(4, "0");
}

// ponytail: one 300-row page per combination (a single combination won't grow
// past 300 items — page on OFFSET if it ever does), and the max-scan is not
// atomic — two simultaneous creates can pick the same number; the SKUItem
// unique constraint 409s the loser. Upgrade path: per-combination counter row.
async function nextSeriesSku(catalyst, base, sep, start) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT sku FROM SKUItem WHERE sku LIKE ${zStr(base + sep + "*")} AND ${orgClause(catalyst)} LIMIT 300`,
    ),
  );
  return base + sep + nextSuffix(rows.map((r) => r.sku), base, sep, start);
}

// Strip a trailing `${sep}NNNN` (or bare NNNN when sep is empty) off a sku to
// recover the combination base; returns the sku unchanged if no suffix.
function stripSuffix(sku, sep) {
  return String(sku).replace(new RegExp(`${escRe(sep)}\\d{4}$`), "");
}

module.exports = { nextSuffix, nextSeriesSku, stripSuffix, escRe };
