---
name: record-grid-pattern
description: "Standard UX every record grid must follow — pinned pagination footer (default 25), value-based filters, hover pencil/trash (no row-click edit)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5d2af88d-7ba0-46a1-8c82-043010667f92
---

Every record grid in this app must have (user directive 2026-07-03):

1. **Pagination footer, pinned at page level** (outside the scroll area, never moves): "Showing X–Y of Z records", page-size select 10/25/50/**100 with 25 default**, and First / Prev / Next / Last buttons with a "page / of" indicator.
2. **Filters fed by the values present in the grid** — `FilterSelect` dropdowns built from distinct column values, placed in the Toolbar's `right` slot.
3. **No row-click edit.** Edit is an explicit hover-revealed pencil (`RowEditButton`) next to the hover trash (`RowDeleteButton`), both inside a right-aligned cell. (This supersedes the click-to-edit part of [[list-row-ux-pattern]].)

**Why:** rows with click-to-edit fired accidentally while scanning; users wanted explicit controls and consistent navigation everywhere.

**How to apply:** reuse `frontend/src/components/GridFooter.jsx` (`usePager` + `<GridFooter>` + `FilterSelect` + `distinct`) and `RowEditButton.jsx` — do not hand-roll pagination in new grids. Reference implementations: `IndustriesPage.jsx`, `PropertiesPage.jsx` (SKUItemsPage predates the shared component but matches the behavior).
