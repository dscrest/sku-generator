"use strict";

/**
 * Auto assembly (CR-126): turn issued material into finished-good stock.
 * Per FG, per quantity: push the WO's current BOM to the Zoho composite item,
 * then create a Zoho Inventory bundle that consumes the raw materials from the
 * Issue warehouse and produces the composite's stock in Main. A fully
 * assembled FG closes; when every FG is assembled the WO moves to
 * QualityCheck — the user records QC and closes manually (decided flow).
 */
const { zStr } = require("../store");
const { updateCompositeItem, getCompositeItem, createBundle } = require("../zoho/inventoryApi");
const { warehouses, logActivity, byOrg } = require("./store");
const bom = require("./bom");
const { loadContext } = require("./txn");

const n = (v) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

// Statuses where assembling makes sense: material work is underway or done.
const ASSEMBLABLE = ["Approved", "MaterialAllocationPending", "ReadyForProduction", "InProgress", "QualityCheck", "Completed"];
// Statuses the full-assembly bump may advance FROM (never backwards from QC+).
const PRE_QC = ["Approved", "MaterialAllocationPending", "ReadyForProduction", "InProgress"];

async function assembleFg(catalyst, orgId, workOrderId, fgId, qty, userId) {
  qty = n(qty);
  const { wo, fg } = await loadContext(catalyst, orgId, workOrderId, fgId);
  if (!ASSEMBLABLE.includes(String(wo.status))) {
    const e = new Error(`${wo.woNumber} is ${wo.status} — approve the work order before assembling`);
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

  // Assembly consumes the WO's CURRENT bom — push any WO-side edits to the
  // composite first so Zoho and the WO agree on what goes into one unit.
  // Best-effort: a failed push must not block production (bundle lines below
  // are explicit anyway).
  const lines = (await byOrg(
    catalyst, orgId, "WorkOrderLine",
    `workOrderId = ${zStr(String(wo.ROWID))} AND workOrderFgId = ${zStr(String(fg.ROWID))}`,
  )).filter((l) => n(l.requiredQty) > 0);
  if (!lines.length) { const e = new Error("This finished good has no BOM lines to consume"); e.status = 400; throw e; }
  try {
    await updateCompositeItem(catalyst, fg.fgItemId, lines);
    await bom.refreshComposite(catalyst, orgId, fg.fgItemId);
  } catch (err) {
    console.error("composite push before assembly failed:", err && err.message);
  }

  // Per-unit consumption × qty; fall back to requiredQty/fgQty for lines
  // imported without perUnitQty (excel/manual rows).
  const components = lines
    .map((l) => ({
      rmItemId: l.rmItemId,
      name: l.rmName,
      qty: n(l.perUnitQty) > 0 ? n(l.perUnitQty) * qty : fgQty > 0 ? (n(l.requiredQty) / fgQty) * qty : 0,
    }))
    .filter((c) => c.qty > 0);

  const wh = await warehouses(catalyst, orgId);
  const seq = (await byOrg(catalyst, orgId, "WoAssembly", `workOrderFgId = ${zStr(String(fg.ROWID))}`)).length + 1;
  const referenceNumber = `${wo.woNumber}-A${seq}`;

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
      fromWarehouseId: wh.issue,
      toWarehouseId: wh.main,
      description: `Assembly for ${wo.woNumber} / ${wo.salesOrderNumber || "SO"}`,
    });
  } catch (err) {
    const e = new Error(`Zoho could not create the assembly: ${err.message}`);
    e.status = err.status || 502; throw e;
  }

  await catalyst.datastore().table("WoAssembly").insertRow({
    orgId: String(orgId),
    workOrderId: String(wo.ROWID),
    workOrderFgId: String(fg.ROWID),
    fgItemId: String(fg.fgItemId),
    qty,
    zohoBundleId: String(bundle.bundle_id || ""),
    zohoBundleNumber: String(bundle.transaction_number || referenceNumber),
    createdBy: userId ? String(userId) : "",
  });

  const newAssembled = assembled + qty;
  const fgStatus = newAssembled >= fgQty ? "Closed" : "";
  await catalyst.datastore().table("WorkOrderFG").updateRow({
    ROWID: String(fg.ROWID), assembledQty: newAssembled, status: fgStatus,
  });
  await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "fg.assemble", userId, {
    fgName: fg.fgName, qty, bundleNumber: bundle.transaction_number || referenceNumber,
  });

  // Every FG assembled → move the WO forward to QualityCheck; QC + Close stay
  // manual (decided: full assembly does NOT auto-close).
  let woStatus = String(wo.status);
  if (fgStatus === "Closed" && PRE_QC.includes(woStatus)) {
    const fgs = await byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`);
    const allDone = fgs.every((f) =>
      String(f.ROWID) === String(fg.ROWID) ? true : n(f.assembledQty) >= n(f.fgQty));
    if (allDone) {
      woStatus = "QualityCheck";
      await catalyst.datastore().table("WorkOrder").updateRow({ ROWID: String(wo.ROWID), status: woStatus });
      await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "wo.status", userId, {
        from: wo.status, to: woStatus, via: referenceNumber,
      });
    }
  }

  return {
    ok: true,
    bundleId: String(bundle.bundle_id || ""),
    bundleNumber: bundle.transaction_number || referenceNumber,
    assembledQty: newAssembled,
    fgStatus: fgStatus || null,
    woStatus,
  };
}

// Prior assemblies of a work order, newest first — for the Items tab cards.
async function listAssemblies(catalyst, orgId, workOrderId) {
  return (await byOrg(catalyst, orgId, "WoAssembly", `workOrderId = ${zStr(String(workOrderId))}`, "CREATEDTIME DESC"))
    .map((a) => ({
      id: String(a.ROWID),
      workOrderFgId: String(a.workOrderFgId),
      qty: n(a.qty),
      bundleNumber: a.zohoBundleNumber || null,
      createdAt: a.CREATEDTIME,
    }));
}

module.exports = { assembleFg, listAssemblies };
