"use strict";

/** Zoho Inventory v1 calls for the work-order / reserve add-ons (needs ZohoInventory scope). */
const { apiRequest, getStockAccountId } = require("./booksApi");

// A Zoho item/line/mapped_item of the composite's "Associated Services"
// section (labour etc.). No stock, never reserved — never a work-order line (CR-149).
const isService = (m) => Boolean(m) && m.product_type === "service";

// BOM: composite_item.mapped_items[] = { item_id, name, sku, quantity, product_type }
async function getCompositeItem(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/compositeitems/${itemId}`, null, "inventory");
  return data.composite_item;
}

// PUT replaces mapped_items wholesale. Every caller builds the list from WO
// lines, which exclude services, so carry the live item's service rows over
// or each push would strip labour from the composite in Zoho (CR-149).
async function updateCompositeItem(catalyst, itemId, mappedItems) {
  const services = ((await getCompositeItem(catalyst, itemId)).mapped_items || [])
    .filter(isService)
    .map((m) => ({ item_id: String(m.item_id), quantity: Number(m.quantity) || 0 }));
  const data = await apiRequest(catalyst, "PUT", `/compositeitems/${itemId}`, {
    mapped_items: [
      ...mappedItems.map((m) => ({ item_id: String(m.rmItemId), quantity: Number(m.perUnitQty) || 0 })),
      ...services,
    ],
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
// honor the dialog's inventoryAccountId when given, else prefer the org's
// "Finished Goods" account, falling back to the Books default "Inventory
// Asset". Anything else the org demands surfaces verbatim. customFields
// ([{api_name, value}], from Property.zohoCfApiName mappings) go into the
// item's custom fields; omitted when empty. tracking:
// 'none'|'serial'|'batch' from the push dialog; serial default matches
// booksApi.createItem.
async function createCompositeItem(catalyst, { name, sku, description, mappedItems, customFields, tracking = "serial", inventoryAccountId }) {
  const accountId = inventoryAccountId
    || (await getStockAccountId(catalyst, "finished goods"))
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
    track_serial_number: tracking === "serial",
    track_batch_number: tracking === "batch",
    inventory_valuation_method: "fifo",
    inventory_account_id: accountId || undefined,
    mapped_items: (mappedItems || []).map((m) => ({ item_id: String(m.rmItemId), quantity: Number(m.perUnitQty) || 0 })),
    custom_fields: customFields && customFields.length ? customFields : undefined,
  }, "inventory");
  return data.composite_item;
}

// Top-level field update (name/sku/descriptions) WITHOUT mapped_items — a
// re-push must never clobber a BOM refined on the Composite BOM page.
async function updateCompositeItemFields(catalyst, itemId, body) {
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
 * Bulk stock read for the reconcile: 200 items per call instead of one call per
 * item. `warehouses[]` is present on the list payload for inventory-enabled
 * orgs; callers fall back to the org total when it is not.
 *
 * `since` (a Zoho last_modified_time string) turns this into a delta pull: list
 * newest-first and stop at the first item older than the cursor, so an
 * incremental sync only sees what changed. Items with no last_modified_time are
 * kept (degrades to a full pull rather than dropping them) — verify the field is
 * present on the first live run.
 */
async function listItemsWithStock(catalyst, { since } = {}) {
  const ms = (s) => (s ? new Date(s).getTime() : 0);
  const sortQ = since ? "&sort_column=last_modified_time&sort_order=D" : "";
  const items = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/items?page=${page}&per_page=200${sortQ}`, null, "inventory");
    const batch = data.items || [];
    if (since) {
      let hitOlder = false;
      for (const it of batch) {
        if (it.last_modified_time && ms(it.last_modified_time) < ms(since)) { hitOlder = true; break; }
        items.push(it);
      }
      if (hitOlder) break;
    } else {
      items.push(...batch);
    }
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
  // .length guard: an EMPTY warehouse batches[] must fall through to the
  // item-level pool (withBatchFallback patches it there).
  const pool = (fromWh && (fromWh.batches || []).length ? fromWh.batches : item.batches) || [];
  const batches = [];
  let need = qty;
  for (const b of pool) {
    if (need <= 0) break;
    const avail = num(b.batch_available_stock ?? b.balance_quantity ?? b.quantity_in ?? b.quantity ?? b.batch_quantity);
    const take = Math.min(avail, need);
    if (take <= 0) continue;
    batches.push({ batch_id: String(b.batch_id || ""), batch_number: b.batch_number, quantity_transfer: take });
    need -= take;
  }
  if (need > 0) throw shortErr("batch");
  return { batches };
}

/**
 * Pure: Zoho batch records → the pool shape pickSerialsBatches reads
 * (batch_available_stock = balance at the source warehouse) plus every
 * location holding a balance, so the picker can say where the stock sits
 * when the source has none. Batches with no balance anywhere are dropped.
 * Ordered oldest manufacturing date first (undated last), stably — FIFO
 * auto-pick and the picker both read the pool in order (CR-152).
 */
function batchRecordsToPool(batches, fromWarehouseId) {
  const pool = (batches || [])
    .map((b) => {
      // No per-location breakdown (absent or empty) → the batch total counts
      // as the source balance; Zoho re-validates the TO on confirm anyway.
      const locs = (b.associated_locations || []).length ? b.associated_locations : null;
      const locations = locs
        ? locs.map((l) => ({ location_id: String(l.location_id), balance: num(l.balance_quantity) })).filter((l) => l.balance > 0)
        : [];
      const loc = locations.find((l) => l.location_id === String(fromWarehouseId));
      const available = locs ? (loc ? loc.balance : 0) : num(b.balance_quantity);
      return {
        batch_id: String(b.batch_id || ""), batch_number: b.batch_number, batch_available_stock: available, locations,
        // ponytail: /items/batches key spelling is undocumented — the packages
        // payload uses external_batch_number / manufacturer_date; both
        // spellings read, verify on the first live picker open.
        mfgBatch: b.external_batch_number || b.manufacturer_batch_number || "",
        mfgDate: b.manufacturer_date || b.manufactured_date || "",
        expiry: b.expiry_date || "",
      };
    })
    .filter((b) => b.batch_available_stock > 0 || b.locations.length);
  return pool.sort((a, b) => (a.mfgDate && b.mfgDate ? a.mfgDate.localeCompare(b.mfgDate) : a.mfgDate ? -1 : b.mfgDate ? 1 : 0));
}

/**
 * Live per-item batch records. Zoho's /items/{id} detail returns
 * locations[].batches as [] even when batch records exist (verified live:
 * receive-created batches show balances here but not on the item detail) —
 * the only reliable source is GET /items/batches?item_id=. Per-warehouse
 * availability sits in associated_locations[].balance_quantity.
 */
async function listItemBatchRecords(catalyst, itemId, fromWarehouseId) {
  const data = await apiRequest(catalyst, "GET", `/items/batches?item_id=${itemId}`, null, "inventory");
  return batchRecordsToPool(data.batches, fromWarehouseId);
}

/**
 * Batch-tracked items read their pool from the live batch endpoint, always:
 * the detail payload's batches (item-level or per location) are unreliable
 * (CR-139: empty, or present with no readable balance — CR-148), and when
 * present they used to gate the live call and hide real stock. The live
 * records replace them; pickSerialsBatches/listSerialsBatches then find the
 * pool via their item-level path. Serial items untouched (no such
 * detail-payload gap observed for serials).
 */
async function withBatchFallback(catalyst, item, itemId, fromWarehouseId) {
  if (!item || !(item.is_batch_tracked || item.track_batch_number)) return item;
  item.batches = await listItemBatchRecords(catalyst, itemId, fromWarehouseId);
  for (const w of [...(item.warehouses || []), ...(item.locations || [])]) delete w.batches;
  return item;
}

// Fetch the item detail then pick its serial/batch numbers for a transfer line.
async function availableSerialsBatches(catalyst, itemId, fromWarehouseId, qty, name) {
  if (qty <= 0) return {};
  const item = await withBatchFallback(catalyst, await getItemStock(catalyst, itemId), itemId, fromWarehouseId);
  return pickSerialsBatches(item, fromWarehouseId, qty, name);
}

/**
 * Pure: the FULL serial/batch pool at a warehouse — what the picker dialog
 * offers (CR-121). Same defensive reads as pickSerialsBatches, but returns
 * everything instead of slicing the first qty. Only batches with stock at the
 * source are listed (CR-152); stock sitting in other locations is summed per
 * location into `elsewhere` so the picker can say where it went.
 * → { tracking: 'serial'|'batch'|null, serials?: [...],
 *     batches?: [{batch_id, batch_number, mfgBatch, mfgDate, expiry, available}],
 *     elsewhere?: [{location_id, balance}] }
 */
function listSerialsBatches(item, fromWarehouseId) {
  if (!item) return { tracking: null };
  const isSerial = Boolean(item.is_serial_number_tracked || item.track_serial_number);
  const isBatch = Boolean(item.is_batch_tracked || item.track_batch_number);
  if (!isSerial && !isBatch) return { tracking: null };
  const fromWh = [...(item.warehouses || []), ...(item.locations || [])]
    .find((w) => whId(w) === String(fromWarehouseId));
  if (isSerial) {
    const serials = ((fromWh && fromWh.serial_numbers) || item.serial_numbers || [])
      .map((s) => (typeof s === "string" ? s : s.serial_number || s.serialnumber))
      .filter(Boolean);
    return { tracking: "serial", serials };
  }
  const pool = (fromWh && (fromWh.batches || []).length ? fromWh.batches : item.batches) || [];
  const batches = pool
    .map((b) => ({
      batch_id: String(b.batch_id || ""),
      batch_number: b.batch_number,
      mfgBatch: b.mfgBatch || "",
      mfgDate: b.mfgDate || "",
      expiry: b.expiry || "",
      available: num(b.batch_available_stock ?? b.balance_quantity ?? b.quantity_in ?? b.quantity ?? b.batch_quantity),
    }))
    .filter((b) => b.available > 0);
  const byLoc = {};
  for (const b of pool) {
    for (const l of b.locations || []) {
      if (l.location_id !== String(fromWarehouseId)) byLoc[l.location_id] = (byLoc[l.location_id] || 0) + l.balance;
    }
  }
  const elsewhere = Object.entries(byLoc).map(([location_id, balance]) => ({ location_id, balance }));
  return { tracking: "batch", batches, elsewhere };
}

// Pure: a user's explicit picks ({serials:[...]}|{batches:[{batch_id,batch_number,qty}]},
// the MaterialTxnLine.trackingJson shape) → the Zoho transfer-line fields.
function trackingToLine(tracking) {
  if (!tracking) return null;
  if (Array.isArray(tracking.serials) && tracking.serials.length) {
    return { serial_numbers: tracking.serials.map(String) };
  }
  if (Array.isArray(tracking.batches) && tracking.batches.length) {
    return {
      batches: tracking.batches.map((b) => ({
        batch_id: String(b.batch_id || ""),
        batch_number: b.batch_number,
        quantity_transfer: num(b.qty),
      })),
    };
  }
  return null;
}

/**
 * The document every material movement writes (BRD §6.2–6.5): a Transfer Order
 * between two warehouses. Reserve = Main→Reserve, de-reserve = Reserve→Main,
 * issue = Reserve→Issue, return = Issue→Main — the caller supplies the pair.
 *
 * lines: [{ rmItemId, qty, name }]
 * numberHint: a Transfer Order number to fall back on if the org has auto-
 *   numbering OFF (Zoho then demands one, code 6) — auto-numbered orgs never see it.
 * soId: the originating Sales Order's Zoho id, published to the org's cf_so_no
 *   Transfer Order custom field. That field is a LOOKUP to Sales Orders, so its
 *   value must be the salesorder_id — a plain "SO-00029" string is silently
 *   dropped by Zoho (verified against the live org).
 */
async function createTransferOrder(catalyst, { date, fromWarehouseId, toWarehouseId, lines, reason, numberHint, soId }) {
  // The picks per line in the internal shape ({batch_number, quantity_transfer}
  // / serial_numbers) — the TO payload below renames them for Zoho, and the
  // caller's batch note needs the readable form.
  // Serial/batch-tracked items must carry their numbers or Zoho rejects the
  // line. An explicit user pick (CR-121, l.tracking) wins; otherwise FIFO
  // auto-pick — keeps auto-return sweeps and API callers working untouched.
  const picks = await Promise.all(lines.map((l) => trackingToLine(l.tracking)
    || availableSerialsBatches(catalyst, l.rmItemId, fromWarehouseId, Number(l.qty) || 0, l.name)));
  const pickedLines = lines.map((l, i) => ({ name: l.name || String(l.rmItemId), ...(picks[i] || {}) }));
  const line_items = lines.map((l, i) => {
    const picked = picks[i];
    return {
      item_id: String(l.rmItemId),
      name: l.name || String(l.rmItemId),
      quantity_transfer: Number(l.qty) || 0,
      ...(picked && picked.serial_numbers ? { serial_numbers: picked.serial_numbers } : {}),
      // TO batch lines take out_quantity, NOT quantity_transfer (Zoho rejects
      // with "Invalid value passed for out_quantity") — same shape the bundle
      // path already uses.
      ...(picked && picked.batches
        ? { batches: picked.batches.map((b) => ({ batch_id: String(b.batch_id || ""), out_quantity: num(b.quantity_transfer) })) }
        : {}),
    };
  });
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
    // SO traceability: rides on the org's cf_so_no TO custom field (a Sales
    // Order lookup — value is the salesorder_id). An org without the field gets
    // a retry without custom_fields below — a missing custom field must never
    // block a stock move.
    custom_fields: soId ? [{ api_name: "cf_so_no", value: String(soId) }] : undefined,
  };
  const post = async (b) => {
    try {
      const data = await apiRequest(catalyst, "POST", "/transferorders", b, "inventory");
      return data.transfer_order;
    } catch (err) {
      // Auto-numbering off → Zoho demands the number (code 6). Supply one only
      // then, so orgs that auto-number keep their own sequence.
      if (err.zohoCode === 6 && numberHint) {
        const data = await apiRequest(
          catalyst, "POST", "/transferorders",
          { ...b, transfer_order_number: String(numberHint) }, "inventory",
        );
        return data.transfer_order;
      }
      throw err;
    }
  };
  let to;
  try {
    to = await post(body);
  } catch (err) {
    if (!body.custom_fields) throw err;
    to = await post({ ...body, custom_fields: undefined });
  }
  // The batch/serial picks made for each line (Haresh item 13) — the caller
  // records them on the transaction notes. Not part of Zoho's response.
  return { ...to, pickedLines };
}

/**
 * Assemble a composite item (CR-126): POST /bundles consumes component stock
 * at the source (Issue) warehouse and produces the composite's stock there
 * too (single-location, CR-175). Tracked components carry the user's explicit
 * serial/batch picks (CR-176, `tracking` — the CR-123 picker shape), else get
 * FIFO-picked numbers (same pool logic as transfer orders); a tracked
 * composite gets generated finished-product numbers from the reference.
 *
 * components: [{ rmItemId, qty, name, tracking? }]
 * ponytail: doc-verified field names (reference_number, quantity_to_bundle,
 * line_items[].quantity_consumed, batches[].out_quantity,
 * finished_product_serial_numbers/_batches) — confirm against the live org on
 * the first real assembly; account_id is documented required but omitted here
 * (composite carries its own accounts), retry surface if code demands it.
 */
// Pure: body fields for the produced units. finishedSerials (CR-150 year
// series) win over the reference-derived fallback.
function finishedProductFields({ referenceNumber, units, fgSerial, fgBatch, finishedSerials }) {
  return {
    ...(fgSerial
      ? { finished_product_serial_numbers: (finishedSerials && finishedSerials.length)
          ? finishedSerials.map(String)
          : Array.from({ length: units }, (_, i) => `${referenceNumber}-${i + 1}`) }
      : {}),
    ...(fgBatch
      ? { finished_product_batches: [{ batch_number: String(referenceNumber), in_quantity: units }] }
      : {}),
  };
}

// A Zoho assembly is single-location (CR-175): components are deducted from and
// the finished item is added to the header `location_id`. Per-line locations
// are ignored — sending Main at the header with Issue on the lines made Zoho
// look for the component batches in Main ("Batch 888 is not available in
// selected branch", code 2324). So the bundle lives at `fromWarehouseId`
// (Issue); assembly.js then transfers the finished good to Main.
async function createBundle(catalyst, {
  date, referenceNumber, compositeItemId, compositeItemName, compositeItemSku,
  qty, components, finishedSerials, fromWarehouseId, description,
}) {
  const line_items = await Promise.all(components.map(async (c) => {
    const picked = trackingToLine(c.tracking)
      || await availableSerialsBatches(catalyst, c.rmItemId, fromWarehouseId, Number(c.qty) || 0, c.name);
    return {
      item_id: String(c.rmItemId),
      name: c.name || String(c.rmItemId),
      quantity_consumed: Number(c.qty) || 0,
      // No per-line location: the bundle's header location_id is where every
      // component is consumed (verified against /bundles/editpage, CR-175).
      ...(picked.serial_numbers ? { serial_numbers: picked.serial_numbers } : {}),
      ...(picked.batches
        ? { batches: picked.batches.map((b) => ({ batch_id: b.batch_id, out_quantity: b.quantity_transfer })) }
        : {}),
    };
  }));
  // A serial/batch-tracked composite needs numbers for the produced units too.
  // /items/{id} is the usual source; the composite endpoint is the fallback in
  // case the flags only surface there (CR-126 "verify live").
  const tracked = (m) => [
    Boolean(m && (m.is_serial_number_tracked || m.track_serial_number)),
    Boolean(m && (m.is_batch_tracked || m.track_batch_number)),
  ];
  let [fgSerial, fgBatch] = tracked(await getItemStock(catalyst, compositeItemId).catch(() => null));
  if (!fgSerial && !fgBatch) [fgSerial, fgBatch] = tracked(await getCompositeItem(catalyst, compositeItemId).catch(() => null));
  const units = Number(qty) || 0;
  const body = {
    reference_number: String(referenceNumber),
    date,
    description: description || undefined,
    composite_item_id: String(compositeItemId),
    composite_item_name: compositeItemName,
    composite_item_sku: compositeItemSku || undefined,
    quantity_to_bundle: units,
    location_id: String(fromWarehouseId),
    line_items,
    is_completed: true,
    ...finishedProductFields({ referenceNumber, units, fgSerial, fgBatch, finishedSerials }),
  };
  // Zoho auto-numbers the bundle's Reference#; a manual value needs the
  // standard ignore flag (error 4097 otherwise). If the org still rejects it,
  // let Zoho number the bundle — the WO reference lives in `description` too.
  // 900001 ("unable to process your request… try again") is Zoho's internal
  // error: retry once after a pause, and log the body so a repeat is
  // diagnosable — the exact payload replayed by hand validated fine (CR-175).
  const post = async (b, path) => {
    try {
      return await apiRequest(catalyst, "POST", path, b, "inventory");
    } catch (err) {
      if (err.zohoCode !== 900001) throw err;
      console.error("bundle 900001, retrying once; body:", JSON.stringify(b));
      await new Promise((r) => setTimeout(r, 3000));
      return apiRequest(catalyst, "POST", path, b, "inventory");
    }
  };
  try {
    return await post(body, "/bundles?ignore_auto_number_generation=true");
  } catch (err) {
    if (err.zohoCode !== 4097) throw err;
    delete body.reference_number;
    return post(body, "/bundles"); // { bundle_id, transaction_number, ... }
  }
}

async function getTransferOrder(catalyst, transferOrderId) {
  const data = await apiRequest(catalyst, "GET", `/transferorders/${transferOrderId}`, null, "inventory");
  return data.transfer_order;
}

module.exports = {
  isService, getCompositeItem, updateCompositeItem, updateCompositeItemFields, listCompositeItems, createCompositeItem,
  listWarehouses, getItemStock, listItemsWithStock, createTransferOrder, getTransferOrder,
  availableSerialsBatches, pickSerialsBatches, listSerialsBatches, withBatchFallback, listItemBatchRecords, batchRecordsToPool,
  trackingToLine, createBundle, finishedProductFields,
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

  // listSerialsBatches: full pool for the picker (CR-121).
  assert.deepStrictEqual(listSerialsBatches(null, "W1"), { tracking: null });
  assert.deepStrictEqual(listSerialsBatches({ item_id: "1" }, "W1"), { tracking: null });
  assert.deepStrictEqual(listSerialsBatches(serItem, "W1"), { tracking: "serial", serials: ["S1", "S2", "S3"] });
  const noMfg = { mfgBatch: "", mfgDate: "", expiry: "" };
  assert.deepStrictEqual(listSerialsBatches(batItem, "W1"), {
    tracking: "batch",
    batches: [
      { batch_id: "b1", batch_number: "B1", ...noMfg, available: 3 },
      { batch_id: "b2", batch_number: "B2", ...noMfg, available: 5 },
    ],
    elsewhere: [],
  });

  // batchRecordsToPool: live /items/batches records → source balance + where
  // the rest sits; a batch with nothing anywhere is dropped, and one with
  // stock only elsewhere survives in the pool (the picker hides it but reports
  // the location, CR-152).
  const records = [
    { batch_id: 1, batch_number: "111", associated_locations: [{ location_id: 10, balance_quantity: 2 }, { location_id: 20, balance_quantity: 3 }] },
    { batch_id: 2, batch_number: "222", associated_locations: [{ location_id: 20, balance_quantity: 4 }] },
    { batch_id: 3, batch_number: "333", associated_locations: [{ location_id: 10, balance_quantity: 0 }] },
    { batch_id: 4, batch_number: "444", balance_quantity: 6 },
  ];
  assert.deepStrictEqual(batchRecordsToPool(records, "10"), [
    { batch_id: "1", batch_number: "111", batch_available_stock: 2, locations: [{ location_id: "10", balance: 2 }, { location_id: "20", balance: 3 }], ...noMfg },
    { batch_id: "2", batch_number: "222", batch_available_stock: 0, locations: [{ location_id: "20", balance: 4 }], ...noMfg },
    { batch_id: "4", batch_number: "444", batch_available_stock: 6, locations: [], ...noMfg },
  ]);
  const liveItem = { is_batch_tracked: true, batches: batchRecordsToPool(records, "10") };
  assert.deepStrictEqual(listSerialsBatches(liveItem, "10"), {
    tracking: "batch",
    batches: [
      { batch_id: "1", batch_number: "111", ...noMfg, available: 2 },
      { batch_id: "4", batch_number: "444", ...noMfg, available: 6 },
    ],
    elsewhere: [{ location_id: "20", balance: 7 }],
  }, "zero-at-source batch hidden; its stock summed into elsewhere");

  // MFG fields + order: oldest manufacturing date first, undated last (CR-152).
  const dated = batchRecordsToPool([
    { batch_id: 5, batch_number: "NEW", balance_quantity: 1, manufacturer_date: "2026-03-01", external_batch_number: "M-2" },
    { batch_id: 6, batch_number: "UNDATED", balance_quantity: 1 },
    { batch_id: 7, batch_number: "OLD", balance_quantity: 1, manufactured_date: "2025-12-31", manufacturer_batch_number: "M-1", expiry_date: "2027-01-01" },
  ], "10");
  assert.deepStrictEqual(dated.map((b) => b.batch_number), ["OLD", "NEW", "UNDATED"]);
  assert.deepStrictEqual([dated[0].mfgBatch, dated[0].expiry, dated[1].mfgBatch], ["M-1", "2027-01-01", "M-2"], "both key spellings read");
  assert.deepStrictEqual(
    pickSerialsBatches({ is_batch_tracked: true, batches: dated }, "10", 2).batches.map((b) => b.batch_number),
    ["OLD", "NEW"], "FIFO auto-pick follows MFG date",
  );
  assert.deepStrictEqual(pickSerialsBatches(liveItem, "10", 3), {
    batches: [{ batch_id: "1", batch_number: "111", quantity_transfer: 2 }, { batch_id: "4", batch_number: "444", quantity_transfer: 1 }],
  }, "FIFO skips the batch with nothing at the source");

  // trackingToLine: explicit picks → transfer-line fields; empty/absent → null.
  assert.strictEqual(trackingToLine(null), null);
  assert.strictEqual(trackingToLine({ serials: [] }), null);
  assert.deepStrictEqual(trackingToLine({ serials: ["S2", "S3"] }), { serial_numbers: ["S2", "S3"] });
  assert.deepStrictEqual(trackingToLine({ batches: [{ batch_id: "b2", batch_number: "B2", qty: 2 }] }), {
    batches: [{ batch_id: "b2", batch_number: "B2", quantity_transfer: 2 }],
  });

  // finishedProductFields (CR-150): explicit serials win, reference fallback kept.
  assert.deepStrictEqual(
    finishedProductFields({ referenceNumber: "WO-1-A1", units: 2, fgSerial: true, fgBatch: true, finishedSerials: ["KGV2026001", "KGV2026002"] }),
    { finished_product_serial_numbers: ["KGV2026001", "KGV2026002"], finished_product_batches: [{ batch_number: "WO-1-A1", in_quantity: 2 }] },
  );
  assert.deepStrictEqual(
    finishedProductFields({ referenceNumber: "WO-1-A1", units: 2, fgSerial: true, fgBatch: false }),
    { finished_product_serial_numbers: ["WO-1-A1-1", "WO-1-A1-2"] },
  );
  assert.deepStrictEqual(finishedProductFields({ referenceNumber: "x", units: 1, fgSerial: false, fgBatch: false, finishedSerials: ["A"] }), {});

  console.log("zoho/inventoryApi.js self-check passed");
}
