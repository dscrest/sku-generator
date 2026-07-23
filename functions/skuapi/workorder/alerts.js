"use strict";

/**
 * Proactive alerts (BRD FR-ADO-006 and FR-ADO-008).
 *
 * Delivery is **email via the Catalyst Email service** plus the AlertLog rows
 * the UI shows as a badge. Catalyst push notifications need registered
 * devices/app-users, which a Books-side purchase team does not have — email is
 * what actually reaches them. AlertLog is what stops the daily cron re-sending
 * the same alert every night.
 */
const { zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { byOrg, settings, inList } = require("./store");
const { buildGrid } = require("./grid");

const n = (v) => Number(v) || 0;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: work orders whose BOM was imported at least `days` ago and are still
 * open. The BRD's rule is "4 days after the BOM import date" — `days` comes
 * from OrgSetting so MSUN can tune it without a deploy.
 */
function shortfallCandidates(workOrders, nowMs, days) {
  const cutoff = nowMs - n(days) * DAY_MS;
  return (workOrders || []).filter((w) => {
    if (["Closed", "Cancelled", "Completed"].includes(String(w.status))) return false;
    if (!w.bomImportedAt) return false;
    const at = new Date(w.bomImportedAt).getTime();
    return Number.isFinite(at) && at <= cutoff;
  });
}

/**
 * Pure: has the project cost crossed the configured percentage of its estimate?
 * A BOM raised past this point is what the BRD wants flagged.
 */
function costBreach(wo, pct) {
  const est = n(wo.estimatedCost);
  const actual = n(wo.actualCost);
  if (est <= 0) return null; // no estimate captured → nothing to compare against
  const ratio = (actual / est) * 100;
  return ratio >= n(pct) ? { pct: Math.round(ratio), estimatedCost: est, actualCost: actual } : null;
}

// Alerts already sent for these work orders, so the cron does not repeat itself.
async function alreadySent(catalyst, orgId, kind, refIds) {
  const ids = inList(refIds);
  if (!ids) return new Set();
  const rows = await byOrg(catalyst, orgId, "AlertLog", `kind = ${zStr(kind)} AND refId IN (${ids})`);
  return new Set(rows.map((r) => String(r.refId)));
}

async function record(catalyst, orgId, kind, refId, channel) {
  await catalyst.datastore().table("AlertLog").insertRow({
    orgId: String(orgId), kind, refId: String(refId), sentAt: dsDate(Date.now()), channel,
  });
}

/** Never throws — a mail failure must not stop the rest of the cron. */
async function email(catalyst, to, subject, body) {
  if (!to) return "no recipient configured";
  try {
    await catalyst.email().sendMail({
      from_email: process.env.ALERT_FROM_EMAIL || to,
      to_email: to,
      subject,
      content: body,
      html_mode: false,
    });
    return "email";
  } catch (err) {
    console.error("alert email failed:", err && err.message);
    return "failed";
  }
}

/**
 * One org's alert pass. Runs after the reconcile so it judges fresh numbers.
 */
async function evaluateOrg(catalyst, orgId) {
  const s = await settings(catalyst, orgId);
  const workOrders = await byOrg(catalyst, orgId, "WorkOrder");
  const out = { shortfall: [], costThreshold: [] };

  // --- shortfall: BOM imported N days ago, material still short, nothing on order
  const candidates = shortfallCandidates(workOrders, Date.now(), s.shortfallAlertDays);
  const sentShort = await alreadySent(catalyst, orgId, "shortfall", candidates.map((w) => w.ROWID));
  for (const wo of candidates) {
    if (sentShort.has(String(wo.ROWID))) continue;
    const fgs = await byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`);
    const shortRows = [];
    for (const fg of fgs) {
      const grid = await buildGrid(catalyst, orgId, wo, fg);
      // "no PO raised" is the BRD's condition — a row already on order is not late.
      shortRows.push(...grid.rows.filter((r) => r.short && r.po === 0));
    }
    if (!shortRows.length) continue;
    const lines = shortRows.map((r) => `  • ${r.name || r.itemId}: need ${r.needed}, only ${r.reservable} available`);
    const channel = await email(
      catalyst, s.purchaseTeamEmail,
      `Material shortfall — ${wo.woNumber} (SO ${wo.salesOrderNumber || "—"})`,
      [
        `${shortRows.length} raw material(s) on ${wo.woNumber} are short and no purchase order has been raised.`,
        `BOM imported: ${wo.bomImportedAt}. Customer: ${wo.customerName || "—"}.`,
        "",
        ...lines,
        "",
        "Open the work order's Purchase tab to raise a purchase request.",
      ].join("\n"),
    );
    await record(catalyst, orgId, "shortfall", wo.ROWID, channel);
    out.shortfall.push({ workOrder: wo.woNumber, items: shortRows.length, channel });
  }

  // --- cost threshold
  const breaching = workOrders.filter((w) => !["Closed", "Cancelled"].includes(String(w.status)) && costBreach(w, s.costAlertPct));
  const sentCost = await alreadySent(catalyst, orgId, "costThreshold", breaching.map((w) => w.ROWID));
  for (const wo of breaching) {
    if (sentCost.has(String(wo.ROWID))) continue;
    const b = costBreach(wo, s.costAlertPct);
    const channel = await email(
      catalyst, s.approverL1Email,
      `Cost threshold crossed — ${wo.woNumber} at ${b.pct}% of estimate`,
      `${wo.woNumber} (SO ${wo.salesOrderNumber || "—"}, ${wo.customerName || "—"}) has reached ${b.pct}% of its estimated cost ` +
      `(${b.actualCost} of ${b.estimatedCost}). Review before approving further BOM additions.`,
    );
    await record(catalyst, orgId, "costThreshold", wo.ROWID, channel);
    out.costThreshold.push({ workOrder: wo.woNumber, pct: b.pct, channel });
  }

  return out;
}

module.exports = { shortfallCandidates, costBreach, evaluateOrg };

// ponytail self-check: `node functions/skuapi/workorder/alerts.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const now = Date.parse("2026-07-23T00:00:00Z");
  const daysAgo = (d) => new Date(now - d * DAY_MS).toISOString();

  const wos = [
    { ROWID: "1", status: "InProgress", bomImportedAt: daysAgo(5) },   // overdue
    { ROWID: "2", status: "InProgress", bomImportedAt: daysAgo(4) },   // exactly at the cutoff
    { ROWID: "3", status: "InProgress", bomImportedAt: daysAgo(1) },   // too recent
    { ROWID: "4", status: "Closed", bomImportedAt: daysAgo(9) },       // closed
    { ROWID: "5", status: "Draft", bomImportedAt: null },              // never imported
  ];
  const got = shortfallCandidates(wos, now, 4).map((w) => w.ROWID);
  assert.deepStrictEqual(got, ["1", "2"], "4 days or older, still open, BOM imported");
  assert.deepStrictEqual(shortfallCandidates(wos, now, 10).map((w) => w.ROWID), [], "longer window → nothing due yet");
  assert.deepStrictEqual(shortfallCandidates([], now, 4), []);
  assert.deepStrictEqual(
    shortfallCandidates([{ ROWID: "6", status: "InProgress", bomImportedAt: "not a date" }], now, 4), [],
    "an unparseable date is skipped, not alerted on",
  );

  // Cost threshold.
  assert.strictEqual(costBreach({ estimatedCost: 100, actualCost: 79 }, 80), null, "below threshold → no alert");
  assert.deepStrictEqual(
    costBreach({ estimatedCost: 100, actualCost: 80 }, 80),
    { pct: 80, estimatedCost: 100, actualCost: 80 }, "exactly at threshold alerts",
  );
  assert.strictEqual(costBreach({ estimatedCost: 100, actualCost: 150 }, 80).pct, 150);
  assert.strictEqual(costBreach({ estimatedCost: 0, actualCost: 500 }, 80), null, "no estimate → nothing to compare");
  assert.strictEqual(costBreach({}, 80), null);

  console.log("workorder/alerts.js self-check passed");
}
