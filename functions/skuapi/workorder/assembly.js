"use strict";

/**
 * Auto assembly (CR-126): turn issued material into finished-good stock.
 * Per FG, per quantity: push the WO's current BOM to the Zoho composite item,
 * then create a Zoho Inventory bundle that consumes the raw materials from the
 * Issue warehouse and produces the composite's stock in Main. Each produced
 * unit gets a serial from the org's year series (CR-150, serial.js). A fully
 * assembled FG closes; QC + Close stay manual (decided flow).
 */
const { zStr } = require("../store");
const { updateCompositeItem, getCompositeItem, createBundle, createTransferOrder } = require("../zoho/inventoryApi");
const { warehouses, logActivity, byOrg } = require("./store");
const bom = require("./bom");
const { loadContext, trackingProblem } = require("./txn");
const { buildGrid } = require("./grid");
const { fullyIssued } = require("./formulas");
const { serialPrefix, normalizePrefix, nextSerials } = require("./serial");
// CR-172: any shop-floor stage, once the FG's material is fully issued; Completed requires one.
const { ASSEMBLABLE } = require("./status");

const n = (v) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

// WoAssembly.serialNumbers is text(10000) — ~12 chars per serial.
const MAX_UNITS = 700;

// Shared by assemble + preview (CR-155).
function checkAssemblable(wo, fg, qty) {
  if (!ASSEMBLABLE.includes(String(wo.status))) {
    const e = new Error(`${wo.woNumber} is ${wo.status} — move it to Ready for Machining before assembling`);
    e.status = 409; throw e;
  }
  const fgQty = n(fg.fgQty);
  const assembled = n(fg.assembledQty);
  const remaining = fgQty - assembled;
  if (remaining <= 0) { const e = new Error(`"${fg.fgName}" is fully assembled`); e.status = 409; throw e; }
  if (qty <= 0 || qty > remaining) {
    const e = new Error(`Quantity must be between 1 and ${remaining} (${assembled} of ${fgQty} already assembled)`);
    e.status = 400; throw e;
  }
  if (qty > MAX_UNITS) { const e = new Error(`Assemble at most ${MAX_UNITS} units at a time — split the assembly`); e.status = 400; throw e; }
  return { fgQty, assembled, remaining };
}

// Prefix the modal sent, else the derived prefill; "" only when `lenient`.
async function resolvePrefix(catalyst, orgId, fg, prefix, lenient) {
  if (prefix != null && String(prefix).trim() !== "") return normalizePrefix(prefix);
  const derived = await serialPrefix(catalyst, orgId, fg);
  if (derived) return normalizePrefix(derived);
  if (lenient) return "";
  const e = new Error(`"${fg.fgName}": enter a serial prefix (e.g. KGV)`);
  e.status = 400; throw e;
}

// Pure: what `qty` units consume. Per-unit × qty; fall back to
// requiredQty/fgQty for lines imported without perUnitQty (excel/manual rows).
// Rounded to 4 dp so 0.1 × 3 is 0.3 everywhere (picker, pick check, Zoho).
function componentQtys(lines, qty, fgQty) {
  return lines
    .filter((l) => n(l.requiredQty) > 0)
    .map((l) => ({
      rmItemId: String(l.rmItemId),
      name: l.rmName,
      qty: Math.round((n(l.perUnitQty) > 0 ? n(l.perUnitQty) * qty : fgQty > 0 ? (n(l.requiredQty) / fgQty) * qty : 0) * 1e4) / 1e4,
    }))
    .filter((c) => c.qty > 0);
}

// Pure (CR-176): overlay the modal's picks ([{ itemId, tracking }]) onto the
// components; every pick must cover its line's qty exactly. Returns the
// problems (all of them) so the user fixes the form in one pass.
function applyPicks(components, picks) {
  const problems = [];
  for (const p of picks || []) {
    const c = components.find((x) => x.rmItemId === String(p.itemId));
    if (!c || !p.tracking) continue;
    const problem = trackingProblem(p.tracking, c.qty, c.name || c.rmItemId);
    if (problem) problems.push(problem); else c.tracking = p.tracking;
  }
  return problems;
}

// What the next assembly would assign — never commits the counter (CR-155) —
// plus the components it would consume, for the batch picker (CR-176).
async function previewAssembly(catalyst, orgId, workOrderId, fgId, qty, prefix) {
  qty = n(qty);
  const { wo, fg } = await loadContext(catalyst, orgId, workOrderId, fgId);
  const { fgQty, remaining } = checkAssemblable(wo, fg, qty);
  const p = await resolvePrefix(catalyst, orgId, fg, prefix, true);
  const serials = p ? (await nextSerials(catalyst, orgId, p, qty)).serials : [];
  const components = componentQtys(await bom.currentLines(catalyst, orgId, wo.ROWID, fg.ROWID), qty, fgQty)
    .map((c) => ({ itemId: c.rmItemId, name: c.name, qty: c.qty }));
  return {
    prefix: p, serials, serialRange: serialRange(serials), remaining,
    components, fromWarehouseId: (await warehouses(catalyst, orgId)).issue,
  };
}

async function assembleFg(catalyst, orgId, workOrderId, fgId, qty, userId, prefixIn, picks) {
  qty = n(qty);
  const { wo, fg } = await loadContext(catalyst, orgId, workOrderId, fgId);
  const { fgQty, assembled } = checkAssemblable(wo, fg, qty);
  // Every BOM line issued before anything is consumed (CR-172). Not in the
  // preview — that fires per keystroke and the tab already lists only ready FGs.
  const grid = await buildGrid(catalyst, orgId, wo, fg);
  if (!fullyIssued(grid.rows)) {
    const open = grid.rows.filter((r) => r.bom > 0 && r.issued < r.bom).length;
    const e = new Error(`"${fg.fgName}": issue all material first — ${open} line(s) not fully issued`);
    e.status = 409; throw e;
  }
  const prefix = await resolvePrefix(catalyst, orgId, fg, prefixIn, false);

  // Assembly consumes the WO's CURRENT bom. Picks are checked here, before
  // anything touches Zoho or the serial counter — a bad pick changes nothing.
  const lines = await bom.currentLines(catalyst, orgId, wo.ROWID, fg.ROWID);
  const components = componentQtys(lines, qty, fgQty);
  if (!components.length) { const e = new Error("This finished good has no BOM lines to consume"); e.status = 400; throw e; }
  const problems = applyPicks(components, picks);
  if (problems.length) {
    const e = new Error(problems.join("; ")); e.status = 400; e.details = problems; throw e;
  }

  // The FG must already be a Zoho composite — there is no API to convert a
  // plain item, and creating a new composite would produce stock of a
  // different item than the Sales Order's (decided: block with instructions).
  try {
    await getCompositeItem(catalyst, fg.fgItemId);
  } catch {
    const e = new Error(
      `"${fg.fgName}" is not a composite item in Zoho Inventory — create it as a composite there (same SKU on the Sales Order) before assembling`,
    );
    e.status = 400; throw e;
  }

  // Push any WO-side BOM edits to the composite first so Zoho and the WO agree
  // on what goes into one unit. Best-effort: a failed push must not block
  // production (bundle lines below are explicit anyway).
  try {
    await updateCompositeItem(catalyst, fg.fgItemId, lines.filter((l) => n(l.requiredQty) > 0));
    await bom.refreshComposite(catalyst, orgId, fg.fgItemId);
  } catch (err) {
    console.error("composite push before assembly failed:", err && err.message);
  }

  const wh = await warehouses(catalyst, orgId);
  const seq = (await byOrg(catalyst, orgId, "WoAssembly", `workOrderFgId = ${zStr(String(fg.ROWID))}`)).length + 1;
  const referenceNumber = `${wo.woNumber}-A${seq}`;
  const { serials, commit } = await nextSerials(catalyst, orgId, prefix, qty);

  let bundle;
  try {
    bundle = await createBundle(catalyst, {
      date: today(),
      referenceNumber,
      compositeItemId: fg.fgItemId,
      compositeItemName: fg.fgName,
      compositeItemSku: fg.fgSku,
      qty,
      components,
      finishedSerials: serials,
      fromWarehouseId: wh.issue,
      description: `Assembly for ${wo.woNumber} / ${wo.salesOrderNumber || "SO"}`,
    });
  } catch (err) {
    const e = new Error(`Zoho could not create the assembly: ${err.message}`);
    e.status = err.status || 502; throw e;
  }
  await commit(); // numbers are spent only once Zoho has them

  // The bundle produced the FG at Issue (single-location assembly, CR-175);
  // move it to Main. Best effort — the bundle already exists, so a failed
  // transfer is reported, not thrown, and the stock waits in Issue.
  // ponytail: a batch-tracked FG gets FIFO auto-pick at Issue (no batch_id
  // comes back from the bundle); pass the bundle's batch if that ever matters.
  let transferOrderNumber = null, transferWarning = null;
  try {
    const to = await createTransferOrder(catalyst, {
      date: today(),
      fromWarehouseId: wh.issue,
      toWarehouseId: wh.main,
      reason: `Finished good from ${referenceNumber} — ${wo.woNumber}`,
      numberHint: referenceNumber,
      lines: [{ rmItemId: fg.fgItemId, name: fg.fgName, qty, ...(serials.length ? { tracking: { serials } } : {}) }],
    });
    transferOrderNumber = to.transfer_order_number || null;
  } catch (err) {
    console.error("FG transfer after assembly failed:", err && err.message);
    transferWarning = `Assembled, but the finished good could not be moved to Main: ${err.message}. It is in the Issue warehouse — transfer it in Zoho.`;
  }

  await catalyst.datastore().table("WoAssembly").insertRow({
    orgId: String(orgId),
    workOrderId: String(wo.ROWID),
    workOrderFgId: String(fg.ROWID),
    fgItemId: String(fg.fgItemId),
    qty,
    zohoBundleId: String(bundle.bundle_id || ""),
    zohoBundleNumber: String(bundle.transaction_number || referenceNumber),
    serialNumbers: JSON.stringify(serials),
    createdBy: userId ? String(userId) : "",
  });

  const newAssembled = assembled + qty;
  const fgStatus = newAssembled >= fgQty ? "Closed" : "";
  await catalyst.datastore().table("WorkOrderFG").updateRow({
    ROWID: String(fg.ROWID), assembledQty: newAssembled, status: fgStatus,
  });
  await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "fg.assemble", userId, {
    fgName: fg.fgName, qty, bundleNumber: bundle.transaction_number || referenceNumber, serials: serialRange(serials),
    transferOrderNumber, transferWarning,
  });

  return {
    ok: true,
    bundleId: String(bundle.bundle_id || ""),
    bundleNumber: bundle.transaction_number || referenceNumber,
    transferOrderNumber,
    transferWarning,
    assembledQty: newAssembled,
    fgStatus: fgStatus || null,
    woStatus: String(wo.status),
    serials,
    serialRange: serialRange(serials),
  };
}

const serialRange = (s) => (s.length > 1 ? `${s[0]}–${s[s.length - 1]}` : s[0] || "");
const parseSerials = (json) => { try { return JSON.parse(json || "[]"); } catch { return []; } };

// Prior assemblies of a work order, newest first — for the Items tab cards.
async function listAssemblies(catalyst, orgId, workOrderId) {
  return (await byOrg(catalyst, orgId, "WoAssembly", `workOrderId = ${zStr(String(workOrderId))}`, "CREATEDTIME DESC"))
    .map((a) => ({
      id: String(a.ROWID),
      workOrderFgId: String(a.workOrderFgId),
      qty: n(a.qty),
      bundleNumber: a.zohoBundleNumber || null,
      serialRange: serialRange(parseSerials(a.serialNumbers)),
      createdAt: a.CREATEDTIME,
    }));
}

module.exports = { assembleFg, previewAssembly, listAssemblies, componentQtys, applyPicks };

// ponytail self-check: `node functions/skuapi/workorder/assembly.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const lines = [
    { rmItemId: 1, rmName: "Body", perUnitQty: 0.1, requiredQty: 1 },
    { rmItemId: 2, rmName: "Seat", perUnitQty: 0, requiredQty: 20 },
    { rmItemId: 3, rmName: "Gone", perUnitQty: 1, requiredQty: 0 },
  ];
  const c = componentQtys(lines, 3, 10);
  assert.deepStrictEqual(c, [
    { rmItemId: "1", name: "Body", qty: 0.3 },
    { rmItemId: "2", name: "Seat", qty: 6 },
  ], "per-unit × qty rounded, requiredQty/fgQty fallback, zero lines dropped");
  const okPick = { batches: [{ batch_id: "b", batch_number: "B1", qty: 0.3 }] };
  assert.deepStrictEqual(applyPicks(c, [{ itemId: 1, tracking: okPick }, { itemId: 9, tracking: okPick }]), []);
  assert.strictEqual(c[0].tracking, okPick, "pick attached to its component");
  assert.match(applyPicks(c, [{ itemId: 2, tracking: { batches: [{ batch_id: "b", qty: 5 }] } }])[0], /add to 5, expected 6/);
  assert.strictEqual(c[1].tracking, undefined, "bad pick not attached");
  console.log("workorder/assembly.js self-check passed");
}
