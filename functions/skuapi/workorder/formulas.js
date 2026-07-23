"use strict";

/**
 * The Work Order grid, columns A–I. Single home for every number the module
 * shows or validates against — the BRD leaves one formula question open
 * (§13: is the Reserve vs De-Reserve formula difference intentional?), so when
 * the answer lands it changes here and nowhere else.
 *
 *   A  BOM / required      perUnitQty × fgQty            (WorkOrderLine.requiredQty)
 *   B  Stock on Hand       Main warehouse                (ItemStockSnapshot)
 *   C  Reserved            sitting in the Reserve WH     (ReservationLine)
 *   D  Issued              net of returns                (ReservationLine)
 *   E  PO                  ordered                       (PurchaseRequestLine)
 *   F  Received            GRN'd                         (PurchaseRequestLine)
 *   G  Billed              vendor-billed                 (PurchaseRequestLine)
 *   H  Reservable          max(0, min(A − C − D − G, B))  FR-RES-001
 *   I  Extra Reserved      A + C − D − G                  FR-DRS-001
 *
 * C and D are disjoint: issuing moves material out of the Reserve warehouse, so
 * it decrements C and increments D. That is what makes `A − C − D` the
 * still-outstanding requirement.
 */

const n = (v) => Number(v) || 0;

// Warehouse routing per action. Fixed by the BRD, not configurable — only the
// warehouse *ids* are per-org (OrgSetting).
const ROUTES = {
  reserve: { from: "main", to: "reserve" },
  dereserve: { from: "reserve", to: "main" },
  issue: { from: "reserve", to: "issue" },
  return: { from: "issue", to: "main" },
};
const TXN_TYPES = Object.keys(ROUTES);

/**
 * One grid row. Inputs are the raw parts; everything derived is computed here.
 *   line  { rmItemId, rmName, rmSku, requiredQty }
 *   stock { stockOnHand }                       — Main warehouse snapshot
 *   bal   { reservedQty, issuedQty, returnedQty } — our ReservationLine
 *   po    { poQty, receivedQty, billedQty }      — summed PurchaseRequestLines
 */
function gridRow(line, stock, bal, po) {
  const A = n(line.requiredQty);
  const B = n(stock && stock.stockOnHand);
  const C = n(bal && bal.reservedQty);
  const D = n(bal && bal.issuedQty) - n(bal && bal.returnedQty);
  const E = n(po && po.poQty);
  const F = n(po && po.receivedQty);
  const G = n(po && po.billedQty);

  const H = Math.max(0, Math.min(A - C - D - G, B));
  const I = A + C - D - G;
  const needed = Math.max(0, A - C - D);

  return {
    itemId: String(line.rmItemId),
    workOrderLineId: line.ROWID ? String(line.ROWID) : line.id || null,
    name: line.rmName || null,
    sku: line.rmSku || null,
    uom: line.uom || null,
    bom: A,
    stock: B,
    reserved: C,
    issued: D,
    po: E,
    received: F,
    billed: G,
    reservable: H,
    extraReserved: I,
    needed,
    // Red row: what is still needed cannot be covered from stock → reorder.
    short: H < needed,
    // Pre-filled quantity for the Purchase Request when the row is short.
    shortfallQty: Math.max(0, needed - H - Math.max(0, E - F)),
  };
}

/**
 * How much of `row` this action may move.
 *
 * ponytail: de-reserve is capped at C (what is physically in the Reserve
 * warehouse), NOT at the BRD's Extra Reserved (I = A + C − D − G, which exceeds
 * the requirement and would authorise moving stock that isn't there). I is still
 * displayed as specified. Flagged as BRD §13 open point — if the client confirms
 * a different intent, change only this function.
 */
function cap(type, row) {
  switch (type) {
    case "reserve": return row.reservable;                 // ≤ H          FR-RES-001
    case "dereserve": return row.reserved;                 // ≤ C
    case "issue": return row.reserved;                     // ≤ C          FR-ISS-001
    case "return": return row.issued;                      // ≤ D (net)    FR-RET-001
    default: throw new Error(`Unknown transaction type "${type}"`);
  }
}

/**
 * Validate one action line. Returns null when fine, else a message written for
 * the person on the shop floor — it says what to do, not that validation failed.
 */
function validateLine(type, row, qty) {
  const q = n(qty);
  if (q <= 0) return `${row.name || "Item"}: quantity must be greater than zero`;
  const limit = cap(type, row);
  if (q > limit) {
    const why = {
      reserve: `only ${limit} can be reserved (stock on hand ${row.stock}, already reserved ${row.reserved})`,
      dereserve: `only ${limit} is reserved for this work order`,
      issue: `only ${limit} is reserved — reserve ${q - limit} more first`,
      return: `only ${limit} has been issued and not yet returned`,
    }[type];
    return `${row.name || "Item"}: ${q} exceeds what is available — ${why}`;
  }
  return null;
}

// Apply a confirmed transaction to the running balance. C and D are disjoint,
// so issue moves quantity from one to the other rather than adding to both.
function applyToBalance(type, bal, qty) {
  const q = n(qty);
  const b = {
    reservedQty: n(bal && bal.reservedQty),
    issuedQty: n(bal && bal.issuedQty),
    returnedQty: n(bal && bal.returnedQty),
  };
  if (type === "reserve") b.reservedQty += q;
  else if (type === "dereserve") b.reservedQty -= q;
  else if (type === "issue") { b.reservedQty -= q; b.issuedQty += q; }
  else if (type === "return") b.returnedQty += q;
  else throw new Error(`Unknown transaction type "${type}"`);
  return b;
}

module.exports = { ROUTES, TXN_TYPES, gridRow, cap, validateLine, applyToBalance };

// ponytail self-check: `node functions/skuapi/workorder/formulas.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const row = (l, s, b, p) => gridRow(l, s, b, p);

  // The BRD's own worked example (FR-RES-001): stock 2, BOM 4 → only 2 reservable.
  const r1 = row({ rmItemId: "1", rmName: "Shaft", requiredQty: 4 }, { stockOnHand: 2 }, {}, {});
  assert.strictEqual(r1.reservable, 2, "H is capped by stock on hand");
  assert.strictEqual(r1.short, true, "4 needed, 2 reservable → shortage");
  assert.strictEqual(r1.shortfallQty, 2, "2 short → 2 to purchase");

  // Plenty of stock: H is capped by the outstanding requirement, not by stock.
  const r2 = row({ rmItemId: "1", requiredQty: 4 }, { stockOnHand: 100 }, {}, {});
  assert.strictEqual(r2.reservable, 4, "H is capped by A when stock is ample");
  assert.strictEqual(r2.short, false, "no shortage when stock covers the BOM");

  // Partly reserved and partly issued: A − C − D.
  const r3 = row({ rmItemId: "1", requiredQty: 10 }, { stockOnHand: 100 },
    { reservedQty: 3, issuedQty: 2, returnedQty: 0 }, {});
  assert.strictEqual(r3.reserved, 3);
  assert.strictEqual(r3.issued, 2);
  assert.strictEqual(r3.reservable, 5, "10 − 3 reserved − 2 issued = 5");
  assert.strictEqual(r3.extraReserved, 11, "I = A + C − D − G = 10 + 3 − 2 − 0");

  // Returns are netted out of D.
  const r4 = row({ rmItemId: "1", requiredQty: 10 }, { stockOnHand: 100 },
    { reservedQty: 0, issuedQty: 5, returnedQty: 2 }, {});
  assert.strictEqual(r4.issued, 3, "D is issued net of returns");

  // Billed quantity reduces what may still be reserved (G in the formula).
  const r5 = row({ rmItemId: "1", requiredQty: 10 }, { stockOnHand: 100 }, {},
    { poQty: 4, receivedQty: 4, billedQty: 4 });
  assert.strictEqual(r5.reservable, 6, "10 − 4 billed = 6");

  // H can never go negative.
  const r6 = row({ rmItemId: "1", requiredQty: 2 }, { stockOnHand: 50 }, { reservedQty: 9 }, {});
  assert.strictEqual(r6.reservable, 0, "over-reserved → H clamps at 0, never negative");

  // Caps per action.
  const r7 = row({ rmItemId: "1", requiredQty: 10 }, { stockOnHand: 6 },
    { reservedQty: 4, issuedQty: 3, returnedQty: 1 }, {});
  assert.strictEqual(cap("reserve", r7), r7.reservable);
  assert.strictEqual(cap("dereserve", r7), 4, "de-reserve is capped at what sits in the Reserve WH");
  assert.strictEqual(cap("issue", r7), 4, "issue is capped at reserved");
  assert.strictEqual(cap("return", r7), 2, "return is capped at issued net of returns");
  assert.throws(() => cap("teleport", r7), /Unknown transaction type/);

  // Validation messages.
  assert.strictEqual(validateLine("issue", r7, 4), null, "at the cap is allowed");
  assert.strictEqual(validateLine("issue", r7, 0), "Item: quantity must be greater than zero");
  assert.match(validateLine("issue", r7, 6), /reserve 2 more first/, "message says how to fix it");

  // Balance transitions: issue moves reserved → issued, it does not double-count.
  assert.deepStrictEqual(
    applyToBalance("issue", { reservedQty: 5, issuedQty: 1, returnedQty: 0 }, 3),
    { reservedQty: 2, issuedQty: 4, returnedQty: 0 },
  );
  assert.deepStrictEqual(
    applyToBalance("reserve", {}, 7), { reservedQty: 7, issuedQty: 0, returnedQty: 0 },
  );
  assert.deepStrictEqual(
    applyToBalance("dereserve", { reservedQty: 7 }, 7), { reservedQty: 0, issuedQty: 0, returnedQty: 0 },
  );
  assert.deepStrictEqual(
    applyToBalance("return", { issuedQty: 5 }, 2), { reservedQty: 0, issuedQty: 5, returnedQty: 2 },
  );

  // Reserve → issue → return round trip leaves nothing allocated.
  let b = applyToBalance("reserve", {}, 5);
  b = applyToBalance("issue", b, 5);
  b = applyToBalance("return", b, 5);
  const rt = row({ rmItemId: "1", requiredQty: 5 }, { stockOnHand: 5 }, b, {});
  assert.strictEqual(rt.reserved, 0);
  assert.strictEqual(rt.issued, 0, "round trip nets back to zero allocated");
  assert.strictEqual(rt.reservable, 5, "and the material is reservable again");

  // Routing is exhaustive and each type has a distinct warehouse pair.
  assert.strictEqual(TXN_TYPES.length, 4);
  assert.deepStrictEqual(ROUTES.reserve, { from: "main", to: "reserve" });
  assert.deepStrictEqual(ROUTES.return, { from: "issue", to: "main" });

  console.log("workorder/formulas.js self-check passed");
}
