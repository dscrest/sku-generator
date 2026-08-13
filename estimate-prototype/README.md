# MSUN Valve — Estimate Prototype

A throwaway prototype of the MSUN Valve "Techno Commercial Proposal" estimate, based on
**Estimate #1** (SS 304 Knife Edge Gate Valve → Phoenix Valsteer). Open
[`msun-estimate.html`](msun-estimate.html) directly in any browser — no build, no dependencies.

## Two templates

Toggle in the top toolbar; both render from the **same** `ESTIMATE` data object:

- **Template 1 · A–F (priced)** — all six columns the PDF pen-marks: `A` Sr.No, `B` Description,
  `C` Size, `D` Qty, `E` List Price/pc, `F` Total Amount — plus the Total-A / Disc @30% / Total
  footer.
- **Template 2 · A–D (technical)** — only Sr.No, Description, Size, Qty. No pricing, no money
  footer; shows the total Qty. This is the technical-only sheet.

**🖨 Print / Save PDF** uses the browser's native print (the toolbar is hidden on print), same
approach the main app already uses for Work Order print sheets — no PDF library.

Totals are computed from the row data (qty × rate), not hardcoded, and an inline console
self-check asserts they match the PDF's `13,12,800 / 3,93,840 / 9,18,960 / qty 25`.

## Later (deliberately deferred)

The `ESTIMATE` object mirrors a header + lines shape that would become `EstimateHeader` /
`EstimateLine` tables + a `functions/skuapi/routes/estimate.js` + an `Estimate*.jsx` page when
this graduates into the app as a real change request. Also deferred: item grouping "by page"
(Valve/Body/Operation), page-wise subtotals + tick-marks, cost sheet, USD/INR export, terms &
conditions page, Estimates 2–4, and Zoho Books estimate push.
