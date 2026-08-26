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

// Spec-only parse for the one-line-per-size convention (no DESIGN groups in
// the text): every line is `KEY: VALUE` or a continuation.
function parseSpecs(text) {
  if (!text) return null;
  const specs = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(SPEC_RE);
    specs.push(m ? [m[1].trim(), m[2].trim()] : ["", line]);
  }
  return specs.length ? specs : null;
}

const SIZE_KEY = /^size$/i;
const DESIGN_KEY = /^design(\s+type)?$/i;

function specValue(specs, keyRe) {
  const hit = specs.find(([k]) => keyRe.test(k));
  return hit ? hit[1] : "";
}

// ── quote → estimate ─────────────────────────────────────────────────────────

function lookupName(v) {
  return (v && typeof v === "object" ? v.name : v) || "";
}

// Quote-level discount % — the user-added Select_discount field (picklist,
// values like "25%" or "25"); tolerant of % signs, commas, spaces.
function parseDiscountPct(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[%,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ddmmyyyy(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}-${m}-${y}` : "";
}

// merge: false ("All Item - Trading") keeps every CRM line as its own item —
// same-name size-row lines are not collapsed into one printed item.
export function buildEstimate(quote, { merge = true } = {}) {
  const lines = quote.Quoted_Items || quote.Product_Details || [];
  const items = [];
  const merged = new Map(); // title → structured item accumulating size rows
  for (const line of lines) {
    const title = lookupName(line.Product_Name || line.product);
    const qty = Number(line.Quantity) || 0;
    const rate = Number(line.List_Price) || 0;
    const parsed = parseLineDescription(line.Description);
    if (parsed) {
      // Rows missing qty/rate inherit the CRM line's values.
      const groups = parsed.groups.map((g) => ({
        design: g.design,
        rows: g.rows.map((r) => ({ ...r, qty: r.qty ?? qty, rate: r.rate ?? rate })),
      }));
      items.push({ flat: false, title, specs: parsed.specs, groups });
      continue;
    }
    // One-CRM-line-per-size convention: same product repeated with a `Size:`
    // spec in each description → one printed item, one size row per line,
    // sectioned by Design/Design Type. Specs come from the first line.
    const specs = parseSpecs(line.Description);
    const sizeVal = specs && specValue(specs, SIZE_KEY);
    if (sizeVal) {
      const [size, mm = ""] = sizeVal.split(/\s*\|\s*/);
      const design = specValue(specs, DESIGN_KEY).toUpperCase();
      let item = merge ? merged.get(title) : null;
      if (!item) {
        item = { flat: false, title, specs: specs.filter(([k]) => !SIZE_KEY.test(k)), groups: [] };
        if (merge) merged.set(title, item);
        items.push(item);
      }
      let g = item.groups.find((x) => x.design === design);
      if (!g) item.groups.push(g = { design, rows: [] });
      g.rows.push({ size: size.trim(), mm: mm.trim(), qty, rate });
      continue;
    }
    items.push({
      flat: true, title, text: line.Description || "",
      qty, rate, total: Number(line.Total) || qty * rate,
    });
  }
  items.forEach((it, i) => { it.sr = i + 1; });

  // Client details from the raw Account/Contact records the API embeds under
  // _account/_contact. Billing_* / Phone / Mobile are standard Zoho fields;
  // ponytail: GSTIN + account email field names are guesses — correct them here
  // once a real record is inspected (raw _account is in the /quote response).
  const a = quote._account || {};
  const c = quote._contact || {};

  return {
    header: {
      to: {
        name: a.Account_Name || lookupName(quote.Account_Name),
        address: [a.Billing_Street, a.Billing_City, a.Billing_State, a.Billing_Code]
          .filter(Boolean).join(", "),
        phone: a.Phone || "",
        email: a.Email || a.Email_1 || "",
        gstin: a.GST_No || a.GSTIN || a.GST_NO || "",
        contact: lookupName(quote.Contact_Name) || c.Full_Name || "",
        mobile: c.Mobile || c.Phone || "",
      },
      // Offer No is the CRM Quote No: MSUN's custom `Quote_No` field
      // (e.g. MSUN-Q-0021), falling back to the standard `Quote_Number`. No
      // Subject fallback — the Subject is a free-text title, not a quote number.
      offerNo: quote.Quote_No || quote.Quote_Number || "",
      date: ddmmyyyy(quote.Created_Time),
      discountPct: parseDiscountPct(quote.Select_discount) ?? (Number(quote.Discount) || null),
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
