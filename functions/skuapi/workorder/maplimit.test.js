"use strict";
// Run: node functions/skuapi/workorder/maplimit.test.js
// mapLimit: the concurrency cap that keeps the stock reconcile under Catalyst's
// 30s function ceiling (was a serial loop that 408'd).
const assert = require("assert");
const { mapLimit } = require("./sync");

(async () => {
  // Processes every item.
  const seen = [];
  await mapLimit([1, 2, 3, 4, 5], 2, async (x) => { seen.push(x); });
  assert.deepStrictEqual(seen.sort(), [1, 2, 3, 4, 5]);

  // Never exceeds the cap, yet does run concurrently (peak reaches the limit).
  let active = 0, peak = 0;
  await mapLimit(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  assert.strictEqual(peak, 3, `peak concurrency ${peak}, expected 3`);

  // Empty input is a no-op (no workers, no throw).
  await mapLimit([], 6, async () => { throw new Error("should not run"); });

  // Paged full sweep: the offset/limit cursor reconcileOrg hands back must walk
  // every item exactly once and terminate. Mirror its exact slice/next/done math.
  const page = (allIds, offset, limit) => {
    const slice = allIds.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    return { slice, nextOffset, done: nextOffset >= allIds.length };
  };
  for (const total of [0, 1, 49, 50, 51, 120]) {
    const allIds = Array.from({ length: total }, (_, i) => i);
    const walked = [];
    let offset = 0, done = false, guard = 0;
    do {
      const r = page(allIds, offset, 50);
      walked.push(...r.slice);
      offset = r.nextOffset; done = r.done;
      assert.ok(guard++ < 1000, "paging did not terminate");
    } while (!done);
    assert.deepStrictEqual(walked, allIds, `total ${total}: covered every id once`);
  }

  // Incremental delta (listItemsWithStock since / reconcileOrg cursor): a
  // newest-first list is kept until the first item older than the cursor; items
  // with no last_modified_time are kept (degrade to full, never dropped).
  const ms = (s) => (s ? new Date(s).getTime() : 0);
  const deltaKeep = (list, since) => {
    const out = [];
    for (const it of list) { if (it.lmt && ms(it.lmt) < ms(since)) break; out.push(it); }
    return out;
  };
  const desc = [
    { id: "a", lmt: "2026-08-29T12:31:07+0530" },
    { id: "b", lmt: "2026-08-29T11:56:37+0530" },
    { id: "c", lmt: "2026-08-20T09:00:00+0530" },
  ];
  assert.deepStrictEqual(deltaKeep(desc, "2026-08-29T11:56:37+0530").map((x) => x.id), ["a", "b"],
    "keeps boundary + newer, stops at older");
  assert.deepStrictEqual(deltaKeep(desc, "2026-08-30T00:00:00+0530").map((x) => x.id), [],
    "cursor newer than all → empty delta");
  assert.deepStrictEqual(
    deltaKeep([{ id: "x" }, { id: "y", lmt: "2026-01-01T00:00:00+0530" }], "2026-08-29T00:00:00+0530").map((x) => x.id),
    ["x"], "no-lmt item kept, then older stops");

  // New cursor = max last_modified_time of the batch (null when none).
  const newest = (list) => list.reduce((m, it) => (it.lmt && (!m || ms(it.lmt) > ms(m)) ? it.lmt : m), null);
  assert.strictEqual(newest(desc), "2026-08-29T12:31:07+0530");
  assert.strictEqual(newest([]), null);

  console.log("mapLimit ok");
})().catch((e) => { console.error(e); process.exit(1); });
