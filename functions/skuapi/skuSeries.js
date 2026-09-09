"use strict";

/**
 * Per-industry numerical series (CR-089, rescoped). When an industry has
 * seriesStart >= 1 the series is on; every generated SKU gets a zero-padded
 * numeric suffix appended after the property segments. The series always
 * starts at 1 and is shared across the whole industry (FAB-RED-001,
 * FAB-BLU-002, FAB-RED-003). The suffix width is configurable per industry
 * via `seriesPad` (total digits, default 4) — the "leading zeros" setting is
 * pad-1. No counter table — next number is max(existing suffixes) + 1, same
 * philosophy as the work-order nextNumber().
 */
const { rowList, zStr, orgClause } = require("./store");

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Pure: next zero-padded suffix given every sku in the industry. Any sku
// ending in `${sep}` + exactly `pad` digits counts, whatever its combination
// base — the series is industry-wide. Case-insensitive to match the DB unique
// constraint. Start is always 1.
// ponytail: changing an industry's pad restarts the series — old suffixes at a
// different width no longer match `\d{pad}`, so max resets to 0. Acceptable:
// width is a deliberate admin setting, not something that changes mid-series.
function nextSuffix(existingSkus, sep, pad) {
  const w = Number(pad) || 4;
  const re = new RegExp(`${escRe(sep)}(\\d{${w}})$`, "i");
  let max = 0;
  for (const s of existingSkus) {
    const m = re.exec(String(s || ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(w, "0");
}

// ponytail: one 300-row page, newest first — the latest item carries the
// highest number, so the max is always on page one; and the max-scan is not
// atomic — two simultaneous creates can pick the same number; the SKUItem
// unique constraint 409s the loser. Upgrade path: per-industry counter row.
async function nextSeriesSku(catalyst, industryId, base, sep, pad) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT sku FROM SKUItem WHERE industryId = ${zStr(String(industryId))} AND ${orgClause(catalyst)} ORDER BY CREATEDTIME DESC LIMIT 300`,
    ),
  );
  return base + sep + nextSuffix(rows.map((r) => r.sku), sep, pad);
}

// Strip a trailing `${sep}` + `pad` digits (or bare digits when sep is empty)
// off a sku to recover the combination base; returns the sku unchanged if no
// matching suffix.
function stripSuffix(sku, sep, pad) {
  const w = Number(pad) || 4;
  return String(sku).replace(new RegExp(`${escRe(sep)}\\d{${w}}$`), "");
}

module.exports = { nextSuffix, nextSeriesSku, stripSuffix, escRe };
