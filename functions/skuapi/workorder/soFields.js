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

// ---- SO quantity changes (CR-204) -----------------------------------------

const n = (v) => Number(v) || 0;
const nullable = (v) => (v === null || v === undefined || v === "" ? null : n(v));

/**
 * Pure: which FGs' SO line quantity differs from the one we last saw
 * (`WorkOrderFG.soQty`). Matched by the stored SO line id, falling back to
 * the first unclaimed line of the same item (rows from before CR-204 have no
 * line id). `from` is null for a never-seen FG — the caller baselines
 * silently instead of flagging.
 */
function soQtyChanges(fgs, so) {
  const lines = (so && so.line_items) || [];
  const claimed = new Set();
  const out = [];
  for (const fg of fgs || []) {
    let line = fg.soLineItemId ? lines.find((l) => String(l.line_item_id) === String(fg.soLineItemId)) : null;
    if (!line) line = lines.find((l) => String(l.item_id) === String(fg.fgItemId) && !claimed.has(String(l.line_item_id)));
    if (!line) continue;
    claimed.add(String(line.line_item_id));
    const to = n(line.quantity);
    const from = nullable(fg.soQty);
    if (from !== null && from === to) continue;
    out.push({ fg, from, to, lineItemId: String(line.line_item_id || "") });
  }
  return out;
}

/**
 * Persist what soQtyChanges found: `soQty` = the SO's current qty, the line id
 * backfilled, and a `so.qty.changed` activity for a real change (a first
 * baseline is silent). Patches the fg rows in memory so the caller's response
 * is already fresh. Never throws — a Books hiccup must not fail the page.
 */
async function syncSoQty(catalyst, orgId, wo, fgs, so) {
  const { logActivity } = require("./store");
  const table = catalyst.datastore().table("WorkOrderFG");
  const changes = soQtyChanges(fgs, so);
  for (const c of changes) {
    const patch = { ROWID: String(c.fg.ROWID), soQty: c.to };
    if (!c.fg.soLineItemId && c.lineItemId) patch.soLineItemId = c.lineItemId;
    // First sight of this FG: what the planner created it for counts as acknowledged.
    if (c.from === null && nullable(c.fg.soAckQty) === null) patch.soAckQty = c.to;
    try {
      await table.updateRow(patch);
      Object.assign(c.fg, patch);
      if (c.from !== null) {
        await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "so.qty.changed", null, {
          fgId: String(c.fg.ROWID), fgName: c.fg.fgName, from: c.from, to: c.to,
        });
      }
    } catch (err) {
      console.error("syncSoQty:", err && err.message);
    }
  }
  return changes.filter((c) => c.from !== null).length;
}

// Pure: does this FG carry an unacknowledged SO quantity change?
function soQtyPending(fg) {
  const so = nullable(fg.soQty);
  const ack = nullable(fg.soAckQty);
  return so !== null && so !== (ack === null ? n(fg.fgQty) : ack);
}

// Pure (CR-245): the list's red ▲/▼ — first FG awaiting Apply / Dismiss, as
// { fgName, from, to } where `from` is what the WO currently stands at.
// ponytail: one arrow per WO; the Details banner lists every FG.
function soQtyChange(fgs) {
  const fg = (fgs || []).find(soQtyPending);
  if (!fg) return null;
  const ack = nullable(fg.soAckQty);
  return { fgName: fg.fgName, from: ack === null ? n(fg.fgQty) : ack, to: n(fg.soQty) };
}

// ---- new SO lines (CR-250) -------------------------------------------------
//
// `WorkOrder.soLinesJson` = { seen: [line ids], pending: [{ lineItemId, itemId,
// name, sku, qty }] }. A line is "new" when it is neither a finished good on
// this WO nor in `seen`. Create baselines `seen` to every line on the SO (the
// planner's create-time picks are final), Add / Dismiss move a line to `seen`.
// Same shape as the qty flow: null state = pre-CR row → silent baseline.

const isService = (l) => Boolean(l) && l.product_type === "service";

function parseSoLines(wo) {
  try {
    const v = JSON.parse(String((wo && wo.soLinesJson) || ""));
    return v && typeof v === "object" ? { seen: v.seen || [], pending: v.pending || [] } : null;
  } catch { return null; }
}

// Line ids the FGs stand for — by stored line id, else the first unclaimed line of the item.
function claimedLineIds(fgs, lines) {
  const claimed = new Set();
  for (const fg of fgs || []) {
    let line = fg.soLineItemId ? lines.find((l) => String(l.line_item_id) === String(fg.soLineItemId)) : null;
    if (!line) line = lines.find((l) => String(l.item_id) === String(fg.fgItemId) && !claimed.has(String(l.line_item_id)));
    if (line) claimed.add(String(line.line_item_id));
  }
  return claimed;
}

/**
 * Pure: the next `soLinesJson` state for this WO given the SO as it is now.
 * `added` = lines that were not pending before (what to log). Service lines
 * never count. A line dropped from the SO simply stops being pending.
 */
function soNewLines(fgs, so, state) {
  const lines = ((so && so.line_items) || []).filter((l) => !isService(l));
  const claimed = claimedLineIds(fgs, lines);
  // Create passes no FGs and baselines every line (the picks are final). A
  // pre-CR WO (null state, FGs present) starts with its unclaimed lines pending
  // — a line Sales added before this shipped must still surface; the planner
  // dismisses a deliberately left-out line once. Silent in History either way.
  const baseline = !state;
  const seen = new Set(baseline && !(fgs || []).length
    ? lines.map((l) => String(l.line_item_id))
    : [...((state && state.seen) || []).map(String), ...claimed]);
  const pending = lines.filter((l) => !seen.has(String(l.line_item_id)))
    .map((l) => ({ lineItemId: String(l.line_item_id), itemId: String(l.item_id), name: l.name || "", sku: l.sku || "", qty: n(l.quantity) }));
  const before = new Set(((state && state.pending) || []).map((p) => String(p.lineItemId)));
  return { seen: [...seen].sort(), pending, added: baseline ? [] : pending.filter((p) => !before.has(p.lineItemId)) };
}

const soLinesJson = (s) => JSON.stringify({ seen: s.seen, pending: s.pending });

// Persist what soNewLines found + one `so.line.added` per newly pending line.
// Never throws — a Books hiccup must not fail the page. Returns the added count.
async function syncSoLines(catalyst, orgId, wo, fgs, so) {
  if (!so) return 0;
  const { logActivity } = require("./store");
  const next = soNewLines(fgs, so, parseSoLines(wo));
  const json = soLinesJson(next);
  if (json === String(wo.soLinesJson || "")) return 0;
  try {
    await catalyst.datastore().table("WorkOrder").updateRow({ ROWID: String(wo.ROWID), soLinesJson: json });
    wo.soLinesJson = json;
    for (const p of next.added) await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "so.line.added", null, p);
  } catch (err) {
    console.error("syncSoLines:", err && err.message);
  }
  return next.added.length;
}

module.exports = {
  soFields, woHeaderFields, USER_OWNED, soWoStamp, soQtyChanges, syncSoQty, soQtyPending, soQtyChange,
  parseSoLines, soNewLines, soLinesJson, syncSoLines,
};
