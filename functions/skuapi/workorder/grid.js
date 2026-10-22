"use strict";

/**
 * Assembles the A–I grid for one work order FG.
 *
 * Every input is read from our own Data Store — the frozen BOM lines, the stock
 * snapshot, our reservation balances and our purchase-request lines. Opening a
 * work order therefore costs **zero** Zoho API calls; freshness comes from the
 * webhook sink and the nightly reconcile in sync.js. The one exception: an item
 * with no snapshot row at all is pulled live once (self-heal below) — otherwise
 * it reads as zero stock and every new work order opens with a false shortage.
 */
const { zStr } = require("../store");
const { gridRow, componentQtys, assemblable } = require("./formulas");
const { byOrg, inList, warehouses } = require("./store");
const { blockedFor } = require("./blocks");
const { soQtyPending } = require("./soFields");

const n = (v) => Number(v) || 0;

// Column B excludes units blocked as defective (CR-203): they sit in Main
// physically but must not be reserved again. Mutates `stock`; returns the
// block map so the rows can also see what is still parked in Issue (CR-280).
async function applyBlockedStock(catalyst, orgId, stock) {
  const blocked = await blockedFor(catalyst, orgId);
  for (const [id, e] of blocked) {
    const s = stock.get(id);
    if (s && e.qty) s.stockOnHand = Math.max(0, n(s.stockOnHand) - e.qty);
  }
  return blocked;
}

/**
 * Columns E / F / G per raw material: summed from the purchase-request lines of
 * this work order, not from the item-level snapshot. The BRD tracks PO against
 * the project, and it means the reconcile only ever refreshes POs we created.
 */
async function poSums(catalyst, orgId, workOrderId) {
  const prs = await byOrg(catalyst, orgId, "PurchaseRequest", `workOrderId = ${zStr(String(workOrderId))}`);
  const ids = inList(prs.filter((p) => p.status !== "Cancelled").map((p) => p.ROWID));
  const sums = new Map();
  if (!ids) return sums;
  const lines = await byOrg(catalyst, orgId, "PurchaseRequestLine", `purchaseRequestId IN (${ids})`);
  for (const l of lines) {
    if (!l.zohoPoId) continue; // not ordered yet — nothing is on order
    // CR-285: a unit-converted line counts for its source item, in source units.
    const key = String(l.srcItemId || l.rmItemId);
    const f = n(l.convFactor) || 1;
    const cur = sums.get(key) || { poQty: 0, receivedQty: 0, billedQty: 0 };
    cur.poQty += n(l.purchaseQty) / f;
    cur.receivedQty += n(l.receivedQty) / f;
    cur.billedQty += n(l.billedQty) / f;
    sums.set(key, cur);
  }
  return sums;
}

/**
 * Column B per item. Reserving pulls from the Main warehouse, so that is the
 * stock that caps it — the org total would over-promise material sitting in
 * the Reserve or Issue warehouse. Falls back to the org-total row when no
 * per-warehouse row has been synced yet.
 */
async function stockMap(catalyst, orgId, itemIds, mainWarehouseId) {
  const ids = inList(itemIds);
  const map = new Map();
  if (!ids) return { map, lastSyncAt: null };
  const rows = await byOrg(catalyst, orgId, "ItemStockSnapshot", `itemId IN (${ids})`);
  let lastSyncAt = null;
  for (const r of rows) {
    const key = String(r.itemId);
    const isMain = mainWarehouseId && String(r.warehouseId) === String(mainWarehouseId);
    const isTotal = !r.warehouseId;
    if (!isMain && !isTotal) continue;
    // A per-warehouse row always beats the org total.
    const prev = map.get(key);
    if (!prev || (isMain && !prev.__main)) map.set(key, { stockOnHand: n(r.stockOnHand), __main: isMain });
    if (r.syncedAt && (!lastSyncAt || r.syncedAt > lastSyncAt)) lastSyncAt = r.syncedAt;
  }
  return { map, lastSyncAt };
}

// Our reservation balances (columns C / D) for one FG, keyed by item id.
async function balanceMap(catalyst, orgId, workOrderId, workOrderFgId) {
  const rows = await byOrg(
    catalyst, orgId, "ReservationLine",
    `workOrderId = ${zStr(String(workOrderId))} AND workOrderFgId = ${zStr(String(workOrderFgId))}`,
  );
  return new Map(rows.map((r) => [String(r.componentItemId), r]));
}

// Pure tail of the grid build: everything already loaded, just compute.
function assemble(wo, fg, lines, stock, balances, po, lastSyncAt, mainWarehouseId, blocked) {
  // Material already consumed by assemblies (CR-230): caps Return / Replace.
  const consumed = new Map(componentQtys(lines, n(fg.assembledQty), n(fg.fgQty)).map((c) => [c.rmItemId, c.qty]));
  // Defective units of this FG whose return TO has not fired yet (CR-280).
  const fgKey = `${wo.ROWID}|${fg.ROWID}`;
  const defective = (itemId) => { const e = blocked && blocked.get(itemId); return e ? e.issue.byFg.get(fgKey) || 0 : 0; };
  const rows = lines.map((l) =>
    gridRow(l, stock.get(String(l.rmItemId)), balances.get(String(l.rmItemId)), po.get(String(l.rmItemId)),
      consumed.get(String(l.rmItemId)) || 0, defective(String(l.rmItemId))),
  );

  return {
    workOrderId: String(wo.ROWID),
    workOrderFgId: String(fg.ROWID),
    fgItemId: String(fg.fgItemId),
    fgName: fg.fgName,
    fgSize: fg.fgSize || "",
    fgQty: n(fg.fgQty),
    // CR-204: the SO line's current qty + whether it differs from what was acknowledged.
    soQty: fg.soQty === null || fg.soQty === undefined || fg.soQty === "" ? null : n(fg.soQty),
    soQtyChanged: soQtyPending(fg),
    revision: n(wo.revision),
    lastSyncAt,
    warehousesConfigured: Boolean(mainWarehouseId),
    // CR-277: units the issued material covers + the lines holding the rest back.
    assembly: assemblable(rows, fg),
    rows,
  };
}

// Self-heal: never-synced items read as zero stock → false shortage, and an
// item with only the org-total row reads as the org total → over-promises B and
// lets a reserve drive the Main warehouse negative. Pull either live once (in
// parallel — bounded by BOM size); the webhook/reconcile keeps them fresh from
// then on. Mutates `stock`.
async function healStock(catalyst, orgId, stock, itemIds, mainWarehouseId) {
  // ponytail: an item whose Zoho detail carries no breakdown at all stays
  // !__main and re-heals on every grid open (one call per item); add a
  // cooldown if an org without per-warehouse tracking ever connects.
  const missing = [...new Set(itemIds.filter((id) => {
    const s = stock.get(id);
    return !s || (mainWarehouseId && !s.__main);
  }))];
  if (!missing.length) return;
  const { getItemStock } = require("../zoho/inventoryApi");
  const { writeStock } = require("./sync");
  await Promise.all(missing.map(async (itemId) => {
    try {
      await writeStock(catalyst, orgId, await getItemStock(catalyst, itemId), "grid");
    } catch (err) {
      console.error(`stock self-heal ${itemId}:`, err && err.message);
    }
  }));
  const healed = await stockMap(catalyst, orgId, missing, mainWarehouseId);
  for (const [k, v] of healed.map) stock.set(k, v);
}

/**
 * The grid for one FG of one work order. `wo` and `fg` are the raw rows.
 * Returns rows in BOM order plus the banner metadata the page shows.
 */
async function buildGrid(catalyst, orgId, wo, fg) {
  const lines = await byOrg(
    catalyst, orgId, "WorkOrderLine",
    `workOrderId = ${zStr(String(wo.ROWID))} AND workOrderFgId = ${zStr(String(fg.ROWID))}`,
  );
  const itemIds = lines.map((l) => String(l.rmItemId));

  // Warehouses may not be configured yet — the BOM tab must still render, so a
  // missing map degrades column B to the org total rather than failing the page.
  let mainWarehouseId = null;
  try {
    mainWarehouseId = (await warehouses(catalyst, orgId, wo)).main;
  } catch { /* not configured yet */ }

  const [{ map: stock, lastSyncAt }, balances, po] = await Promise.all([
    stockMap(catalyst, orgId, itemIds, mainWarehouseId),
    balanceMap(catalyst, orgId, wo.ROWID, fg.ROWID),
    poSums(catalyst, orgId, wo.ROWID),
  ]);

  await healStock(catalyst, orgId, stock, itemIds, mainWarehouseId);
  const blocked = await applyBlockedStock(catalyst, orgId, stock);

  return assemble(wo, fg, lines, stock, balances, po, lastSyncAt, mainWarehouseId, blocked);
}

/**
 * Grids for many (wo, fg) pairs at once — the reports/shortfall path. Loads
 * each table with one IN (...) query instead of ~6 queries per pair, then
 * assembles every grid in memory. Output per pair is identical to buildGrid,
 * except lastSyncAt is the max across the batch (no bulk consumer reads it).
 */
async function buildGridsBulk(catalyst, orgId, pairs) {
  if (!pairs.length) return [];
  const woIds = inList([...new Set(pairs.map((p) => String(p.wo.ROWID)))]);

  // CR-249: a WO may carry its own Main warehouse — stock is read per distinct
  // Main, one snapshot query each (Ricon has two factories; most orgs one).
  let orgMain = null;
  try {
    orgMain = (await warehouses(catalyst, orgId)).main;
  } catch { /* not configured yet */ }
  const mainOf = (wo) => (wo.mainWarehouseId ? String(wo.mainWarehouseId) : orgMain);

  const [allLines, allBalances, allPrs] = await Promise.all([
    byOrg(catalyst, orgId, "WorkOrderLine", `workOrderId IN (${woIds})`),
    byOrg(catalyst, orgId, "ReservationLine", `workOrderId IN (${woIds})`),
    byOrg(catalyst, orgId, "PurchaseRequest", `workOrderId IN (${woIds})`),
  ]);

  // PO sums per work order (same accumulation as poSums, org-wide in one query).
  const prToWo = new Map();
  for (const p of allPrs) if (p.status !== "Cancelled") prToWo.set(String(p.ROWID), String(p.workOrderId));
  const prIds = inList([...prToWo.keys()]);
  const poByWo = new Map(); // woId -> Map(rmItemId -> sums)
  if (prIds) {
    const prLines = await byOrg(catalyst, orgId, "PurchaseRequestLine", `purchaseRequestId IN (${prIds})`);
    for (const l of prLines) {
      if (!l.zohoPoId) continue; // not ordered yet — nothing is on order
      const woId = prToWo.get(String(l.purchaseRequestId));
      if (!woId) continue;
      let sums = poByWo.get(woId);
      if (!sums) poByWo.set(woId, (sums = new Map()));
      const key = String(l.srcItemId || l.rmItemId); // CR-285, same as poSums
      const f = n(l.convFactor) || 1;
      const cur = sums.get(key) || { poQty: 0, receivedQty: 0, billedQty: 0 };
      cur.poQty += n(l.purchaseQty) / f;
      cur.receivedQty += n(l.receivedQty) / f;
      cur.billedQty += n(l.billedQty) / f;
      sums.set(key, cur);
    }
  }

  const itemIds = [...new Set(allLines.map((l) => String(l.rmItemId)))];
  const stockByMain = new Map();
  let lastSyncAt = null;
  let blocked = null;
  for (const mainWarehouseId of new Set(pairs.map((p) => mainOf(p.wo)))) {
    const { map: stock, lastSyncAt: at } = await stockMap(catalyst, orgId, itemIds, mainWarehouseId);
    await healStock(catalyst, orgId, stock, itemIds, mainWarehouseId);
    blocked = await applyBlockedStock(catalyst, orgId, stock);
    stockByMain.set(mainWarehouseId, stock);
    if (at && (!lastSyncAt || at > lastSyncAt)) lastSyncAt = at;
  }

  const pairKey = (woId, fgId) => `${woId}|${fgId}`;
  const linesByPair = new Map();
  for (const l of allLines) {
    const k = pairKey(String(l.workOrderId), String(l.workOrderFgId));
    let arr = linesByPair.get(k);
    if (!arr) linesByPair.set(k, (arr = []));
    arr.push(l);
  }
  const balByPair = new Map();
  for (const r of allBalances) {
    const k = pairKey(String(r.workOrderId), String(r.workOrderFgId));
    let m = balByPair.get(k);
    if (!m) balByPair.set(k, (m = new Map()));
    m.set(String(r.componentItemId), r);
  }

  const EMPTY = new Map();
  return pairs.map(({ wo, fg }) => {
    const k = pairKey(String(wo.ROWID), String(fg.ROWID));
    return assemble(
      wo, fg,
      linesByPair.get(k) || [],
      stockByMain.get(mainOf(wo)),
      balByPair.get(k) || EMPTY,
      poByWo.get(String(wo.ROWID)) || EMPTY,
      lastSyncAt, mainOf(wo), blocked,
    );
  });
}

// Row lookup for action validation — same numbers the user is looking at.
/**
 * Column B for one item outside any grid (CR-244): Main-warehouse stock,
 * self-healed if never synced, minus units blocked as defective.
 */
async function mainStock(catalyst, orgId, itemId, wo) {
  let mainWarehouseId = null;
  try { mainWarehouseId = (await warehouses(catalyst, orgId, wo)).main; } catch { /* not configured yet */ }
  const ids = [String(itemId)];
  const { map: stock } = await stockMap(catalyst, orgId, ids, mainWarehouseId);
  await healStock(catalyst, orgId, stock, ids, mainWarehouseId);
  await applyBlockedStock(catalyst, orgId, stock);
  return n((stock.get(String(itemId)) || {}).stockOnHand);
}

function indexRows(grid) {
  return new Map(grid.rows.map((r) => [String(r.itemId), r]));
}

module.exports = { buildGrid, buildGridsBulk, indexRows, poSums, stockMap, balanceMap, mainStock };

// ponytail self-check: `node functions/skuapi/workorder/grid.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  // Fake catalyst: canned rows per table, filtered by the = / IN clauses in the
  // query text (pattern from store.js --selftest, generalised to many tables).
  const DATA = {
    OrgSetting: [
      { orgId: "org1", settingKey: "mainWarehouseId", settingValue: "W1" },
      { orgId: "org1", settingKey: "reserveWarehouseId", settingValue: "W2" },
      { orgId: "org1", settingKey: "issueWarehouseId", settingValue: "W3" },
    ],
    WorkOrderLine: [
      { orgId: "org1", ROWID: "L1", workOrderId: "WO1", workOrderFgId: "FGA", rmItemId: "11", rmName: "Shaft", requiredQty: 10 },
      { orgId: "org1", ROWID: "L2", workOrderId: "WO1", workOrderFgId: "FGA", rmItemId: "22", rmName: "Seal", requiredQty: 4 },
      { orgId: "org1", ROWID: "L3", workOrderId: "WO1", workOrderFgId: "FGB", rmItemId: "11", rmName: "Shaft", requiredQty: 2 },
      { orgId: "org1", ROWID: "L4", workOrderId: "WO2", workOrderFgId: "FGC", rmItemId: "33", rmName: "Bolt", requiredQty: 7 },
    ],
    ItemStockSnapshot: [
      { orgId: "org1", itemId: "11", warehouseId: "W1", stockOnHand: 6, syncedAt: "2026-08-20 01:00:00" },
      { orgId: "org1", itemId: "22", warehouseId: "W1", stockOnHand: 50, syncedAt: "2026-08-20 01:00:00" },
      { orgId: "org1", itemId: "33", warehouseId: "W1", stockOnHand: 0, syncedAt: "2026-08-20 01:00:00" },
    ],
    ReservationLine: [
      { orgId: "org1", ROWID: "R1", workOrderId: "WO1", workOrderFgId: "FGA", componentItemId: "11", reservedQty: 3, issuedQty: 1, returnedQty: 0 },
    ],
    PurchaseRequest: [
      { orgId: "org1", ROWID: "PR1", workOrderId: "WO1", status: "Confirmed" },
      { orgId: "org1", ROWID: "PR2", workOrderId: "WO1", status: "Cancelled" },
    ],
    PurchaseRequestLine: [
      { orgId: "org1", ROWID: "PL1", purchaseRequestId: "PR1", rmItemId: "11", zohoPoId: "Z1", purchaseQty: 5, receivedQty: 2, billedQty: 1 },
      { orgId: "org1", ROWID: "PL2", purchaseRequestId: "PR2", rmItemId: "22", zohoPoId: "Z2", purchaseQty: 9, receivedQty: 0, billedQty: 0 },
    ],
    // CR-203: 5 Seals blocked as defective → B drops from 50 to 45; the repaired row does not count.
    // CR-280: 1 Shaft of WO1/FGA pulled as defective, return TO not fired → still in Issue.
    DefectReturn: [
      { orgId: "org1", ROWID: "D1", itemId: "22", status: "pending", qty: 5, returnedAt: "2026-10-07 10:00:00", trackingJson: "" },
      { orgId: "org1", ROWID: "D2", itemId: "22", status: "repaired", qty: 9, returnedAt: "2026-10-07 10:00:00", trackingJson: "" },
      { orgId: "org1", ROWID: "D3", itemId: "11", status: "pending", qty: 1, returnedAt: null, workOrderId: "WO1", workOrderFgId: "FGA", trackingJson: "" },
    ],
  };

  const fake = () => {
    let queries = 0;
    return {
      _count: () => queries,
      zcql: () => ({
        executeZCQLQuery: async (q) => {
          queries++;
          const table = q.match(/FROM (\w+)/)[1];
          const where = (q.split(/WHERE/i)[1] || "").split(/ORDER BY/i)[0];
          const conds = [];
          for (const m of where.matchAll(/(\w+) = '([^']*)'/g)) conds.push([m[1], [m[2]]]);
          for (const m of where.matchAll(/(\w+) IN \(([^)]*)\)/g)) {
            conds.push([m[1], m[2].split(",").map((s) => s.trim().replace(/^'|'$/g, ""))]);
          }
          return (DATA[table] || [])
            .filter((r) => conds.every(([c, vals]) => vals.includes(String(r[c]))))
            .map((r) => ({ [table]: { ...r } }));
        },
      }),
    };
  };

  (async () => {
    const wo1 = { ROWID: "WO1", revision: 1 };
    const wo2 = { ROWID: "WO2", revision: 0 };
    const fgA = { ROWID: "FGA", fgItemId: "F1", fgName: "Pump A", fgQty: 2, assembledQty: 1 };
    const fgB = { ROWID: "FGB", fgItemId: "F2", fgName: "Pump B", fgQty: 1 };
    const fgC = { ROWID: "FGC", fgItemId: "F3", fgName: "Pump C", fgQty: 3 };
    const pairs = [
      { wo: wo1, fg: fgA }, { wo: wo1, fg: fgB }, { wo: wo2, fg: fgC },
    ];

    const singles = [];
    for (const { wo, fg } of pairs) singles.push(await buildGrid(fake(), "org1", wo, fg));

    const c = fake();
    const bulk = await buildGridsBulk(c, "org1", pairs);
    assert.deepStrictEqual(bulk, singles, "bulk grids must equal per-pair buildGrid output");
    assert.ok(c._count() <= 7, `bulk must stay ~7 queries, used ${c._count()}`);
    assert.strictEqual(singles[0].rows[1].stock, 45, "blocked defective units are excluded from B");
    assert.strictEqual(singles[0].rows[0].stock, 6, "unblocked item untouched (defective Shaft is in Issue, not Main)");
    assert.strictEqual(singles[0].rows[0].defective, 1, "FGA's unreturned defective Shaft");
    assert.strictEqual(singles[1].rows[0].defective, 0, "same item under FGB: none");
    // One of two Pump A assembled → 5 Shaft consumed; D stays, nothing left to return.
    assert.strictEqual(singles[0].rows[0].issued, 1, "issued is not reduced by assembly");
    assert.strictEqual(singles[0].rows[0].consumed, 5, "10 required / 2 FG × 1 assembled");
    assert.strictEqual(singles[0].rows[0].returnable, 0, "1 issued − 5 consumed clamps to 0");
    assert.strictEqual(singles[1].rows[0].consumed, 0, "nothing assembled → nothing consumed");
    // Pump A: 2 ordered, 1 assembled; Shaft 1 issued − 5 consumed → 0 ready, both lines block.
    assert.strictEqual(singles[0].assembly.maxQty, 0);
    assert.deepStrictEqual(singles[0].assembly.blockers.map((b) => b.name), ["Shaft", "Seal"]);

    assert.deepStrictEqual(await buildGridsBulk(fake(), "org1", []), [], "no pairs → no grids, no queries");

    console.log("workorder/grid.js self-check passed");
  })().catch((err) => { console.error(err); process.exit(1); });
}
