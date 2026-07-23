"use strict";

/**
 * BOM handling. Zoho's composite item stays the master; this module keeps a
 * read model of it (CompositeItemCache) and freezes a per-work-order
 * requirement snapshot (WorkOrderLine) so a later composite-item edit cannot
 * retroactively rewrite a work order that has already moved material.
 *
 * The uploaded spreadsheet is parsed in the browser and arrives here as
 * [{ sku?, name?, qty }] — no file handling, no parser dependency in the
 * function.
 */
const { rowList, zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { getCompositeItem } = require("../zoho/inventoryApi");
const { logActivity, byOrg, inList } = require("./store");

const n = (v) => Number(v) || 0;
// Composite items rarely change; a work order opened repeatedly in a day should
// not re-fetch. Explicit "Refresh BOM" always bypasses this.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ---- composite item read model -------------------------------------------

// Live fetch → upsert CompositeItemCache. The only place this module calls Zoho.
async function refreshComposite(catalyst, orgId, fgItemId) {
  const comp = await getCompositeItem(catalyst, fgItemId);
  const fields = {
    orgId: String(orgId),
    fgItemId: String(fgItemId),
    name: comp.name || "",
    sku: comp.sku || "",
    mappedItems: JSON.stringify(comp.mapped_items || []),
    syncedAt: dsDate(Date.now()),
  };
  const existing = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM CompositeItemCache WHERE orgId = ${zStr(String(orgId))} AND fgItemId = ${zStr(String(fgItemId))}`,
    ),
  );
  const table = catalyst.datastore().table("CompositeItemCache");
  if (existing.length) await table.updateRow({ ROWID: existing[0].ROWID, ...fields });
  else await table.insertRow(fields);
  return { ...fields, mappedItems: comp.mapped_items || [] };
}

// Cache-first read. `force` is the "Refresh BOM" button.
async function getComposite(catalyst, orgId, fgItemId, force) {
  if (!force) {
    const rows = await byOrg(catalyst, orgId, "CompositeItemCache", `fgItemId = ${zStr(String(fgItemId))}`);
    if (rows.length) {
      const age = Date.now() - new Date(rows[0].syncedAt).getTime();
      if (!(age > CACHE_TTL_MS)) {
        return { ...rows[0], mappedItems: safeParse(rows[0].mappedItems, []) };
      }
    }
  }
  return refreshComposite(catalyst, orgId, fgItemId);
}

function safeParse(text, fallback) {
  try { return JSON.parse(text || ""); } catch { return fallback; }
}

// ---- pure BOM shaping -----------------------------------------------------

// composite_item.mapped_items[] × FG qty → the requirement lines (column A).
function linesFromComposite(mappedItems, fgQty) {
  return (mappedItems || []).map((m) => ({
    rmItemId: String(m.item_id),
    rmName: m.name || "",
    rmSku: m.sku || "",
    uom: m.unit || "",
    perUnitQty: n(m.quantity),
    requiredQty: n(m.quantity) * n(fgQty),
    source: "composite",
  }));
}

/**
 * Match uploaded spreadsheet rows against the known items (from the composite
 * item, plus any item already on the work order). Matching is by SKU first,
 * then by exact name, both case-insensitively — a store team types either.
 * Rows that match nothing come back in `unmatched` for the user to fix; they
 * are never silently dropped.
 */
function matchUpload(uploadRows, knownItems, fgQty) {
  const bySku = new Map();
  const byName = new Map();
  for (const it of knownItems) {
    if (it.rmSku) bySku.set(String(it.rmSku).trim().toLowerCase(), it);
    if (it.rmName) byName.set(String(it.rmName).trim().toLowerCase(), it);
  }
  const lines = [];
  const unmatched = [];
  for (const row of uploadRows || []) {
    const sku = row.sku === undefined || row.sku === null ? "" : String(row.sku).trim();
    const name = row.name === undefined || row.name === null ? "" : String(row.name).trim();
    const hit = (sku && bySku.get(sku.toLowerCase())) || (name && byName.get(name.toLowerCase())) || null;
    if (!hit) {
      unmatched.push({ sku, name, qty: n(row.qty) });
      continue;
    }
    // The sheet carries the total requirement; per-unit is derived from it.
    const requiredQty = n(row.qty);
    lines.push({
      rmItemId: hit.rmItemId,
      rmName: hit.rmName,
      rmSku: hit.rmSku,
      uom: hit.uom || "",
      perUnitQty: n(fgQty) ? requiredQty / n(fgQty) : requiredQty,
      requiredQty,
      source: "excel",
    });
  }
  return { lines, unmatched };
}

/**
 * Three-way BOM diff, keyed by Zoho item id. Drives the coloured import
 * preview: green = new, amber = qty changed, red = removed, grey = unchanged.
 * Pure — this is the function the import screen is worth testing through.
 */
function diffBom(currentLines, incomingLines) {
  const cur = new Map((currentLines || []).map((l) => [String(l.rmItemId), l]));
  const inc = new Map((incomingLines || []).map((l) => [String(l.rmItemId), l]));
  const lines = [];
  const summary = { added: [], removed: [], changed: [] };

  for (const [id, line] of inc) {
    const before = cur.get(id);
    if (!before) {
      lines.push({ ...line, diffStatus: "new", prevQty: null });
      summary.added.push({ rmItemId: id, name: line.rmName, qty: line.requiredQty });
    } else if (n(before.requiredQty) !== n(line.requiredQty)) {
      lines.push({ ...line, diffStatus: "qtyChanged", prevQty: n(before.requiredQty) });
      summary.changed.push({ rmItemId: id, name: line.rmName, from: n(before.requiredQty), to: n(line.requiredQty) });
    } else {
      lines.push({ ...line, diffStatus: "unchanged", prevQty: null });
    }
  }
  for (const [id, line] of cur) {
    if (inc.has(id)) continue;
    lines.push({ ...line, diffStatus: "removed", prevQty: n(line.requiredQty), requiredQty: 0 });
    summary.removed.push({ rmItemId: id, name: line.rmName, qty: n(line.requiredQty) });
  }
  return { lines, summary, changeCount: summary.added.length + summary.removed.length + summary.changed.length };
}

/**
 * A line that has already moved material cannot be dropped by an import — the
 * quantity is physically in the Reserve or Issue warehouse. Import may still
 * reduce it, but not below what is already committed.
 */
function guardAgainstCommitted(diffLines, balances) {
  const bal = new Map((balances || []).map((b) => [String(b.componentItemId || b.rmItemId), b]));
  const blocked = [];
  for (const line of diffLines) {
    const b = bal.get(String(line.rmItemId));
    if (!b) continue;
    const committed = n(b.reservedQty) + n(b.issuedQty) - n(b.returnedQty);
    if (committed <= 0) continue;
    if (line.diffStatus === "removed") {
      blocked.push(`${line.rmName || line.rmItemId}: ${committed} already reserved/issued — de-reserve and return it before removing this item from the BOM`);
    } else if (n(line.requiredQty) < committed) {
      blocked.push(`${line.rmName || line.rmItemId}: cannot reduce to ${line.requiredQty} — ${committed} is already reserved/issued`);
    }
  }
  return blocked;
}

// ---- persistence ----------------------------------------------------------

// Current frozen lines of a work order (optionally one FG).
async function currentLines(catalyst, orgId, workOrderId, workOrderFgId) {
  let where = `workOrderId = ${zStr(String(workOrderId))}`;
  if (workOrderFgId) where += ` AND workOrderFgId = ${zStr(String(workOrderFgId))}`;
  return byOrg(catalyst, orgId, "WorkOrderLine", where);
}

/**
 * Replace the frozen lines for one FG with `diffLines` and record a revision.
 * `removed` lines are deleted rather than kept at qty 0 — the BomRevision
 * summary is where the history lives.
 */
async function applyBom(catalyst, orgId, wo, fg, diffLines, summary, userId, opts = {}) {
  const table = catalyst.datastore().table("WorkOrderLine");
  const existing = await currentLines(catalyst, orgId, wo.ROWID, fg.ROWID);
  const byItem = new Map(existing.map((r) => [String(r.rmItemId), r]));
  const revision = n(wo.revision) + (opts.bumpRevision === false ? 0 : 1);

  for (const line of diffLines) {
    const prev = byItem.get(String(line.rmItemId));
    if (line.diffStatus === "removed") {
      if (prev) await table.deleteRow(prev.ROWID);
      continue;
    }
    const fields = {
      orgId: String(orgId),
      workOrderId: String(wo.ROWID),
      workOrderFgId: String(fg.ROWID),
      rmItemId: String(line.rmItemId),
      rmName: line.rmName || "",
      rmSku: line.rmSku || "",
      uom: line.uom || "",
      perUnitQty: n(line.perUnitQty),
      requiredQty: n(line.requiredQty),
      source: line.source || "composite",
      diffStatus: line.diffStatus || "unchanged",
      prevQty: line.prevQty === null || line.prevQty === undefined ? 0 : n(line.prevQty),
      revision,
    };
    if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
    else await table.insertRow(fields);
  }

  await catalyst.datastore().table("BomRevision").insertRow({
    orgId: String(orgId),
    workOrderId: String(wo.ROWID),
    revision,
    changedBy: userId ? String(userId) : "",
    changedAt: dsDate(Date.now()),
    summary: JSON.stringify(summary || {}),
    pushedToZoho: false,
    zohoCompositeUpdatedAt: null,
  });

  await catalyst.datastore().table("WorkOrder").updateRow({
    ROWID: String(wo.ROWID),
    revision,
    bomImportedAt: dsDate(Date.now()),
  });

  await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "bom.revise", userId, { revision, summary });
  return { revision, lines: diffLines.filter((l) => l.diffStatus !== "removed").length };
}

// Balances for the guard + grid, keyed by component item id.
async function balancesFor(catalyst, orgId, workOrderId, workOrderFgId) {
  let where = `workOrderId = ${zStr(String(workOrderId))}`;
  if (workOrderFgId) where += ` AND workOrderFgId = ${zStr(String(workOrderFgId))}`;
  const rows = await byOrg(catalyst, orgId, "ReservationLine", where);
  return new Map(rows.map((r) => [String(r.componentItemId), r]));
}

module.exports = {
  CACHE_TTL_MS, refreshComposite, getComposite, linesFromComposite, matchUpload,
  diffBom, guardAgainstCommitted, currentLines, applyBom, balancesFor, safeParse, inList,
};

// ponytail self-check: `node functions/skuapi/workorder/bom.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  // Composite → requirement lines: per-unit qty × FG qty.
  const mapped = [
    { item_id: 11, name: "Shaft", sku: "SH-1", quantity: 2, unit: "nos" },
    { item_id: 22, name: "Seal", sku: "SL-9", quantity: 1 },
  ];
  const lines = linesFromComposite(mapped, 3);
  assert.strictEqual(lines.length, 2);
  assert.deepStrictEqual(
    lines[0],
    { rmItemId: "11", rmName: "Shaft", rmSku: "SH-1", uom: "nos", perUnitQty: 2, requiredQty: 6, source: "composite" },
  );
  assert.strictEqual(lines[1].requiredQty, 3, "1 per unit × 3 FG = 3");
  assert.deepStrictEqual(linesFromComposite(null, 5), [], "missing mapped_items is not a crash");

  // Diff: added / changed / removed / unchanged.
  const current = [
    { rmItemId: "11", rmName: "Shaft", requiredQty: 6 },
    { rmItemId: "22", rmName: "Seal", requiredQty: 3 },
    { rmItemId: "33", rmName: "Gasket", requiredQty: 1 },
  ];
  const incoming = [
    { rmItemId: "11", rmName: "Shaft", requiredQty: 6 },
    { rmItemId: "22", rmName: "Seal", requiredQty: 5 },
    { rmItemId: "44", rmName: "Impeller", requiredQty: 2 },
  ];
  const d = diffBom(current, incoming);
  const status = Object.fromEntries(d.lines.map((l) => [l.rmItemId, l.diffStatus]));
  assert.strictEqual(status["11"], "unchanged");
  assert.strictEqual(status["22"], "qtyChanged");
  assert.strictEqual(status["44"], "new");
  assert.strictEqual(status["33"], "removed");
  assert.strictEqual(d.lines.find((l) => l.rmItemId === "22").prevQty, 3, "previous qty is kept for the diff view");
  assert.strictEqual(d.changeCount, 3, "one add, one change, one removal");
  assert.deepStrictEqual(d.summary.added, [{ rmItemId: "44", name: "Impeller", qty: 2 }]);
  assert.deepStrictEqual(d.summary.removed, [{ rmItemId: "33", name: "Gasket", qty: 1 }]);
  assert.deepStrictEqual(d.summary.changed, [{ rmItemId: "22", name: "Seal", from: 3, to: 5 }]);

  // First import against an empty work order: everything is new, nothing removed.
  const first = diffBom([], incoming);
  assert.strictEqual(first.summary.added.length, 3);
  assert.strictEqual(first.summary.removed.length, 0);

  // Committed material blocks destructive imports.
  const balances = [{ componentItemId: "33", reservedQty: 1, issuedQty: 0, returnedQty: 0 }];
  const blocked = guardAgainstCommitted(d.lines, balances);
  assert.strictEqual(blocked.length, 1, "removing an item with reserved stock is blocked");
  assert.match(blocked[0], /de-reserve and return it/, "the message says how to unblock");
  assert.strictEqual(
    guardAgainstCommitted(d.lines, [{ componentItemId: "33", reservedQty: 0, issuedQty: 0, returnedQty: 0 }]).length,
    0,
    "nothing committed → removal is fine",
  );
  assert.strictEqual(
    guardAgainstCommitted(
      [{ rmItemId: "22", rmName: "Seal", requiredQty: 1, diffStatus: "qtyChanged" }],
      [{ componentItemId: "22", reservedQty: 3, issuedQty: 0, returnedQty: 0 }],
    ).length,
    1,
    "cannot cut a requirement below what is already reserved",
  );
  assert.strictEqual(
    guardAgainstCommitted(
      [{ rmItemId: "22", requiredQty: 5, diffStatus: "qtyChanged" }],
      [{ componentItemId: "22", reservedQty: 3, issuedQty: 1, returnedQty: 1 }],
    ).length,
    0,
    "returns count against the committed quantity",
  );

  // Upload matching: by SKU, by name, case-insensitive, unmatched surfaced.
  const known = [
    { rmItemId: "11", rmName: "Shaft", rmSku: "SH-1", uom: "nos" },
    { rmItemId: "22", rmName: "Seal", rmSku: "SL-9" },
  ];
  const m = matchUpload(
    [{ sku: " sh-1 ", qty: 12 }, { name: "SEAL", qty: 4 }, { name: "Mystery Part", qty: 9 }],
    known, 3,
  );
  assert.strictEqual(m.lines.length, 2);
  assert.strictEqual(m.lines[0].rmItemId, "11", "SKU match wins, trimmed and case-insensitive");
  assert.strictEqual(m.lines[0].perUnitQty, 4, "12 total ÷ 3 FG = 4 per unit");
  assert.strictEqual(m.lines[1].rmItemId, "22", "name match, case-insensitive");
  assert.deepStrictEqual(m.unmatched, [{ sku: "", name: "Mystery Part", qty: 9 }], "unmatched rows are reported, not dropped");
  assert.strictEqual(matchUpload([{ sku: "SH-1", qty: 5 }], known, 0).lines[0].perUnitQty, 5, "zero FG qty does not divide by zero");

  assert.deepStrictEqual(safeParse("[1,2]", []), [1, 2]);
  assert.deepStrictEqual(safeParse("not json", []), [], "bad cache JSON degrades to empty, not a crash");

  console.log("workorder/bom.js self-check passed");
}
