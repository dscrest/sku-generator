"use strict";

/**
 * SKU numerical series (CR-089, org-wide + item-wise in CR-136). Every
 * generated SKU can get a zero-padded numeric suffix appended after the
 * property segments. Two modes (org-wide, see seriesConfig/applySeries):
 * continuous — one running number per industry regardless of combination
 * (FAB-RED-001, FAB-BLU-002, FAB-RED-003); params — each combination base
 * counts its own series (CH-RD-001, CH-RD-002; CH-BL-001). assemble() is
 * deterministic, so same params ⇒ same base string — the counter is scoped
 * by base SKU, no key-property matching needed. Series always starts at 1;
 * suffix width via pad (total digits, default 4). No counter table — next
 * number is max(existing suffixes) + 1, same philosophy as the work-order
 * nextNumber().
 */
const { rowList, idOk, zStr, reqOrg, orgClause } = require("./store");
const { settings } = require("./workorder/store");

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Pure: next zero-padded suffix given the candidate skus. Without `base`, any
// sku ending in `${sep}` + exactly `pad` digits counts, whatever its
// combination base — the series is industry-wide (continuous mode). With
// `base`, only skus that are exactly `base + sep + digits` count (params
// mode) — longer bases sharing the prefix don't. Case-insensitive to match
// the DB unique constraint. Start is always 1.
// ponytail: changing an industry's pad restarts the series — old suffixes at a
// different width no longer match `\d{pad}`, so max resets to 0. Acceptable:
// width is a deliberate admin setting, not something that changes mid-series.
function nextSuffix(existingSkus, sep, pad, base) {
  const w = Number(pad) || 4;
  const re = new RegExp(`${base ? "^" + escRe(base) : ""}${escRe(sep)}(\\d{${w}})$`, "i");
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
async function nextSeriesSku(catalyst, industryId, base, sep, pad, perBase) {
  const like = perBase ? ` AND sku LIKE ${zStr(base + sep + "*")}` : "";
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT sku FROM SKUItem WHERE industryId = ${zStr(String(industryId))} AND ${orgClause(catalyst)}${like} ORDER BY CREATEDTIME DESC LIMIT 300`,
    ),
  );
  return base + sep + nextSuffix(rows.map((r) => r.sku), sep, pad, perBase ? base : undefined);
}

// Strip a trailing `${sep}` + `pad` digits (or bare digits when sep is empty)
// off a sku to recover the combination base; returns the sku unchanged if no
// matching suffix.
function stripSuffix(sku, sep, pad) {
  const w = Number(pad) || 4;
  return String(sku).replace(new RegExp(`${escRe(sep)}\\d{${w}}$`), "");
}

/**
 * Effective series config for an org (CR-136). Org-wide OrgSetting keys win:
 *   skuSeriesMode     "" | "off" | "continuous" | "params"
 *   skuSeriesPad      total digits (1-8)
 * Unset mode falls back to the legacy per-industry columns (seriesStart > 0 →
 * continuous, seriesPad) so pre-CR-136 orgs keep working with no migration.
 */
async function seriesConfig(catalyst, industry) {
  const s = await settings(catalyst, reqOrg(catalyst));
  let mode = s.skuSeriesMode || "";
  if (!mode) mode = Number(industry.seriesStart) > 0 ? "continuous" : "off";
  const pad = Math.min(8, Math.max(1, Number(s.skuSeriesPad) || Number(industry.seriesPad) || 4));
  return { mode, pad, sep: industry.skuSeparator || "" };
}

/**
 * Single entry point for every SKU-producing path: append the series suffix
 * (or not) per the org's series config.
 *  - off: baseSku unchanged.
 *  - continuous: one running number per industry.
 *  - params: each combination base counts its own series — same params again
 *    gets that base's next number (CH-RD-001, CH-RD-002; CH-BL-001).
 * Both modes: editing an item whose combination is unchanged keeps its
 * suffix (opts.excludeItemId).
 */
async function applySeries(catalyst, industry, baseSku, selectedValues, opts = {}) {
  if (!baseSku) return baseSku;
  const { mode, pad, sep } = await seriesConfig(catalyst, industry);
  if (mode !== "continuous" && mode !== "params") return baseSku;

  // Editing keeps the item's suffix while its combination is unchanged
  if (idOk(opts.excludeItemId)) {
    const cur = rowList(
      await catalyst.zcql().executeZCQLQuery(
        `SELECT sku FROM SKUItem WHERE ROWID = ${opts.excludeItemId} AND ${orgClause(catalyst)}`,
      ),
    )[0];
    const m = cur && new RegExp(`^${escRe(baseSku + sep)}(\\d{${pad}})$`, "i").exec(cur.sku);
    if (m) return baseSku + sep + m[1];
  }
  return nextSeriesSku(catalyst, industry.id, baseSku, sep, pad, mode === "params");
}

module.exports = { nextSuffix, nextSeriesSku, stripSuffix, escRe, seriesConfig, applySeries };
