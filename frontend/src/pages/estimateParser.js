// Turns a CRM quote (with its Quoted_Items subform) into the estimate sheet's
// data shape — the same header + items structure the estimate prototype
// (estimate-prototype/msun-estimate.html) renders. Pure ESM, no React, so the
// test file can run it under plain node.

// ── line-description parser ──────────────────────────────────────────────────
// The description convention isn't pinned yet, so this is deliberately
// tolerant: "KEY:- VALUE" / "KEY: VALUE" lines become specs, a DESIGN line
// starts a size-row group, and lines like `4" / 100MM QTY 4 @ 10650` become
// size rows. Anything that doesn't yield at least one group with rows returns
// null and the caller falls back to a flat row.
// ponytail: heuristic regexes; tighten once the CRM description format is fixed.

const SPEC_RE = /^([A-Za-z][A-Za-z0-9 .\/&()#-]*?)\s*:-?\s*(.+)$/;
const SIZE_RE = /^(\d+(?:\.\d+)?\s*")\s*[\/,-]?\s*(\d+\s*MM)?(?:\s.*?(?:QTY|X)\s*:?-?\s*(\d+))?(?:.*?@\s*([\d,]+(?:\.\d+)?))?\s*$/i;

export function parseLineDescription(text) {
  if (!text) return null;
  const specs = [];
  const groups = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const size = line.match(SIZE_RE);
    if (size && cur) {
      cur.rows.push({
        size: size[1].replace(/\s+"/, '"'),
        mm: size[2] ? size[2].replace(/\s+/g, "") : "",
        qty: size[3] ? Number(size[3]) : null,
        rate: size[4] ? Number(size[4].replace(/,/g, "")) : null,
      });
      continue;
    }
    const spec = line.match(SPEC_RE);
    if (spec && spec[1].trim().toUpperCase() === "DESIGN") {
      cur = { design: spec[2].trim(), rows: [] };
      groups.push(cur);
      continue;
    }
    if (spec) specs.push([spec[1].trim(), spec[2].trim()]);
    else specs.push(["", line]); // continuation line, prototype style
  }
  const withRows = groups.filter((g) => g.rows.length);
  if (!withRows.length) return null;
  return { specs, groups: withRows };
}

// ── quote → estimate ─────────────────────────────────────────────────────────

function lookupName(v) {
  return (v && typeof v === "object" ? v.name : v) || "";
}

function ddmmyyyy(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}-${m}-${y}` : "";
}

export function buildEstimate(quote) {
  const lines = quote.Quoted_Items || quote.Product_Details || [];
  const items = lines.map((line, i) => {
    const title = lookupName(line.Product_Name || line.product);
    const qty = Number(line.Quantity) || 0;
    const rate = Number(line.List_Price) || 0;
    const parsed = parseLineDescription(line.Description);
    if (!parsed) {
      return {
        flat: true, sr: i + 1, title, text: line.Description || "",
        qty, rate, total: Number(line.Total) || qty * rate,
      };
    }
    // Rows missing qty/rate inherit the CRM line's values.
    const groups = parsed.groups.map((g) => ({
      design: g.design,
      rows: g.rows.map((r) => ({ ...r, qty: r.qty ?? qty, rate: r.rate ?? rate })),
    }));
    return { flat: false, sr: i + 1, title, specs: parsed.specs, groups };
  });

  return {
    header: {
      to: { name: lookupName(quote.Account_Name), contact: lookupName(quote.Contact_Name) },
      offerNo: quote.Quote_Number || quote.Subject || quote.id || "",
      date: ddmmyyyy(quote.Created_Time),
      discountPct: Number(quote.Discount) || null,
    },
    items,
  };
}

export function computeTotals(items, discountPct) {
  let totalA = 0;
  let totalQty = 0;
  for (const it of items) {
    if (it.flat) {
      totalA += it.total;
      totalQty += it.qty;
    } else {
      for (const g of it.groups) for (const r of g.rows) {
        totalA += r.qty * r.rate;
        totalQty += r.qty;
      }
    }
  }
  const disc = discountPct ? (totalA * discountPct) / 100 : 0;
  return { totalA, totalQty, disc, net: totalA - disc };
}
