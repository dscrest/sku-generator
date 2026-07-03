---
name: list-row-ux-pattern
description: SUPERSEDED for record grids by record-grid-pattern — click-to-edit is out; hover pencil/trash + pagination/filters are the standard
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 069999c6-2448-4dba-ba3f-8bd2b61c40ab
---

> **2026-07-03 update: click-to-edit is retired for record grids.** The user asked to remove row-click edit and use an explicit hover pencil instead, plus mandatory pagination + filters — see [[record-grid-pattern]], which wins wherever the two conflict. Hover trash, param-based handlers, and Add+Refresh toolbars below still apply.

Standard interaction for every list/table of records in this app. Build all future lists this way — the user asked for it explicitly and wants consistency.

- **Row click = primary action.**
  - Plain list (SKU items, industries, property values): row click opens the **Edit modal** for that record.
  - Master-detail list (properties, which drive the values panel): row click **selects** to show the detail; edit is a hover **pencil** button on the row instead.
- **Delete = per-row red trash, revealed on row hover.** Same danger style + `confirm()` as before; do not put delete in the toolbar. Use the shared `components/RowDeleteButton.jsx`.
- **Toolbar keeps only Add + Refresh** (no Edit/Delete buttons, no selection requirement).
- **Handlers take the row object as an argument** (`handleDelete(item)`, `openEdit(item)`) — not a shared `selected` state.
- Action buttons `stopPropagation()` so they never trigger the row's click-to-edit. Wrap them in an element with `className="row-actions"` (or use RowDeleteButton, which already has it) and give the row `.list-row` if it's a div (table `tr` works automatically). Hover-reveal CSS lives in `frontend/src/index.css` (`.row-actions` + `tr:hover`/`.list-row:hover`), with a `@media (hover:none)` fallback that keeps actions visible on touch.
- Secondary navigation (e.g. industry name → its properties page) stays as an inline link with `stopPropagation`.

**Why:** single-click-to-edit removes the select-then-toolbar friction; hover-delete keeps the destructive action discoverable but out of the way. This is the standard data-table pattern (Linear/Notion/GitHub) and the user wants it everywhere.

**How to apply:** new list page → row `onClick` opens edit (or selects, if master-detail), append a `RowDeleteButton` cell/element, toolbar = Add + Refresh only, handlers param-based. Reference implementations: [SKUItemsPage.jsx], [IndustriesPage.jsx], [PropertyManagerPage.jsx].

Related: [[catalyst-deploy]].
