"use strict";
// Run: node functions/skuapi/workorder/soFields.test.js
const assert = require("assert");
const { soFields, woHeaderFields, USER_OWNED, soWoStamp, soQtyChanges, soQtyPending, soQtyChange, soNewLines, parseSoLines } = require("./soFields");

// ---- soNewLines (CR-250): SO lines that are not on the WO -------------------
{
  const so = { line_items: [
    { line_item_id: "L1", item_id: "I1", name: "A", sku: "A1", quantity: 4 },
    { line_item_id: "L2", item_id: "I2", name: "B", sku: "B1", quantity: 2 },
    { line_item_id: "L3", item_id: "S1", name: "Freight", quantity: 1, product_type: "service" },
  ] };
  const fgs = [{ ROWID: "F1", fgItemId: "I1", soLineItemId: "L1" }];
  // Create (no FGs yet): baseline every non-service line, nothing pending.
  assert.deepStrictEqual(soNewLines([], so, null), { seen: ["L1", "L2"], pending: [], added: [] });
  // Pre-CR WO (null state, FGs present): unclaimed lines are pending, silently (no History).
  assert.deepStrictEqual(soNewLines(fgs, so, null), {
    seen: ["L1"], pending: [{ lineItemId: "L2", itemId: "I2", name: "B", sku: "B1", qty: 2 }], added: [],
  });
  // Seen L1 only → L2 is new (and is what gets logged); the service line never counts.
  const s1 = soNewLines(fgs, so, { seen: ["L1"], pending: [] });
  assert.deepStrictEqual(s1.pending, [{ lineItemId: "L2", itemId: "I2", name: "B", sku: "B1", qty: 2 }]);
  assert.deepStrictEqual(s1.added, s1.pending);
  assert.deepStrictEqual(s1.seen, ["L1"], "seen grows only by Add / Dismiss / FG claim");
  // Already pending → still pending, not "added" again.
  assert.deepStrictEqual(soNewLines(fgs, so, { seen: ["L1"], pending: s1.pending }).added, []);
  // An FG created from the line (by item, no stored line id) claims it.
  assert.deepStrictEqual(soNewLines([...fgs, { ROWID: "F2", fgItemId: "I2", soLineItemId: "" }], so, { seen: [], pending: s1.pending }).pending, []);
  // Dismissed (in seen) → silent; dropped from the SO → stops pending.
  assert.deepStrictEqual(soNewLines(fgs, so, { seen: ["L1", "L2"], pending: [] }).pending, []);
  assert.deepStrictEqual(soNewLines(fgs, { line_items: so.line_items.slice(0, 1) }, { seen: ["L1"], pending: s1.pending }).pending, []);
  assert.deepStrictEqual(soNewLines(fgs, null, { seen: [], pending: [] }), { seen: [], pending: [], added: [] });
  assert.strictEqual(parseSoLines({ soLinesJson: "not json" }), null);
  assert.deepStrictEqual(parseSoLines({ soLinesJson: '{"seen":["L1"]}' }), { seen: ["L1"], pending: [] });
}

const BLANK = {
  soDate: "", shipmentDate: "", buyerOrderNo: "", buyerOrderDate: "", woPriority: "",
  freightCharge: "", delivery: "", booking: "", transporter: "", dueDate: "",
};

// Full custom-field set maps onto the WO columns; due date = built-in shipment date.
assert.deepStrictEqual(
  soFields({
    date: "2026-09-01",
    shipment_date: "2026-10-15",
    custom_fields: [
      { label: "Buyer Order No", value: "PO-778" },
      { label: "Buyer Order Date", value: "2026-08-20" },
      { label: "Priority", value: "High" },
      { label: "WO Due Date", value: "2026-09-30" },              // retired (CR-159) — ignored
      { label: "Machining Completion Date", value: "2026-09-20" }, // retired — ignored
      { label: "Freight Charge", value: "To Pay" },                  // CR-161
      { label: "Delivery", value: "Ex-works" },
      { label: "Booking", value: "Customer" },
      { label: "Transporter", value: "VRL" },
    ],
  }),
  {
    soDate: "2026-09-01", shipmentDate: "2026-10-15",
    buyerOrderNo: "PO-778", buyerOrderDate: "2026-08-20", woPriority: "High",
    freightCharge: "To Pay", delivery: "Ex-works", booking: "Customer", transporter: "VRL",
    dueDate: "2026-10-15",
  },
);

// A CF labelled "Expected Shipment Date" overrides the built-in; a blank one does not wipe it.
assert.deepStrictEqual(
  soFields({ shipment_date: "2026-10-15", custom_fields: [{ label: "Expected Shipment Date", value: "2026-10-20" }] }),
  { ...BLANK, shipmentDate: "2026-10-20", dueDate: "2026-10-20" },
);
assert.deepStrictEqual(
  soFields({ shipment_date: "2026-10-15", custom_fields: [{ label: "Expected Shipment", value: "" }] }),
  { ...BLANK, shipmentDate: "2026-10-15", dueDate: "2026-10-15" },
);

// Labels match case- and whitespace-insensitively; values are trimmed.
assert.deepStrictEqual(
  soFields({ custom_fields: [{ label: "  PRIORITY ", value: " Urgent " }] }),
  { ...BLANK, woPriority: "Urgent" },
);

// No custom_fields at all: built-ins still map, CF keys all present as "".
assert.deepStrictEqual(soFields({ date: "2026-09-01" }), { ...BLANK, soDate: "2026-09-01" });

// Unknown labels are ignored; a CF cleared in Books still emits "".
assert.deepStrictEqual(
  soFields({ custom_fields: [{ label: "Ship Via", value: "Road" }, { label: "Priority", value: "" }] }),
  BLANK,
);

// Null values don't crash.
assert.deepStrictEqual(soFields({ custom_fields: [{ label: "Priority", value: null }] }), BLANK);

// ---- woHeaderFields (CR-113): user-entered create-form priority wins --------

const SO = { date: "2026-09-01", shipment_date: "2026-09-18", custom_fields: [{ label: "Priority", value: "High" }] };

assert.deepStrictEqual(
  woHeaderFields(SO, { priority: "Urgent", dueDate: "2026-10-05", machiningDoneDate: "2026-10-01" }),
  { ...soFields(SO), woPriority: "Urgent" },
  "priority is user-owned; a body dueDate / machining date is ignored (CR-159)",
);

// Empty/absent/whitespace user values fall back to the SO custom field.
assert.deepStrictEqual(woHeaderFields(SO, { priority: "  " }), soFields(SO));
assert.deepStrictEqual(woHeaderFields(SO), soFields(SO));

// The user-owned column set is exactly priority.
assert.deepStrictEqual([...USER_OWNED], ["woPriority"]);

// ---- soWoStamp (CR-173): SO custom-field text ------------------------------
assert.strictEqual(soWoStamp({ woNumber: "WO-0012", woDate: "2026-09-16" }), "WO-0012 / 16/09/2026");
assert.strictEqual(soWoStamp({ woNumber: "WO-0012", woDate: "2026-09-16 00:00:00" }), "WO-0012 / 16/09/2026");
assert.strictEqual(soWoStamp({ woNumber: "WO-0012", woDate: "" }), "WO-0012");

// ---- soQtyChanges (CR-204): SO line qty vs the last-seen qty ---------------
const so2 = { line_items: [
  { line_item_id: "L1", item_id: "I1", quantity: 4 },
  { line_item_id: "L2", item_id: "I2", quantity: 2 },
  { line_item_id: "L3", item_id: "I2", quantity: 7 },
] };
const pick = (c) => ({ fg: c.fg.ROWID, from: c.from, to: c.to, lineItemId: c.lineItemId });
// Matched by line id: 3 → 4 is a change; an unchanged line is silent.
assert.deepStrictEqual(
  soQtyChanges([{ ROWID: "F1", fgItemId: "I1", soLineItemId: "L1", soQty: 3 }], so2).map(pick),
  [{ fg: "F1", from: 3, to: 4, lineItemId: "L1" }],
);
assert.deepStrictEqual(soQtyChanges([{ ROWID: "F1", fgItemId: "I1", soLineItemId: "L1", soQty: 4 }], so2), []);
// Never-seen FG (pre-CR-204 row): baseline with from = null, matched by item — two FGs of the
// same item claim distinct lines in order.
assert.deepStrictEqual(
  soQtyChanges([
    { ROWID: "F2", fgItemId: "I2", soLineItemId: "", soQty: null },
    { ROWID: "F3", fgItemId: "I2", soLineItemId: "", soQty: "" },
  ], so2).map(pick),
  [{ fg: "F2", from: null, to: 2, lineItemId: "L2" }, { fg: "F3", from: null, to: 7, lineItemId: "L3" }],
);
// A line no longer on the SO is ignored; a stale line id falls back to the item.
assert.deepStrictEqual(soQtyChanges([{ ROWID: "F9", fgItemId: "I9", soLineItemId: "L9", soQty: 1 }], so2), []);
assert.deepStrictEqual(
  soQtyChanges([{ ROWID: "F1", fgItemId: "I1", soLineItemId: "GONE", soQty: 1 }], so2).map(pick),
  [{ fg: "F1", from: 1, to: 4, lineItemId: "L1" }],
);
assert.deepStrictEqual(soQtyChanges([], so2), []);
assert.deepStrictEqual(soQtyChanges([{ ROWID: "F1", fgItemId: "I1" }], null), []);

// soQtyPending: badge only while the SO qty differs from what the planner acknowledged.
assert.strictEqual(soQtyPending({ fgQty: 3, soQty: 4, soAckQty: 3 }), true);
assert.strictEqual(soQtyPending({ fgQty: 3, soQty: 4, soAckQty: 4 }), false, "dismissed / applied");
assert.strictEqual(soQtyPending({ fgQty: 1, soQty: 3, soAckQty: 3 }), false, "planner chose fewer at create — not a change");
assert.strictEqual(soQtyPending({ fgQty: 3, soQty: null, soAckQty: null }), false, "never synced");
assert.strictEqual(soQtyPending({ fgQty: 3, soQty: 5, soAckQty: null }), true, "no ack recorded → compare with fgQty");

// soQtyChange (CR-245): list arrow = first pending FG; `from` is ack or fgQty.
assert.deepStrictEqual(
  soQtyChange([{ fgName: "A", fgQty: 3, soQty: 3, soAckQty: 3 }, { fgName: "B", fgQty: 5, soQty: 10, soAckQty: null }]),
  { fgName: "B", from: 5, to: 10 }, "up: skips the settled FG, from = fgQty when no ack",
);
assert.deepStrictEqual(soQtyChange([{ fgName: "A", fgQty: 5, soQty: 3, soAckQty: 10 }]), { fgName: "A", from: 10, to: 3 }, "down: from = ack");
assert.strictEqual(soQtyChange([{ fgName: "A", fgQty: 3, soQty: 3, soAckQty: 3 }]), null);
assert.strictEqual(soQtyChange([]), null);

console.log("soFields.test.js: all assertions passed");
