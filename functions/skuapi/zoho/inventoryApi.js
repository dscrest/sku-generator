"use strict";

/** Zoho Inventory v1 calls for the work-order / reserve add-ons (needs ZohoInventory scope). */
const { apiRequest, getStockAccountId, buildItemCfs } = require("./booksApi");

// BOM: composite_item.mapped_items[] = { item_id, name, sku, quantity }
async function getCompositeItem(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/compositeitems/${itemId}`, null, "inventory");
  return data.composite_item;
}

async function updateCompositeItem(catalyst, itemId, mappedItems) {
  const data = await apiRequest(catalyst, "PUT", `/compositeitems/${itemId}`, {
    mapped_items: mappedItems.map((m) => ({ item_id: String(m.rmItemId), quantity: Number(m.perUnitQty) || 0 })),
  }, "inventory");
  return data.composite_item;
}

// Every composite item in the org — the global BOM page's grid (CR-028).
async function listCompositeItems(catalyst) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/compositeitems?page=${page}&per_page=200`, null, "inventory");
    items.push(...(data.composite_items || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  return items;
}

// Zoho requires the composite to be inventory-tracked (code 13084 otherwise):
// item_type "inventory" + a stock account. A composite is a finished good, so
// prefer the org's "Finished Goods" account, falling back to the Books default
// "Inventory Asset". Anything else the org demands surfaces verbatim.
// description/customFields are optional (CR-029 Manufacturing push sends them;
// the work-order BOM screens don't) — a composite is a finished good, so it
// gets the same defaults as booksApi.createItem: descriptions in both boxes,
// default CFs, rate 0, Taxable, serial tracking, FIFO.
async function createCompositeItem(catalyst, { name, sku, description, customFields, mappedItems }) {
  const inventoryAccountId = (await getStockAccountId(catalyst, "finished goods"))
    || (await getStockAccountId(catalyst, "inventory asset"));
  const data = await apiRequest(catalyst, "POST", "/compositeitems", {
    name,
    sku: sku || undefined,
    description: description || undefined,
    purchase_description: description || undefined,
    unit: "pcs",
    item_type: "inventory",
    product_type: "goods",
    rate: 0,
    is_taxable: true,
    track_serial_number: true,
    inventory_valuation_method: "fifo",
    inventory_account_id: inventoryAccountId || undefined,
    custom_fields: customFields ? await buildItemCfs(catalyst, customFields) : undefined,
    mapped_items: (mappedItems || []).map((m) => ({ item_id: String(m.rmItemId), quantity: Number(m.perUnitQty) || 0 })),
  }, "inventory");
  return data.composite_item;
}

// Top-level field update (name/sku/descriptions/custom_fields) WITHOUT
// mapped_items — a re-push must never clobber a BOM refined on the Composite
// BOM page. Custom fields are normalized here; everything else passes through.
async function updateCompositeItemFields(catalyst, itemId, body) {
  if (body.custom_fields) body = { ...body, custom_fields: await buildItemCfs(catalyst, body.custom_fields) };
  const data = await apiRequest(catalyst, "PUT", `/compositeitems/${itemId}`, body, "inventory");
  return data.composite_item;
}

/**
 * Orgs with Books "Locations" enabled keep branches (e.g. a head office) out of
 * the legacy /warehouses payload — only warehouse-type entries come back, so
 * the settings dropdown misses the locations that actually hold stock. Prefer
 * /locations and normalise to the warehouse shape callers already expect.
 */
async function listWarehouses(catalyst) {
  try {
    const data = await apiRequest(catalyst, "GET", "/locations", null, "books");
    const locs = (data.locations || []).filter((l) => l.status !== "inactive");
    if (locs.length) {
      return locs.map((l) => ({
        warehouse_id: String(l.location_id),
        warehouse_name: `${l.location_name}${l.type === "warehouse" ? " (Warehouse)" : ""}`,
        is_primary_warehouse: Boolean(l.is_primary),
      }));
    }
  } catch { /* org without Locations — fall through to the legacy endpoint */ }
  const data = await apiRequest(catalyst, "GET", "/warehouses", null, "inventory");
  return data.warehouses || [];
}

// Item detail incl. stock_on_hand and per-warehouse warehouses[] breakdown.
async function getItemStock(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/items/${itemId}`, null, "inventory");
  return data.item;
}

/**
 * Bulk stock read for the nightly reconcile: 200 items per call instead of one
 * call per item. `warehouses[]` is present on the list payload for
 * inventory-enabled orgs; callers fall back to the org total when it is not.
 */
async function listItemsWithStock(catalyst) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/items?page=${page}&per_page=200`, null, "inventory");
    items.push(...(data.items || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  return items;
}

// ---- writes ---------------------------------------------------------------

const num = (v) => Number(v) || 0;
const whId = (w) => String(w.warehouse_id || w.location_id || "");

/**
 * Pure: from an item-detail payload, pick the serial/batch numbers Zoho requires
 * on a tracked transfer line. Zoho rejects a serial- or batch-tracked line that
 * carries no numbers (code 2205), so we auto-pick the first `qty` in stock at the
 * source warehouse (user confirmed: "start picking from the first available").
 * Untracked items → {}. Throws a friendly (status 400) error when short.
 *
 * ponytail: Zoho's serial/batch payload shape varies by org — reads defensively
 * from the warehouse/location breakdown and the item-level pool. Verify against
 * live Catalyst logs on the first real push.
 */
function pickSerialsBatches(item, fromWarehouseId, qty, name) {
  if (qty <= 0 || !item) return {};
  const isSerial = Boolean(item.is_serial_number_tracked || item.track_serial_number);
  const isBatch = Boolean(item.is_batch_tracked || item.track_batch_number);
  if (!isSerial && !isBatch) return {};

  const label = name || item.name || String(item.item_id || "");
  const fromWh = [...(item.warehouses || []), ...(item.locations || [])]
    .find((w) => whId(w) === String(fromWarehouseId));
  const shortErr = (kind) => {
    const e = new Error(`No ${kind} numbers are in stock at the source warehouse for "${label}" — receive stock before moving it.`);
    e.status = 400;
    return e;
  };

  if (isSerial) {
    const serials = ((fromWh && fromWh.serial_numbers) || item.serial_numbers || [])
      .map((s) => (typeof s === "string" ? s : s.serial_number || s.serialnumber))
      .filter(Boolean);
    if (serials.length < qty) throw shortErr("serial");
    return { serial_numbers: serials.slice(0, qty) };
  }

  // Batch: allocate qty across batches, oldest first (Zoho lists them in order).
  const pool = ((fromWh && fromWh.batches) || item.batches || []);
  const batches = [];
  let need = qty;
  for (const b of pool) {
    if (need <= 0) break;
    const avail = num(b.batch_available_stock ?? b.quantity_in ?? b.quantity ?? b.batch_quantity);
    const take = Math.min(avail, need);
    if (take <= 0) continue;
    batches.push({ batch_id: String(b.batch_id || ""), batch_number: b.batch_number, quantity_transfer: take });
    need -= take;
  }
  if (need > 0) throw shortErr("batch");
  return { batches };
}

// Fetch the item detail then pick its serial/batch numbers for a transfer line.
async function availableSerialsBatches(catalyst, itemId, fromWarehouseId, qty, name) {
  if (qty <= 0) return {};
  return pickSerialsBatches(await getItemStock(catalyst, itemId), fromWarehouseId, qty, name);
}

/**
 * The document every material movement writes (BRD §6.2–6.5): a Transfer Order
 * between two warehouses. Reserve = Main→Reserve, de-reserve = Reserve→Main,
 * issue = Reserve→Issue, return = Issue→Main — the caller supplies the pair.
 *
 * lines: [{ rmItemId, qty, name }]
 * numberHint: a Transfer Order number to fall back on if the org has auto-
 *   numbering OFF (Zoho then demands one, code 6) — auto-numbered orgs never see it.
 */
async function createTransferOrder(catalyst, { date, fromWarehouseId, toWarehouseId, lines, reason, numberHint }) {
  const line_items = await Promise.all(lines.map(async (l) => ({
    item_id: String(l.rmItemId),
    name: l.name || String(l.rmItemId),
    quantity_transfer: Number(l.qty) || 0,
    // Serial/batch-tracked items must carry their numbers or Zoho rejects the line.
    ...(await availableSerialsBatches(catalyst, l.rmItemId, fromWarehouseId, Number(l.qty) || 0, l.name)),
  })));
  const body = {
    date,
    // Location ids are the required pair (warehouse ids are the legacy alias);
    // our OrgSetting values come from /locations, so they are location ids.
    from_location_id: String(fromWarehouseId),
    to_location_id: String(toWarehouseId),
    // Not in transit: the move is immediate, so stock lands in the destination
    // location as soon as the action is confirmed.
    is_intransit_order: false,
    description: reason || undefined,
    // name and quantity_transfer are the documented required line fields —
    // plain `quantity` is ignored and `name` missing is rejected (code 4).
    line_items,
  };
  try {
    const data = await apiRequest(catalyst, "POST", "/transferorders", body, "inventory");
    return data.transfer_order;
  } catch (err) {
    // Auto-numbering off → Zoho demands the number (code 6). Supply one only
    // then, so orgs that auto-number keep their own sequence.
    if (err.zohoCode === 6 && numberHint) {
      const data = await apiRequest(
        catalyst, "POST", "/transferorders",
        { ...body, transfer_order_number: String(numberHint) }, "inventory",
      );
      return data.transfer_order;
    }
    throw err;
  }
}

async function getTransferOrder(catalyst, transferOrderId) {
  const data = await apiRequest(catalyst, "GET", `/transferorders/${transferOrderId}`, null, "inventory");
  return data.transfer_order;
}

module.exports = {
  getCompositeItem, updateCompositeItem, updateCompositeItemFields, listCompositeItems, createCompositeItem,
  listWarehouses, getItemStock, listItemsWithStock, createTransferOrder, getTransferOrder,
  availableSerialsBatches, pickSerialsBatches,
};

// ponytail self-check: `node functions/skuapi/zoho/inventoryApi.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  // Untracked → nothing attached.
  assert.deepStrictEqual(pickSerialsBatches({ item_id: "1" }, "W1", 2), {});
  assert.deepStrictEqual(pickSerialsBatches(null, "W1", 2), {});
  assert.deepStrictEqual(pickSerialsBatches({ track_serial_number: true }, "W1", 0), {}, "qty 0 → nothing");

  // Serial: first N at the source warehouse, string or object shapes.
  const serItem = {
    track_serial_number: true,
    warehouses: [
      { warehouse_id: "W1", serial_numbers: ["S1", { serial_number: "S2" }, "S3"] },
      { warehouse_id: "W2", serial_numbers: ["X9"] },
    ],
  };
  assert.deepStrictEqual(pickSerialsBatches(serItem, "W1", 2), { serial_numbers: ["S1", "S2"] });
  assert.throws(() => pickSerialsBatches(serItem, "W1", 5), /No serial numbers .*receive stock/);
  assert.throws(() => pickSerialsBatches(serItem, "W2", 2), /No serial numbers/, "other warehouse's serials don't count");

  // Batch: FIFO allocation across batches until qty is met.
  const batItem = {
    is_batch_tracked: true,
    locations: [{ location_id: "W1", batches: [
      { batch_id: "b1", batch_number: "B1", batch_available_stock: 3 },
      { batch_id: "b2", batch_number: "B2", batch_available_stock: 5 },
    ] }],
  };
  assert.deepStrictEqual(pickSerialsBatches(batItem, "W1", 4), {
    batches: [
      { batch_id: "b1", batch_number: "B1", quantity_transfer: 3 },
      { batch_id: "b2", batch_number: "B2", quantity_transfer: 1 },
    ],
  });
  assert.throws(() => pickSerialsBatches(batItem, "W1", 99), /No batch numbers/);

  console.log("zoho/inventoryApi.js self-check passed");
}
