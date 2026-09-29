"use strict";

/**
 * Defective material (CR-203, split in CR-244): a shop-floor user pulls issued
 * units off a work order with a reason and a photo; the units go back to Main
 * via an ordinary `return` transaction and a DefectReturn row blocks them from
 * reuse (blocks.js). The Store Issue Manager then takes two independent
 * decisions on the row: the **replacement** (reserve & issue the same or a
 * different item, purchase what is short — `replace`) and the **disposition**
 * of the defective units (repaired → usable again, written off via a Zoho
 * inventory adjustment, or returned to the vendor — `action`).
 */
const { Readable } = require("stream");
const { rowList, zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { createInventoryAdjustment } = require("../zoho/inventoryApi");
const { byOrg, inList, settings, warehouses, logActivity } = require("./store");
const txn = require("./txn");
const bom = require("./bom");
const purchase = require("./purchase");
const { buildGrid, mainStock } = require("./grid");
const { email } = require("./alerts");

const n = (v) => Number(v) || 0;
const ACTIONS = { repaired: "repaired", adjusted: "adjusted", returned_to_vendor: "returned_to_vendor" };
// replacementStatus: '' = awaiting the manager; legacy = raised before CR-244.
const REPL = { issued: "issued", pr_raised: "pr_raised", both: "both", legacy: "legacy" };

function bad(msg, status = 400) { const e = new Error(msg); e.status = status; throw e; }

/**
 * Raise: one confirmed return txn (Issue → Main) for all lines, one
 * DefectReturn row per line, the activity entry and the store-manager email.
 * lines: [{ itemId, qty, tracking? }]
 */
async function raise(catalyst, orgId, { wo, fg, lines, reason, photoFileId, photoType }, userId) {
  const why = String(reason || "").trim();
  if (!why) bad("Give a reason for the defect");
  const requested = (lines || []).filter((l) => n(l.qty) > 0).map((l) => ({ itemId: l.itemId, qty: n(l.qty), tracking: l.tracking || null }));
  if (!requested.length) bad("Enter a quantity on at least one line");

  const draft = await txn.createDraft(
    catalyst, orgId,
    { workOrderId: wo.ROWID, workOrderFgId: fg.ROWID, type: "return", requested, notes: `Defective — ${why}` },
    userId,
  );
  let confirmed;
  try {
    confirmed = await txn.confirmTxn(catalyst, orgId, draft.id, userId);
  } catch (err) {
    await txn.cancelTxn(catalyst, orgId, draft.id, userId).catch(() => {});
    throw err;
  }

  const skus = new Map(
    (await byOrg(catalyst, orgId, "WorkOrderLine", `workOrderFgId = ${zStr(String(fg.ROWID))}`))
      .map((l) => [String(l.rmItemId), l]),
  );
  const table = catalyst.datastore().table("DefectReturn");
  const out = [];
  for (const l of draft.lines) {
    const row = await table.insertRow({
      orgId: String(orgId),
      workOrderId: String(wo.ROWID),
      workOrderFgId: String(fg.ROWID),
      itemId: String(l.rmItemId),
      woNumber: String(wo.woNumber || ""),
      fgName: String(fg.fgName || ""),
      itemName: String(l.name || (skus.get(String(l.rmItemId)) || {}).rmName || ""),
      itemSku: String((skus.get(String(l.rmItemId)) || {}).rmSku || ""),
      qty: l.qty,
      trackingJson: l.tracking ? JSON.stringify(l.tracking) : "",
      reason: why,
      actionReason: "",
      photoFileId: photoFileId ? String(photoFileId) : "",
      photoType: photoType ? String(photoType) : "",
      status: "pending",
      txnId: String(confirmed.id),
      replacementItemId: "",
      replacementName: "",
      replacementStatus: "",
      replacementRef: "",
      zohoAdjustmentId: "",
      raisedBy: userId ? String(userId) : "",
      actionedBy: "",
      raisedAt: dsDate(Date.now()),
      actionedAt: null,
    });
    out.push({ id: String(row.ROWID), itemId: String(l.rmItemId), itemName: l.name, qty: l.qty });
  }

  await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "defect.raised", userId, {
    txnNumber: confirmed.txnNumber, transferOrder: confirmed.transferOrderNumber, reason: why,
    lines: out.map((d) => ({ itemName: d.itemName, qty: d.qty })),
  });

  const s = await settings(catalyst, orgId);
  await email(
    catalyst, s.storeIssueEmail,
    `Defective material — ${wo.woNumber}`,
    [
      `${wo.woNumber} (${fg.fgName}): defective material returned to the Main warehouse and blocked from reuse.`,
      "",
      ...out.map((d) => `• ${d.itemName} × ${d.qty}`),
      "",
      `Reason: ${why}`,
      `Transfer Order: ${confirmed.transferOrderNumber || confirmed.txnNumber}`,
      "",
      "Awaiting your decision in Order Management → Store issues: replace (reserve & issue or purchase) and repair, write off or return the units.",
    ].join("\n"),
  );

  return { ...confirmed, defects: out };
}

// ---- replacement (CR-244) ---------------------------------------------------

// Pure: how much of a defect's qty can be reserved & issued now vs purchased.
// mode 'pr' skips the stock move entirely.
function replacementPlan(qty, reservable, mode) {
  const q = n(qty);
  const can = mode === "pr" ? 0 : Math.max(0, Math.min(q, n(reservable)));
  const short = Math.max(0, q - can);
  const status = can > 0 && short > 0 ? REPL.both : can > 0 ? REPL.issued : short > 0 ? REPL.pr_raised : "";
  return { qty: q, can, short, status };
}

async function loadDefect(catalyst, orgId, id) {
  const rows = await byOrg(catalyst, orgId, "DefectReturn", `ROWID = ${zStr(String(id))}`);
  if (!rows.length) bad("Defect not found", 404);
  return rows[0];
}

/**
 * What the manager sees before deciding: reservable at Main for the item they
 * chose (same or different), the shortfall, and the batch/serial pool for the
 * picker. Reservable = min(qty, Main stock − blocked) — after the return the
 * freed requirement equals qty, so B is the only cap that matters.
 */
async function replacementOptions(catalyst, orgId, id, itemId) {
  const row = await loadDefect(catalyst, orgId, id);
  const item = String(itemId || row.itemId);
  const { wo } = await txn.loadContext(catalyst, orgId, row.workOrderId, row.workOrderFgId);
  const stock = await mainStock(catalyst, orgId, item, wo);
  const { qty, can, short } = replacementPlan(row.qty, stock, "issue");
  let tracking = { tracking: null };
  if (can > 0) {
    try { tracking = await txn.trackingPool(catalyst, orgId, { itemId: item, type: "reserve", qty: can, wo }); } catch (err) {
      console.error("replacement pool:", err && err.message); // picker degrades to FIFO auto-pick
    }
  }
  return { qty, reservable: can, short, stock, ...tracking };
}

/**
 * The manager's replacement decision. Body: { mode:'issue'|'pr',
 * replacement?: {id,name,sku,unit}, tracking?, reason }.
 * Order matters: BOM swap (idempotent via replacementItemId) → reserve →
 * issue → purchase request → row update only once every leg that ran passed,
 * so a refused leg leaves the row awaiting and the manager retries.
 */
async function replace(catalyst, orgId, id, { mode, replacement, tracking, reason }, userId) {
  const why = String(reason || "").trim();
  if (!why) bad("Give a reason");
  const row = await loadDefect(catalyst, orgId, id);
  if (row.replacementStatus) bad(`Replacement already decided — ${String(row.replacementStatus).replace(/_/g, " ")}`, 409);
  const { wo, fg } = await txn.loadContext(catalyst, orgId, row.workOrderId, row.workOrderFgId);
  const table = catalyst.datastore().table("DefectReturn");
  const repl = replacement && replacement.id && String(replacement.id) !== String(row.itemId) ? replacement : null;
  const itemId = repl ? String(repl.id) : String(row.itemId);
  const itemName = repl ? String(repl.name || itemId) : String(row.itemName || itemId);

  // A different item goes onto the BOM: the whole line when everything was
  // defective, else the old line shrinks and the new item is added for the
  // defective qty (CR-203 logic, moved here). Skipped on a retry.
  if (repl && String(row.replacementItemId) !== String(repl.id)) {
    const line = (await byOrg(catalyst, orgId, "WorkOrderLine",
      `workOrderFgId = ${zStr(String(fg.ROWID))} AND rmItemId = ${zStr(String(row.itemId))}`))[0];
    if (line) {
      const q = n(row.qty);
      const ops = q >= n(line.requiredQty)
        ? [{ action: "replace", rmItemId: String(row.itemId), item: repl, reason: `defective — ${row.reason || why}` }]
        : [
          { action: "setQty", rmItemId: String(row.itemId), qty: n(line.requiredQty) - q, reason: `${q} defective — ${row.reason || why}` },
          { action: "add", item: repl, qty: q, reason: `replaces ${q} defective ${line.rmName || row.itemId}` },
        ];
      let revision = n(wo.revision);
      for (const op of ops) revision = (await bom.applyLineOp(catalyst, orgId, { ...wo, revision }, fg, op, userId)).revision;
      wo.revision = revision;
    }
    await table.updateRow({ ROWID: String(row.ROWID), replacementItemId: String(repl.id), replacementName: String(repl.name || "") });
  }

  const plan = replacementPlan(row.qty, mode === "pr" ? 0 : await mainStock(catalyst, orgId, itemId, wo), mode);
  const refs = [];
  if (plan.can > 0) {
    // A retry after a failed issue already holds stock in Reserve — top up only.
    const grid = await buildGrid(catalyst, orgId, wo, fg);
    const reserved = n((grid.rows.find((r) => String(r.itemId) === itemId) || {}).reserved);
    const steps = [
      ...(plan.can > reserved ? [{ type: "reserve", qty: plan.can - reserved }] : []),
      { type: "issue", qty: plan.can },
    ];
    for (const s of steps) {
      const draft = await txn.createDraft(
        catalyst, orgId,
        { workOrderId: wo.ROWID, workOrderFgId: fg.ROWID, type: s.type, requested: [{ itemId, qty: s.qty, tracking: tracking || null }], notes: `Replacement for defect — ${why}` },
        userId,
      );
      let done;
      try { done = await txn.confirmTxn(catalyst, orgId, draft.id, userId); } catch (err) {
        await txn.cancelTxn(catalyst, orgId, draft.id, userId).catch(() => {});
        throw err;
      }
      refs.push(done.transferOrderNumber || done.txnNumber);
    }
  }
  let prNumber = null;
  if (plan.short > 0) {
    prNumber = (await purchase.createPR(
      catalyst, orgId,
      { workOrderId: wo.ROWID, lines: [{ rmItemId: itemId, rmName: itemName, requiredQty: plan.short, purchaseQty: plan.short }] },
      userId,
    )).prNumber;
    refs.push(prNumber);
  }

  await table.updateRow({
    ROWID: String(row.ROWID), replacementStatus: plan.status, replacementRef: refs.join(", "),
    ...(repl ? {} : { replacementItemId: "", replacementName: "" }),
  });
  await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "defect.replacement", userId, {
    defectId: String(row.ROWID), itemName, qty: plan.qty, reservedIssued: plan.can, purchased: plan.short,
    transferOrders: refs.filter((r) => r !== prNumber), prNumber, reason: why, replacement: repl ? repl.name : null,
  });
  return { id: String(row.ROWID), replacementStatus: plan.status, replacementRef: refs.join(", "), reservedIssued: plan.can, purchased: plan.short, prNumber };
}

// The Store Issue Manager's decision on one pending row.
async function action(catalyst, orgId, id, { action: what, reason }, userId) {
  const status = ACTIONS[String(what || "")];
  if (!status) bad("Unknown action — use repaired, adjusted or returned_to_vendor");
  const why = String(reason || "").trim();
  if (!why) bad("Give a reason");
  const rows = await byOrg(catalyst, orgId, "DefectReturn", `ROWID = ${zStr(String(id))}`);
  if (!rows.length) bad("Defect not found", 404);
  const row = rows[0];
  if (row.status !== "pending") bad(`This defect is already ${String(row.status).replace(/_/g, " ")}`, 409);

  const patch = { ROWID: String(row.ROWID), status, actionReason: why, actionedBy: userId ? String(userId) : "", actionedAt: dsDate(Date.now()) };
  if (status === "adjusted") {
    // Written off at the WO's Main — where the return put it (CR-249).
    const wo = (await byOrg(catalyst, orgId, "WorkOrder", `ROWID = ${zStr(String(row.workOrderId))}`))[0];
    const wh = await warehouses(catalyst, orgId, wo);
    let tracking = null;
    try { tracking = row.trackingJson ? JSON.parse(row.trackingJson) : null; } catch { /* stored by us */ }
    const adj = await createInventoryAdjustment(catalyst, {
      itemId: row.itemId, qty: n(row.qty), locationId: wh.main,
      reason: "Defective material written off",
      description: `${row.woNumber} · ${row.itemName} × ${n(row.qty)} — ${why}`,
      tracking,
    });
    patch.zohoAdjustmentId = String(adj.inventory_adjustment_id || "");
    // Reflect the adjustment in the stock snapshot now, not at the nightly reconcile.
    try { await require("./sync").syncItem(catalyst, orgId, row.itemId); } catch (err) { console.error("defect adjust sync:", err && err.message); }
  }
  await catalyst.datastore().table("DefectReturn").updateRow(patch);
  await logActivity(catalyst, orgId, "WorkOrder", row.workOrderId, `defect.${status}`, userId, {
    defectId: String(row.ROWID), itemName: row.itemName, qty: n(row.qty), reason: why, zohoAdjustmentId: patch.zohoAdjustmentId,
  });
  return { id: String(row.ROWID), status, zohoAdjustmentId: patch.zohoAdjustmentId || null };
}

// status: exact value, or 'open' = disposition pending OR replacement awaiting (CR-244).
async function list(catalyst, orgId, status) {
  const open = status === "open";
  let rows = await byOrg(
    catalyst, orgId, "DefectReturn", status && !open ? `status = ${zStr(String(status))}` : null, "CREATEDTIME DESC",
  );
  if (open) rows = rows.filter((r) => r.status === "pending" || !r.replacementStatus);
  const userIds = inList([...new Set(rows.flatMap((r) => [r.raisedBy, r.actionedBy]).filter(Boolean))]);
  const names = {};
  if (userIds) {
    for (const u of rowList(await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, name, email FROM AppUser WHERE ROWID IN (${userIds})`))) {
      names[String(u.ROWID)] = u.name || u.email || null;
    }
  }
  return rows.map((r) => {
    let tracking = null;
    try { tracking = r.trackingJson ? JSON.parse(r.trackingJson) : null; } catch { /* ignore */ }
    return {
      id: String(r.ROWID),
      workOrderId: String(r.workOrderId), woNumber: r.woNumber, fgName: r.fgName,
      itemId: String(r.itemId), itemName: r.itemName, itemSku: r.itemSku || null,
      qty: n(r.qty), tracking,
      reason: r.reason || "", actionReason: r.actionReason || "",
      hasPhoto: Boolean(r.photoFileId),
      status: r.status,
      replacementName: r.replacementName || null,
      replacementStatus: r.replacementStatus || "",
      replacementRef: r.replacementRef || null,
      zohoAdjustmentId: r.zohoAdjustmentId || null,
      raisedBy: r.raisedBy ? names[String(r.raisedBy)] || null : null,
      raisedAt: r.raisedAt || r.CREATEDTIME,
      actionedBy: r.actionedBy ? names[String(r.actionedBy)] || null : null,
      actionedAt: r.actionedAt || null,
    };
  });
}

// ---- photos (Catalyst File Store) -----------------------------------------

// ponytail: one shared folder, found by name and created on first use.
const FOLDER = "defects";
let folderId = null;
async function photoFolder(catalyst) {
  const fs = catalyst.filestore();
  if (folderId) return fs.folder(folderId);
  const all = await fs.getAllFolders();
  let f = all.find((x) => (x.toJSON ? x.toJSON() : x).folder_name === FOLDER);
  if (!f) f = await fs.createFolder(FOLDER);
  folderId = String((f.toJSON ? f.toJSON() : f).id);
  return fs.folder(folderId);
}

async function savePhoto(catalyst, buffer, contentType) {
  if (!buffer || !buffer.length) bad("No image received");
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" })[String(contentType).split(";")[0]] || "img";
  const name = `defect-${Date.now()}.${ext}`;
  const stream = Readable.from(buffer);
  stream.path = name; // the SDK's multipart builder takes the part filename from .path
  const file = await (await photoFolder(catalyst)).uploadFile({ code: stream, name });
  return { fileId: String(file.id), type: String(contentType).split(";")[0] };
}

async function photoStream(catalyst, orgId, id) {
  const rows = await byOrg(catalyst, orgId, "DefectReturn", `ROWID = ${zStr(String(id))}`);
  if (!rows.length || !rows[0].photoFileId) bad("No photo for this defect", 404);
  const folder = await photoFolder(catalyst);
  return { stream: await folder.getFileStream(rows[0].photoFileId), type: rows[0].photoType || "image/jpeg" };
}

module.exports = { raise, action, list, replace, replacementOptions, replacementPlan, savePhoto, photoStream, ACTIONS, REPL };

// ponytail self-check: `node functions/skuapi/workorder/defects.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  assert.deepStrictEqual(replacementPlan(3, 10, "issue"), { qty: 3, can: 3, short: 0, status: "issued" }, "all in stock → issued");
  assert.deepStrictEqual(replacementPlan(3, 1, "issue"), { qty: 3, can: 1, short: 2, status: "both" }, "partly in stock → both");
  assert.deepStrictEqual(replacementPlan(3, 0, "issue"), { qty: 3, can: 0, short: 3, status: "pr_raised" }, "nothing in stock → PR only");
  assert.deepStrictEqual(replacementPlan(3, 10, "pr"), { qty: 3, can: 0, short: 3, status: "pr_raised" }, "mode pr ignores stock");
  assert.deepStrictEqual(replacementPlan(2, -5, "issue"), { qty: 2, can: 0, short: 2, status: "pr_raised" }, "negative stock clamps");
  assert.strictEqual(replacementPlan(0, 5, "issue").status, "", "nothing to replace → no status");
  console.log("workorder/defects.js self-check passed");
}
