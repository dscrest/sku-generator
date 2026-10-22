"use strict";

/**
 * Safety net (CR-269): raw JavaScript runtime errors never reach a user.
 * Routes send `err.message` as-is, which is right for the errors they throw on
 * purpose (validation, Zoho API answers) and wrong for a TypeError out of a
 * bug — "Cannot read properties of undefined (reading 'get')" tells the user
 * nothing. One middleware scrubs every JSON response instead of each route
 * guarding its own catch; the original text goes to the log.
 *
 * ponytail: matches V8's message shapes, not the error class — the class is
 * gone by the time a route has put the message in a response. Add a shape here
 * when a new one shows up in the log.
 */
const RAW = new RegExp([
  "Cannot (?:read|set) propert",
  "Cannot destructure",
  "Cannot access '",
  "is not (?:a function|defined|iterable|a constructor)",
  "Unexpected (?:token|end of JSON)",
  "Maximum call stack",
  "Assignment to constant variable",
].join("|"));

const GENERIC = "Something went wrong on our side. Please try again.";

/** A response string with the raw runtime error taken out; anything else untouched. */
function scrub(text) {
  if (typeof text !== "string") return text;
  const at = text.search(RAW);
  if (at < 0) return text;
  // "<what failed> (<raw error>)" — the route's own context stays.
  const open = text.indexOf(" (");
  return open > 0 && open < at ? `${text.slice(0, open)} (internal error)` : GENERIC;
}

const FIELDS = ["error", "message"];

function scrubBody(body, onRaw = () => {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const clean = (v) => {
    const out = scrub(v);
    if (out !== v) onRaw(v);
    return out;
  };
  const out = { ...body };
  for (const k of FIELDS) if (k in out) out[k] = clean(out[k]);
  if (Array.isArray(out.problems)) out.problems = out.problems.map(clean);
  return out;
}

function scrubErrors(req, res, next) {
  const json = res.json.bind(res);
  // Path only — the query string can carry a session token or the sync secret.
  const where = `${req.method} ${String(req.originalUrl || "").split("?")[0]}`;
  res.json = (body) => json(scrubBody(body, (raw) => console.error(`[raw-error] ${where}: ${raw}`)));
  next();
}

module.exports = { scrubErrors, scrubBody, scrub };

if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  assert.strictEqual(scrub("Cannot read properties of undefined (reading 'get')"), GENERIC);
  assert.strictEqual(scrub("procMap.receiptAt.get is not a function"), GENERIC);
  assert.strictEqual(scrub("Unexpected token < in JSON at position 0"), GENERIC);
  assert.strictEqual(
    scrub("Quote configuration not read (Cannot read properties of undefined (reading 'get'))"),
    "Quote configuration not read (internal error)",
    "a prefixed problem keeps its context",
  );

  // Errors thrown on purpose pass through untouched.
  for (const ok of [
    "Work order not found",
    "reauth_required",
    "Zoho books API error: A custom field with the api field name cf_x doesnot exist. Please check. (code 120138)",
    "Sales order not updated with the WO number (Zoho books API error: Invalid URL Passed (code 5))",
  ]) assert.strictEqual(scrub(ok), ok);

  const seen = [];
  const body = { id: "7", error: "x is not defined", problems: ["Item 4 is not on SO-12", "BOM not read (y is not iterable)"], details: { a: 1 } };
  assert.deepStrictEqual(scrubBody(body, (r) => seen.push(r)), {
    id: "7", error: GENERIC, problems: ["Item 4 is not on SO-12", "BOM not read (internal error)"], details: { a: 1 },
  });
  assert.deepStrictEqual(seen, ["x is not defined", "BOM not read (y is not iterable)"], "originals go to the log");
  assert.strictEqual(body.error, "x is not defined", "caller's object is not mutated");

  // Arrays and non-objects (list endpoints, null) are sent as they are.
  const list = [{ error: "x is not defined" }];
  assert.strictEqual(scrubBody(list), list);
  assert.strictEqual(scrubBody(null), null);

  // The middleware end to end, on a fake response.
  const sent = [];
  const res = { json(b) { sent.push(b); return this; } };
  const log = console.error;
  const logged = [];
  console.error = (m) => logged.push(m);
  scrubErrors({ method: "GET", originalUrl: "/api/wo?t=secret-token" }, res, () => {});
  res.json({ error: "Cannot read properties of undefined (reading 'get')" });
  console.error = log;
  assert.deepStrictEqual(sent, [{ error: GENERIC }]);
  assert.deepStrictEqual(logged, ["[raw-error] GET /api/wo: Cannot read properties of undefined (reading 'get')"]);

  console.log("scrubErrors.js self-check passed");
}
