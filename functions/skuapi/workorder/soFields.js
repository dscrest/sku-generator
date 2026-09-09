"use strict";

/**
 * SO-derived WorkOrder fields (CR-110): the header-panel values denormalised
 * from the Zoho Books sales order. Custom fields are matched by label
 * (trimmed, case-insensitive) because Books api_names differ per org.
 * Column is `woPriority` — `priority` is a Catalyst reserved keyword.
 */
const CF_MAP = {
  "buyer order no": "buyerOrderNo",
  "buyer order date": "buyerOrderDate",
  "priority": "woPriority",
  "wo due date": "dueDate",
  "machining completion date": "machiningDoneDate",
  "fitting completion date": "fittingDoneDate",
};

/** Books SO object → the 8 WorkOrder columns, "" for anything absent. */
function soFields(so) {
  const out = {
    soDate: String(so.date || ""),
    shipmentDate: String(so.shipment_date || ""),
  };
  for (const col of Object.values(CF_MAP)) out[col] = "";
  for (const cf of so.custom_fields || []) {
    const col = CF_MAP[String(cf.label || "").trim().toLowerCase()];
    if (col) out[col] = String(cf.value ?? "").trim();
  }
  return out;
}

/** Columns the user owns after create (CR-113): SO value is prefill only. */
const USER_OWNED = new Set(["woPriority", "dueDate", "machiningDoneDate", "fittingDoneDate"]);

/** SO fields overlaid with non-empty user-entered values from the request body. */
function woHeaderFields(so, body = {}) {
  const out = soFields(so);
  const BODY_MAP = {
    priority: "woPriority",
    dueDate: "dueDate",
    machiningDoneDate: "machiningDoneDate",
    fittingDoneDate: "fittingDoneDate",
  };
  for (const [key, col] of Object.entries(BODY_MAP)) {
    const v = String(body[key] ?? "").trim();
    if (v) out[col] = v;
  }
  return out;
}

module.exports = { soFields, woHeaderFields, USER_OWNED };
