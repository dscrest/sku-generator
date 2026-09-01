"use strict";

/**
 * Data Store layer for the Work Order module: org configuration, the warehouse
 * map, document numbering and the audit log. Everything here is org-scoped —
 * callers pass the orgId that `requireOrg` pinned on the request.
 */
const { rowList, zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { ROUTES } = require("./formulas");

// BRD §13 leaves these open; defaults keep the module working until MSUN answers.
const DEFAULTS = {
  costAlertPct: "80",        // FR-ADO-006 — threshold % of estimated cost
  shortfallAlertDays: "4",   // FR-ADO-008 — days after BOM import before alerting
  woNumberPrefix: "WO-",
  prNumberPrefix: "PR-",
  txnNumberPrefix: "MT-",
};

const WAREHOUSE_KEYS = { main: "mainWarehouseId", reserve: "reserveWarehouseId", issue: "issueWarehouseId" };

// Every key the settings screen offers, in display order. Values with no
// default (the emails, the warehouse ids) are blank until an admin sets them.
const SETTING_KEYS = [
  { key: "mainWarehouseId", label: "Main warehouse", type: "warehouse" },
  { key: "reserveWarehouseId", label: "Reserve warehouse", type: "warehouse" },
  { key: "issueWarehouseId", label: "Issue warehouse", type: "warehouse" },
  { key: "purchaseTeamEmail", label: "Purchase team email", type: "email", hint: "Receives material shortfall alerts" },
  { key: "approverL1Email", label: "Approver — level 1", type: "email" },
  { key: "approverL2Email", label: "Approver — level 2", type: "email" },
  {
    key: "approvalLevels", label: "Approval levels", type: "select",
    hint: "Disabled = work orders need no approval",
    options: [
      { value: "", label: "Auto (from approver emails)" },
      { value: "0", label: "Disabled" },
      { value: "1", label: "1 level" },
      { value: "2", label: "2 levels" },
    ],
  },
  { key: "shortfallAlertDays", label: "Shortfall alert after (days)", type: "number", hint: "Days from BOM import before alerting" },
  { key: "costAlertPct", label: "Cost alert threshold (%)", type: "number", hint: "% of estimated cost that triggers a review" },
  { key: "woNumberPrefix", label: "Work order prefix", type: "text" },
  { key: "prNumberPrefix", label: "Purchase request prefix", type: "text" },
  { key: "txnNumberPrefix", label: "Material transaction prefix", type: "text" },
];

// Per-request memo: settings are read once per request, never cached across
// requests, so an admin edit takes effect on the very next call.
async function settings(catalyst, orgId) {
  if (catalyst.__woSettings) return catalyst.__woSettings;
  // Columns are settingKey/settingValue, not key/value — the bare words are
  // reserved in enough SQL dialects to not be worth the risk in ZCQL.
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT settingKey, settingValue FROM OrgSetting WHERE orgId = ${zStr(String(orgId))}`,
    ),
  );
  const merged = { ...DEFAULTS };
  for (const r of rows) if (r.settingValue !== null && r.settingValue !== "") merged[r.settingKey] = String(r.settingValue);
  catalyst.__woSettings = merged;
  return merged;
}

async function setSetting(catalyst, orgId, key, value) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM OrgSetting WHERE orgId = ${zStr(String(orgId))} AND settingKey = ${zStr(key)}`,
    ),
  );
  const table = catalyst.datastore().table("OrgSetting");
  const fields = { orgId: String(orgId), settingKey: String(key), settingValue: value === null ? "" : String(value) };
  if (rows.length) await table.updateRow({ ROWID: rows[0].ROWID, ...fields });
  else await table.insertRow(fields);
  delete catalyst.__woSettings;
}

/**
 * The three warehouse ids. Nothing in the module can move material until an
 * admin has picked them, so this fails loudly and says exactly what to do.
 */
async function warehouses(catalyst, orgId) {
  const s = await settings(catalyst, orgId);
  const map = {};
  const missing = [];
  for (const [role, key] of Object.entries(WAREHOUSE_KEYS)) {
    if (s[key]) map[role] = String(s[key]);
    else missing.push(role);
  }
  if (missing.length) {
    const err = new Error(
      `Warehouses not configured: ${missing.join(", ")}. Set them in Work Order → Settings before reserving material.`,
    );
    err.status = 400;
    throw err;
  }
  return map;
}

// { fromWarehouseId, toWarehouseId } for a transaction type.
async function routeFor(catalyst, orgId, type) {
  const route = ROUTES[type];
  if (!route) {
    const err = new Error(`Unknown transaction type "${type}"`);
    err.status = 400;
    throw err;
  }
  const wh = await warehouses(catalyst, orgId);
  return { fromWarehouseId: wh[route.from], toWarehouseId: wh[route.to] };
}

/**
 * Next human-readable document number, e.g. WO-0007.
 * ponytail: highest-existing + 1, no sequence table. Two documents created in
 * the same second could collide; at MSUN's volume (tens per day, one store
 * team) that is not reachable. Upgrade path is a per-org counter row taken
 * under an update-then-read.
 */
async function nextNumber(catalyst, orgId, table, column, prefix) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT ${column} FROM ${table} WHERE orgId = ${zStr(String(orgId))} ORDER BY ${column} DESC LIMIT 1`,
    ),
  );
  let n = 0;
  if (rows.length && rows[0][column]) {
    const digits = String(rows[0][column]).replace(/^\D+/, "");
    n = parseInt(digits, 10) || 0;
  }
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

/**
 * Audit trail (the auditability NFR): every status transition in every
 * sub-module lands here. Never throws — a failed log must not roll back the
 * business action it was recording.
 */
async function logActivity(catalyst, orgId, entityType, entityId, action, userId, detail) {
  try {
    await catalyst.datastore().table("ActivityLog").insertRow({
      orgId: String(orgId),
      entityType: String(entityType),
      entityId: String(entityId),
      action: String(action),
      userId: userId ? String(userId) : "",
      loggedAt: dsDate(Date.now()),
      detail: detail ? JSON.stringify(detail) : "",
    });
  } catch (err) {
    console.error("ActivityLog write failed:", err && err.message);
  }
}

// Rows of `table` belonging to one org, optionally filtered — the shape every
// module screen needs. `where` is already-escaped SQL (callers use zStr).
async function byOrg(catalyst, orgId, table, where, order) {
  let q = `SELECT * FROM ${table} WHERE orgId = ${zStr(String(orgId))}`;
  if (where) q += ` AND ${where}`;
  if (order) q += ` ORDER BY ${order}`;
  return rowList(await catalyst.zcql().executeZCQLQuery(q));
}

// Like byOrg but complete: pages past ZCQL's ~300-row cap on a ROWID cursor so
// callers that need every row (e.g. the warehouse-stock report's full
// per-warehouse set) never hit silent truncation.
async function byOrgAll(catalyst, orgId, table, where) {
  const PAGE = 290;
  const out = [];
  let last = "0";
  for (;;) {
    let q = `SELECT * FROM ${table} WHERE orgId = ${zStr(String(orgId))} AND ROWID > ${last}`;
    if (where) q += ` AND ${where}`;
    q += ` ORDER BY ROWID LIMIT ${PAGE}`;
    const page = rowList(await catalyst.zcql().executeZCQLQuery(q));
    out.push(...page);
    if (page.length < PAGE) return out;
    last = String(page[page.length - 1].ROWID);
  }
}

// ZCQL has no IN-with-empty-list; this keeps callers from building `IN ()`.
// Empty/null values are dropped too: callers pass ROWID lists, and a blank id
// (e.g. a consolidated PR's workOrderId "") makes ZCQL reject the whole query
// with "Invalid input value for BIGINT column 'ROWID'".
function inList(values) {
  const vals = values.filter((v) => v !== "" && v != null);
  return vals.length ? vals.map((v) => zStr(String(v))).join(",") : null;
}

// Sales orders a new work order can be raised against: confirmed only, and not
// already linked to a work order. `takenSoIds` is a Set of salesOrderId strings
// already on a WorkOrder. Books' API reports a confirmed SO as order_status
// "open" (the UI label "Confirmed" never appears in the status field — verified
// against the MSUN org, where header status can also be invoiced/overdue while
// order_status stays "open"); some editions do return status "confirmed", so
// both are accepted. Pure so it can be self-checked.
function creatableSalesOrders(sos, takenSoIds) {
  return (sos || []).filter((s) => {
    const confirmed = String(s.orderStatus).toLowerCase() === "open"
      || String(s.status).toLowerCase() === "confirmed";
    return confirmed && !takenSoIds.has(String(s.id));
  });
}

// How many approval levels this org requires (0, 1 or 2). The explicit
// `approvalLevels` setting wins; unset falls back to which approver emails are
// configured — none configured means no approval at all. Pure, self-checked.
function approvalLevelCount(s) {
  const v = String(s.approvalLevels ?? "").trim();
  if (v !== "") return Math.min(2, Math.max(0, Number(v) || 0));
  if (String(s.approverL2Email || "").trim()) return 2;
  if (String(s.approverL1Email || "").trim()) return 1;
  return 0;
}

// Sign-off is dynamic: every level up to the configured count must approve;
// zero levels means nothing is required. Pure so it can be self-checked.
function requiredLevelsMet(approvedLevels, levelCount) {
  return levelCount === 0 || (approvedLevels.has(1) && (levelCount < 2 || approvedLevels.has(2)));
}

module.exports = {
  DEFAULTS, WAREHOUSE_KEYS, SETTING_KEYS, settings, setSetting, warehouses, routeFor,
  nextNumber, logActivity, byOrg, byOrgAll, inList, creatableSalesOrders, requiredLevelsMet, approvalLevelCount,
};

// ponytail self-check: `node functions/skuapi/workorder/store.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  assert.strictEqual(inList([]), null, "empty list must not produce IN ()");
  assert.strictEqual(inList(["1", "2"]), "'1','2'");
  assert.strictEqual(inList(["o'brien"]), "'o''brien'", "quotes are escaped");
  assert.strictEqual(inList(["", "1"]), "'1'", "blank ids are dropped — ZCQL rejects '' for ROWID");
  assert.strictEqual(inList(["", null, undefined]), null, "all-blank list must not produce IN ()");

  // Fake catalyst: settings merge, memoisation, and the warehouse gate.
  const fake = (rows) => {
    let queries = 0;
    return {
      _count: () => queries,
      zcql: () => ({ executeZCQLQuery: async () => { queries++; return rows.map((r) => ({ OrgSetting: r })); } }),
    };
  };

  (async () => {
    const c1 = fake([]);
    const s1 = await settings(c1, "org1");
    assert.strictEqual(s1.costAlertPct, "80", "default fills in when unset");
    assert.strictEqual(s1.shortfallAlertDays, "4");
    await settings(c1, "org1");
    assert.strictEqual(c1._count(), 1, "settings are memoised per request");

    const c2 = fake([{ settingKey: "costAlertPct", settingValue: "65" }, { settingKey: "mainWarehouseId", settingValue: "" }]);
    const s2 = await settings(c2, "org1");
    assert.strictEqual(s2.costAlertPct, "65", "explicit value beats the default");
    assert.strictEqual(s2.mainWarehouseId, undefined, "empty string is not a configured value");

    await assert.rejects(
      () => warehouses(fake([{ settingKey: "mainWarehouseId", settingValue: "W1" }]), "org1"),
      /Warehouses not configured: reserve, issue/,
      "missing warehouses name themselves",
    );

    const whRows = [
      { settingKey: "mainWarehouseId", settingValue: "W1" },
      { settingKey: "reserveWarehouseId", settingValue: "W2" },
      { settingKey: "issueWarehouseId", settingValue: "W3" },
    ];
    assert.deepStrictEqual(await warehouses(fake(whRows), "org1"), { main: "W1", reserve: "W2", issue: "W3" });
    assert.deepStrictEqual(
      await routeFor(fake(whRows), "org1", "issue"),
      { fromWarehouseId: "W2", toWarehouseId: "W3" },
      "issue moves Reserve → Issue",
    );
    assert.deepStrictEqual(
      await routeFor(fake(whRows), "org1", "return"),
      { fromWarehouseId: "W3", toWarehouseId: "W1" },
      "return moves Issue → Main",
    );
    await assert.rejects(() => routeFor(fake(whRows), "org1", "nope"), /Unknown transaction type/);

    // Numbering continues from the highest existing document.
    const numFake = (row) => ({
      zcql: () => ({ executeZCQLQuery: async () => (row ? [{ WorkOrder: row }] : []) }),
    });
    assert.strictEqual(await nextNumber(numFake(null), "o", "WorkOrder", "woNumber", "WO-"), "WO-0001");
    assert.strictEqual(await nextNumber(numFake({ woNumber: "WO-0009" }), "o", "WorkOrder", "woNumber", "WO-"), "WO-0010");

    // Creatable SOs: confirmed only (order_status "open", or literal status
    // "confirmed" in editions that report it), and not already on a work order.
    const soList = [
      { id: "1", status: "open", orderStatus: "open" },            // confirmed (MSUN shape)
      { id: "2", status: "draft", orderStatus: "draft" },          // not confirmed
      { id: "3", status: "open", orderStatus: "open" },            // taken by a WO
      { id: "4", status: "draft", orderStatus: "pending_approval" }, // not confirmed
      { id: "5", status: "invoiced", orderStatus: "open" },        // confirmed + invoiced
      { id: "6", status: "confirmed" },                            // literal-status edition
    ];
    assert.deepStrictEqual(
      creatableSalesOrders(soList, new Set(["3"])).map((s) => s.id),
      ["1", "5", "6"],
      "keeps confirmed SOs, drops drafts/pending and SO 3 (already has a WO)",
    );
    assert.deepStrictEqual(creatableSalesOrders([], new Set()), []);

    // Dynamic approval: every level up to the configured count must sign off.
    assert.strictEqual(requiredLevelsMet(new Set(), 0), true, "zero levels means nothing required");
    assert.strictEqual(requiredLevelsMet(new Set([1]), 1), true, "L1 enough at one level");
    assert.strictEqual(requiredLevelsMet(new Set([1]), 2), false, "L1 not enough at two levels");
    assert.strictEqual(requiredLevelsMet(new Set([1, 2]), 2), true, "both satisfy two levels");
    assert.strictEqual(requiredLevelsMet(new Set([2]), 1), false, "L1 is required when any level is");

    // Level count: explicit setting wins, else derived from configured emails.
    assert.strictEqual(approvalLevelCount({}), 0, "nothing set up = no approval");
    assert.strictEqual(approvalLevelCount({ approverL1Email: "a@b.c" }), 1, "L1 email alone derives one level");
    assert.strictEqual(approvalLevelCount({ approverL2Email: "a@b.c" }), 2, "L2 email derives two levels");
    assert.strictEqual(approvalLevelCount({ approvalLevels: "0", approverL2Email: "a@b.c" }), 0, "explicit Disabled beats emails");
    assert.strictEqual(approvalLevelCount({ approvalLevels: "1", approverL2Email: "a@b.c" }), 1, "explicit count beats emails");
    assert.strictEqual(approvalLevelCount({ approvalLevels: "9" }), 2, "count is clamped to 2");

    console.log("workorder/store.js self-check passed");
  })().catch((err) => { console.error(err); process.exit(1); });
}
