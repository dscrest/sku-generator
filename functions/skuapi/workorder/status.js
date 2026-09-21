"use strict";
// Work-order status lifecycle (CR-159). Pure — no I/O — so the routes, the
// material-txn gate and the assembly gate all read the same table.
//
//   Draft → [PendingApproval →] Approved → ReadyForMachining → MachiningInProgress
//     → ReadyForFitting → FittingInProgress → ReadyForDispatch → Completed
//     → Dispatched → Closed
//   Hold      from any open status; resumes to `heldFrom` (reason logged).
//   Cancelled from anything open (de-reserves, CR-159).
//   Back      one step within the shop-floor stages (ReadyForMachining …
//             ReadyForDispatch) when work gets redone (CR-171). Nothing moves.
//
// Draft/PendingApproval only list ReadyForMachining because an org with
// approvals switched off (0 levels) has no other way out of Draft; the route
// 409s that move when approval levels are configured.

const FLOW = {
  Draft: ["ReadyForMachining", "Cancelled"],
  PendingApproval: ["Cancelled"],
  Approved: ["ReadyForMachining", "Cancelled"],
  ReadyForMachining: ["MachiningInProgress", "Cancelled"],
  MachiningInProgress: ["ReadyForFitting", "Cancelled"],
  ReadyForFitting: ["FittingInProgress", "Cancelled"],
  FittingInProgress: ["ReadyForDispatch", "Cancelled"],
  ReadyForDispatch: ["Completed", "Cancelled"],
  Completed: ["Dispatched"],
  Dispatched: ["Closed"],
  Closed: [],
  Cancelled: [],
  Hold: [],
};

// Nothing more happens to these — no edits, no material moves, no hold.
const DONE = ["Completed", "Dispatched", "Closed", "Cancelled"];
const EDIT_LOCKED = DONE;
const HOLDABLE = Object.keys(FLOW).filter((s) => !DONE.includes(s) && s !== "Hold");
// Reserve / issue only once the shop floor is ready for the material.
const MATERIAL_OK = ["ReadyForMachining", "MachiningInProgress", "ReadyForFitting", "FittingInProgress", "ReadyForDispatch"];
// Entering these stages asks for dates (CR-170): field → required. Ready for
// Machining takes both (fitting optional); Fitting in Progress insists on the
// fitting date if it is still blank.
const DATE_GATE = {
  ReadyForMachining: { machiningDoneDate: true, fittingDoneDate: false },
  FittingInProgress: { fittingDoneDate: true },
};
// Assembly at any shop-floor stage once an FG's material is fully issued
// (CR-172); the fully-issued check lives in assembly.js.
const ASSEMBLABLE = MATERIAL_OK;
// One step back within the shop floor (CR-171): status → previous stage.
const BACK = {
  MachiningInProgress: "ReadyForMachining",
  ReadyForFitting: "MachiningInProgress",
  FittingInProgress: "ReadyForFitting",
  ReadyForDispatch: "FittingInProgress",
};

function prevStatuses(wo) {
  const back = BACK[String(wo.status || "")];
  return back ? [back] : [];
}

function nextStatuses(wo) {
  const status = String(wo.status || "");
  if (status === "Hold") return wo.heldFrom ? [String(wo.heldFrom)] : [];
  return [...(FLOW[status] || []), ...prevStatuses(wo), ...(HOLDABLE.includes(status) ? ["Hold"] : [])];
}

module.exports = { FLOW, BACK, DONE, EDIT_LOCKED, HOLDABLE, MATERIAL_OK, DATE_GATE, ASSEMBLABLE, nextStatuses, prevStatuses };

// ponytail self-check: `node functions/skuapi/workorder/status.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  assert.deepStrictEqual(nextStatuses({ status: "Hold", heldFrom: "FittingInProgress" }), ["FittingInProgress"]);
  assert.deepStrictEqual(nextStatuses({ status: "Hold" }), [], "hold with no origin has nowhere to go");
  assert.deepStrictEqual(nextStatuses({ status: "Draft" }), ["ReadyForMachining", "Cancelled", "Hold"]);
  assert.deepStrictEqual(nextStatuses({ status: "FittingInProgress" }), ["ReadyForDispatch", "Cancelled", "ReadyForFitting", "Hold"], "one step back on the shop floor");
  assert.deepStrictEqual(prevStatuses({ status: "ReadyForMachining" }), [], "first shop-floor stage has nothing behind it");
  assert.deepStrictEqual(prevStatuses({ status: "Completed" }), [], "done statuses never step back");
  for (const [s, t] of Object.entries(BACK)) assert.ok(MATERIAL_OK.includes(s) && MATERIAL_OK.includes(t), `${s} ← ${t} must stay on the shop floor`);
  assert.deepStrictEqual(nextStatuses({ status: "Completed" }), ["Dispatched"], "done statuses are not holdable");
  assert.deepStrictEqual(nextStatuses({ status: "Closed" }), []);
  assert.deepStrictEqual(nextStatuses({ status: "Bogus" }), []);
  assert.ok(!MATERIAL_OK.includes("Draft") && !MATERIAL_OK.includes("Hold") && !MATERIAL_OK.includes("Completed"));
  assert.ok(!HOLDABLE.includes("Hold") && !HOLDABLE.includes("Cancelled") && HOLDABLE.includes("Approved"));
  assert.ok(ASSEMBLABLE.includes("ReadyForMachining") && !ASSEMBLABLE.includes("Hold") && !ASSEMBLABLE.includes("Completed"), "assemble on the shop floor only");
  for (const s of Object.keys(FLOW)) for (const t of FLOW[s]) assert.ok(t in FLOW, `${s} → ${t} unknown`);
  assert.ok(DATE_GATE.ReadyForMachining.machiningDoneDate && !DATE_GATE.ReadyForMachining.fittingDoneDate, "machining required, fitting optional");
  assert.ok(DATE_GATE.FittingInProgress.fittingDoneDate && !DATE_GATE.MachiningInProgress, "gates sit on entry, not exit");
  console.log("status.js selftest ok");
}
