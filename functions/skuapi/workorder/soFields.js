"use strict";

/**
 * SO-derived WorkOrder fields (CR-110): the header-panel values denormalised
 * from the Zoho Books sales order. Custom fields are matched by label
 * (trimmed, case-insensitive) because Books api_names differ per org.
 * Column is `woPriority` — `priority` is a Catalyst reserved keyword.
 *
 * CR-159: the WO due date IS the SO's Expected Shipment date — Books' built-in
 * `shipment_date`, or a custom field labelled "Expected Shipment (Date)" when
 * the org keeps it there. Machining / fitting dates are no longer tracked.
 */
const CF_MAP = {
  "buyer order no": "buyerOrderNo",
  "buyer order date": "buyerOrderDate",
  "priority": "woPriority",
  "expected shipment date": "shipmentDate",
  "expected shipment": "shipmentDate",
  // Logistics CFs on the SO (CR-161), shown read-only on the WO header.
  "freight charge": "freightCharge",
  "delivery": "delivery",
  "booking": "booking",
  "transporter": "transporter",
};

/** Books SO object → the WorkOrder header columns, "" for anything absent. */
function soFields(so) {
  const out = {
    soDate: String(so.date || ""),
    shipmentDate: String(so.shipment_date || ""),
  };
  for (const col of Object.values(CF_MAP)) if (!(col in out)) out[col] = "";
  for (const cf of so.custom_fields || []) {
    const col = CF_MAP[String(cf.label || "").trim().toLowerCase()];
    const v = String(cf.value ?? "").trim();
    // A blank CF must not wipe the built-in shipment date.
    if (col && (v || col !== "shipmentDate")) out[col] = v;
  }
  out.dueDate = out.shipmentDate;
  return out;
}

/** Columns the user owns after create (CR-113): SO value is prefill only. */
const USER_OWNED = new Set(["woPriority"]);

/** SO fields overlaid with non-empty user-entered values from the request body. */
function woHeaderFields(so, body = {}) {
  const out = soFields(so);
  const v = String(body.priority ?? "").trim();
  if (v) out.woPriority = v;
  return out;
}

/** Value for the SO's "Work Order No and Date" CF (CR-173): "WO-0012 / 16/09/2026". */
function soWoStamp(wo) {
  const [y, m, d] = String(wo.woDate || "").slice(0, 10).split("-");
  return d ? `${wo.woNumber} / ${d}/${m}/${y}` : String(wo.woNumber || "");
}

module.exports = { soFields, woHeaderFields, USER_OWNED, soWoStamp };
