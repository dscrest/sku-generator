"use strict";
// Run: node functions/skuapi/workorder/soFields.test.js
const assert = require("assert");
const { soFields, woHeaderFields, USER_OWNED, soWoStamp } = require("./soFields");

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

console.log("soFields.test.js: all assertions passed");
