"use strict";

/**
 * The defective-material block list (CR-203). Units pulled off a work order
 * as defective go back to the Main warehouse physically, but must not be
 * reserved again anywhere until the Store Issue Manager clears them
 * (repaired) or writes them off. Zoho knows nothing about this — the block
 * lives in DefectReturn rows and is applied here, to every pool the app
 * reads: the picker (tracking-options), the FIFO auto-pick on confirm, the
 * explicit picks a user posts, and the grid's column B.
 *
 * Pure functions take an `entry` = { qty, batches: Map<batch_id, qty>,
 * serials: Set<serial> } for one item; blockedFor builds them per org.
 */
const { zStr } = require("../store");
const { byOrg } = require("./store");

const n = (v) => Number(v) || 0;
const OPEN = ["pending", "returned_to_vendor"];

function parseTracking(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

// Pure: DefectReturn rows → Map<itemId, entry> (open rows only).
function blockMap(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!OPEN.includes(String(r.status))) continue;
    const id = String(r.itemId);
    let e = map.get(id);
    if (!e) map.set(id, (e = { qty: 0, batches: new Map(), serials: new Set() }));
    e.qty += n(r.qty);
    const t = parseTracking(r.trackingJson);
    for (const s of (t && t.serials) || []) e.serials.add(String(s));
    for (const b of (t && t.batches) || []) {
      const k = String(b.batch_id || "");
      e.batches.set(k, (e.batches.get(k) || 0) + n(b.qty));
    }
  }
  return map;
}

// ponytail: byOrg ≤300 rows — byOrgAll if a store ever has that many open defects.
async function blockedFor(catalyst, orgId) {
  return blockMap(await byOrg(
    catalyst, orgId, "DefectReturn", `status IN (${OPEN.map((s) => zStr(s)).join(",")})`,
  ));
}

/**
 * Pure: the entry that applies to a pool read at `fromWarehouseId`. Serials
 * are specific units — blocked everywhere. Batch quantities are only
 * subtracted at Main, where the defective units physically sit; the same
 * batch's units in Reserve/Issue are already committed to a work order.
 */
function entryFor(blocked, itemId, fromWarehouseId, mainWarehouseId) {
  const e = blocked && blocked.get(String(itemId));
  if (!e) return null;
  if (String(fromWarehouseId) === String(mainWarehouseId)) return e;
  return { qty: 0, batches: new Map(), serials: e.serials };
}

const serialOf = (s) => (typeof s === "string" ? s : s && (s.serial_number || s.serialnumber));

/**
 * Pure, mutates the Zoho item: removes blocked serials (item-level and per
 * warehouse/location) and subtracts blocked batch quantities from every batch
 * pool the pickers read. Returns the item for chaining.
 */
function applyBlocks(item, entry) {
  if (!item || !entry) return item;
  const pools = [item, ...(item.warehouses || []), ...(item.locations || [])];
  for (const p of pools) {
    if (Array.isArray(p.serial_numbers) && entry.serials.size) {
      p.serial_numbers = p.serial_numbers.filter((s) => !entry.serials.has(String(serialOf(s))));
    }
    if (Array.isArray(p.batches) && entry.batches.size) {
      for (const b of p.batches) {
        const take = entry.batches.get(String(b.batch_id || ""));
        if (!take) continue;
        for (const k of ["batch_available_stock", "balance_quantity"]) {
          if (b[k] !== undefined) b[k] = Math.max(0, n(b[k]) - take);
        }
      }
    }
  }
  return item;
}

/**
 * Pure: reject an explicit pick that touches blocked stock. Serials need no
 * pool; batches are checked against `available` (batch_id → qty after
 * applyBlocks at the source) when the caller has one — without it only the
 * serial rule applies. Returns a message or null.
 */
function blockedPick(tracking, entry, label, available) {
  if (!tracking || !entry) return null;
  for (const s of tracking.serials || []) {
    if (entry.serials.has(String(s))) return `${label}: serial ${s} is blocked as defective — pick another`;
  }
  if (available) {
    for (const b of tracking.batches || []) {
      const avail = n(available.get(String(b.batch_id || "")));
      if (n(b.qty) > avail) return `${label}: batch ${b.batch_number || b.batch_id} has only ${avail} usable — ${entry.batches.get(String(b.batch_id || "")) || 0} blocked as defective`;
    }
  }
  return null;
}

module.exports = { blockMap, blockedFor, entryFor, applyBlocks, blockedPick };

// ponytail self-check: `node functions/skuapi/workorder/blocks.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  const rows = [
    { itemId: "11", status: "pending", qty: 2, trackingJson: JSON.stringify({ batches: [{ batch_id: "b1", batch_number: "B1", qty: 2 }] }) },
    { itemId: "11", status: "returned_to_vendor", qty: 1, trackingJson: JSON.stringify({ batches: [{ batch_id: "b1", batch_number: "B1", qty: 1 }] }) },
    { itemId: "11", status: "repaired", qty: 9, trackingJson: JSON.stringify({ batches: [{ batch_id: "b1", qty: 9 }] }) },
    { itemId: "22", status: "pending", qty: 1, trackingJson: JSON.stringify({ serials: ["S2"] }) },
    { itemId: "33", status: "pending", qty: 4, trackingJson: "" },
  ];
  const blocked = blockMap(rows);
  assert.strictEqual(blocked.get("11").qty, 3, "two open rows of one item add up; repaired ignored");
  assert.strictEqual(blocked.get("11").batches.get("b1"), 3);
  assert.ok(blocked.get("22").serials.has("S2"));
  assert.strictEqual(blocked.get("33").qty, 4, "untracked item blocks by qty only");

  // entryFor: batches only at Main, serials everywhere.
  assert.strictEqual(entryFor(blocked, "99", "W1", "W1"), null);
  assert.strictEqual(entryFor(blocked, "11", "W1", "W1").batches.get("b1"), 3);
  assert.strictEqual(entryFor(blocked, "11", "W3", "W1").batches.size, 0, "batch block not applied away from Main");
  assert.ok(entryFor(blocked, "22", "W3", "W1").serials.has("S2"), "serial block applies everywhere");

  // applyBlocks: pools reduced in place.
  const item = {
    serial_numbers: ["S1", { serial_number: "S2" }],
    batches: [{ batch_id: "b1", batch_available_stock: 5 }, { batch_id: "b2", batch_available_stock: 4 }],
    locations: [{ location_id: "W1", serial_numbers: ["S2", "S3"], batches: [{ batch_id: "b1", balance_quantity: 5 }] }],
  };
  applyBlocks(item, { qty: 3, batches: new Map([["b1", 3]]), serials: new Set(["S2"]) });
  assert.deepStrictEqual(item.serial_numbers, ["S1"]);
  assert.deepStrictEqual(item.locations[0].serial_numbers, ["S3"]);
  assert.strictEqual(item.batches[0].batch_available_stock, 2);
  assert.strictEqual(item.batches[1].batch_available_stock, 4, "other batch untouched");
  assert.strictEqual(item.locations[0].batches[0].balance_quantity, 2);
  assert.strictEqual(applyBlocks(null, {}), null);
  assert.deepStrictEqual(applyBlocks({ item_id: "1" }, null), { item_id: "1" }, "no entry = untouched");

  // blockedPick.
  const e = blocked.get("11");
  assert.strictEqual(blockedPick(null, e, "Shaft"), null);
  assert.match(blockedPick({ serials: ["S2"] }, blocked.get("22"), "Seal"), /serial S2 is blocked/);
  assert.strictEqual(blockedPick({ batches: [{ batch_id: "b1", qty: 2 }] }, e, "Shaft"), null, "no pool → batch not judged");
  assert.match(blockedPick({ batches: [{ batch_id: "b1", batch_number: "B1", qty: 3 }] }, e, "Shaft", new Map([["b1", 2]])), /only 2 usable/);
  assert.strictEqual(blockedPick({ batches: [{ batch_id: "b1", qty: 2 }] }, e, "Shaft", new Map([["b1", 2]])), null);

  console.log("workorder/blocks.js self-check passed");
}
