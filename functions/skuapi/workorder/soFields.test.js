"use strict";
// Run: node functions/skuapi/workorder/soFields.test.js
const assert = require("assert");
const { soFields } = require("./soFields");

const BLANK_CFS = {
  buyerOrderNo: "", buyerOrderDate: "", woPriority: "",
  dueDate: "", machiningDoneDate: "", fittingDoneDate: "",
};

// Full custom-field set maps onto the WO columns.
assert.deepStrictEqual(
  soFields({
    date: "2026-09-01",
    shipment_date: "2026-10-15",
    custom_fields: [
      { label: "Buyer Order No", value: "PO-778" },
      { label: "Buyer Order Date", value: "2026-08-20" },
      { label: "Priority", value: "High" },
      { label: "WO Due Date", value: "2026-09-30" },
      { label: "Machining Completion Date", value: "2026-09-20" },
      { label: "Fitting Completion Date", value: "2026-09-25" },
    ],
  }),
  {
    soDate: "2026-09-01", shipmentDate: "2026-10-15",
    buyerOrderNo: "PO-778", buyerOrderDate: "2026-08-20", woPriority: "High",
    dueDate: "2026-09-30", machiningDoneDate: "2026-09-20", fittingDoneDate: "2026-09-25",
  },
);

// Labels match case- and whitespace-insensitively; values are trimmed.
assert.deepStrictEqual(
  soFields({ custom_fields: [{ label: "  PRIORITY ", value: " Urgent " }] }),
  { soDate: "", shipmentDate: "", ...BLANK_CFS, woPriority: "Urgent" },
);

// No custom_fields at all: built-ins still map, CF keys all present as "".
assert.deepStrictEqual(
  soFields({ date: "2026-09-01" }),
  { soDate: "2026-09-01", shipmentDate: "", ...BLANK_CFS },
);

// Unknown labels are ignored; a CF cleared in Books still emits "".
assert.deepStrictEqual(
  soFields({ custom_fields: [{ label: "Ship Via", value: "Road" }, { label: "Priority", value: "" }] }),
  { soDate: "", shipmentDate: "", ...BLANK_CFS },
);

// Null values don't crash.
assert.deepStrictEqual(
  soFields({ custom_fields: [{ label: "Priority", value: null }] }),
  { soDate: "", shipmentDate: "", ...BLANK_CFS },
);

console.log("soFields.test.js: all assertions passed");
