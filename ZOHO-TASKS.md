# Zoho Projects — open tasks (Dhiraj)

Portal 685674003. Owner filter: Dhiraj Sajagure (ZPUID 1414095000001402079). VP Duties project excluded.
Refresh: `get_tasks_by_portal` with filter `status all_open AND owner is 1414095000001402079`, drop project "VP Duties …";
then `get_task_comments` per task to update "Last comment" and the comment queue below.

Last synced: 2026-09-28 (tasks + comments + repo mapping); Studio Sairish tasks re-checked 2026-09-29

## Comment queue — needs Dhiraj

Ordered by urgency. ✅ = post the comment, 👀 = needs your review/decision first.

| # | Task | Why | Ready-made content |
|---|---|---|---|
| 1 | ✅ MV1-T195 Work Order | CR-243 / 244 / 247 deployed 26–28 Sep, not reported. Vishal's 4-Sep 8-point list never closed point-by-point. | CR-243 assembly runs from Ready row; CR-244 defect split (shop floor raises, store manager decides, photo upload); CR-247 SO WO-number stamp fix. 8-point map: §1 batch/serial → CR-139/152/176; §2 PO sync → CR-122; §3 auto assembly → CR-126/208; §4 receipt status → CR-122/170; §5 users & roles → CR-239; §6 print templates → CR-124; §7 extra qty → CR-122/170; §8 PO from WO → CR-103/138. QC in header → CR-161. |
| 2 | ✅ MV1-T266 Packing list | Dhiraj last commented 18-Sep. CR-205 + CR-207 shipped ~23-Sep, not reported. Vishal's "invoice details not arriving" is what CR-205 fixes. | CR-205: invoice custom fields flow in, Exporter's Ref from org profile, blank new package, faster load. CR-207: over-pack error is an inline banner. Still pending: re-upload packinglist.zip in Books widgets; verify Export + Domestic on a real SO. |
| 3 | ✅ MV1-T255 Quote templates | Status still "To Be Started" though CR-192 is deployed. CR-180 (Item Source labels) never reported here. Vinas 21-Sep "require changes done" + screenshots — confirm whether that means verified or new asks. | CR-192 T&C templates; CR-147 description one line per parameter; CR-180 per-org item-type labels (In-House Manufacturing / Direct Purchase) feeding CRM Item_Source; CR-191 Offer Prepared By + contact block. Ask Vinas to confirm and move status. |
| 4 | ✅ RD2-T492 BOM Item Module (Ricon) | No description, no comments ever, due 30-Sep. Product Designs + configurator BOM shipped. | Product Designs New/Edit Books-style page (CR-221/230/236), BOM under picked model in configurator (CR-227), BOM per quote line + saved quotes (CR-246). Ask Vishal to confirm this is the scope, or attach the requirement. |
| 5 | ✅ MV1-T260 Item search widget | Vinas 26-Sep says developed on Quote, Deal, Home. CR-232 not reported by you. Optional closing note. | CR-145/147/153 quote widget passes + CR-232 Home dashboard mode. Ask to move to testing/close. |
| 6 | 👀 SA6-T49 Simero item age report | Stale since May, waiting on client / Axon team via Vipul. | Decide: close as client-side, or ping Vipul once and set a drop-dead date. |

No comment needed right now: **MV1-T241** (your 28-Sep CR-087 comment is the latest; waiting on Vinas to verify), **RD2-T482** (CR-249 deployed + commented 28-Sep, Vishal to verify), **SGA4-T454** (GTG posted 28-Sep).

Done 2026-09-29: **SSAF-T12** is Closed in Zoho (closed 29-Sep 09:54 IST after Shyam delivered it to the client; further changes come as a separate task) — dropped from this list. **SSAF-T3** built and deployed to Dev (CR-255 / 257 / 258 on top of the earlier import CRs), comment posted for Krushika; status click Open → Running → To Be Tested needs the UI.

Done 2026-09-28: **SSAF-T12** closing comment posted, moved Running → To Be Tested; the last two blueprint clicks (Developed → Closed) need the UI (API rejects the read-only Start/Due during-fields). **SGA4-T454** prototype approved. **RD2-T482** CR-249 shipped, moved To Be Started → Open; move to To Be Tested in the UI.

## Msun Valve Private Limited — EST/26-27/00348 (project 1414095000027137109)

**MV1-T241 — Composite Item Creation From SKU Generator** · Open · due 2026-09-25 · high · Dhiraj, Vishal, Vinas · 1414095000028323134
- Repo: CR-087 push dialog (tracking + inventory account), CR-166 defaults in SKU Settings, CR-163/165/184/242 manufacturing push fixes
- Last comment: Dhiraj 28-Sep, "Done (CR-087)"
- Action: none, awaiting Vinas verification

**MV1-T255 — Modification Of Quote Templates** · To Be Started · due 2026-09-28 · high · Dhiraj, Vinas · 1414095000028533902
- Repo: CR-050 MSUN template pass, CR-147, CR-180, CR-191, CR-192
- Last comment: Vinas 21-Sep, "require changes done" + 2 screenshots (after your CR-192 note)
- Action: queue #3

**MV1-T266 — Packing List and Box sticker Print** · Running · due 2026-09-29 · none · Dhiraj, Vishal · 1414095000028822116
- Repo: CR-164/167/168 base, CR-186/187/188 portrait + per-type numbering, CR-205, CR-207
- Last comment: Dhiraj 18-Sep (CR-186/187/188); Vishal 17-Sep invoice fields not reflecting
- Action: queue #2

**MV1-T195 — Work Order** · To Be Tested · due 2026-10-03 · none · Vishal, Dhiraj · 1414095000027748031
- Repo: CR-013 → CR-247, the whole WO module. Unreported since 28-Sep: CR-243, CR-244, CR-247
- Last comment: Dhiraj 28-Sep (CR-245 SO qty arrows)
- Action: queue #1

**MV1-T260 — Widget: Item Search On Deal, Quote, Home Page** · Developed · due 2026-10-03 · high · Dhiraj, Vinas · 1414095000028703092
- Repo: CR-096/109 widget, CR-145/147/153 passes, CR-232 Home dashboard
- Last comment: Vinas 26-Sep, "Widget is developed as per requirement in Quote, Deal & Home page"
- Action: queue #5 (optional)

## Ricon Dynamic Engineers — EST/26-27/00350 (project 1414095000027814252)

**RD2-T482 — Work Order** · Open (move to Running → To Be Tested in UI) · due 2026-09-30 · none · Dhiraj, Vishal · 1414095000028271835
- Requirement: Main Warehouse picked per WO (Head Office vs Unit-2), stock on hand from that warehouse
- Repo: CR-249 (2026-09-28) — `WorkOrder.mainWarehouseId`, `store.warehouses(…, wo)`, New WO select + header + Edit, grid/txn/assembly/purchase/defects follow it. Deployed to Dev.
- Last comment: Dhiraj 28-Sep, CR-249 summary + verify steps for Vishal
- Action: none; awaiting Vishal's verification on the Ricon org. Production column pending before promote.

**RD2-T492 — BOM Item Module [SKU Generator]** · Open · due 2026-09-30 · none · Dhiraj · 1414095000028847056
- Repo (best match): Product Designs CR-221/230/234/236, configurator BOM CR-227/246, Component Map CR-194/195
- Last comment: none; no description on the task
- Action: queue #4

## SHREE GANESH CABLES — EST/26-27/00482 (project 1414095000028211296)

**SGA4-T454 — PR | R&D of custom module** · Running · due 2026-09-22 (overdue) · none · Dhiraj, Shubham Patel, Priyanshu · 1414095000028839819
- Repo: not this repo
- Last comment: Dhiraj 28-Sep, prototype approved / GTG
- Action: none; Priyanshu + Shubham build

## Support_Studio Sairish — EST/26-27/00944 (project 1414095000028604468)

**SSAF-T3 — R&D Auto Item create via Excel sheet and auto SKU Generate** · Open (move to Running → To Be Tested in UI) · due 2026-10-10 · high · Vishal S, Krushika, Dhiraj · 1414095000028569207
- Requirement: upload an item sheet → Name / SKU / Description per product type formula → item created in Books; same parameters again = next suffix, not a rejection
- Repo: CR-092, CR-127, CR-128, CR-132, CR-133, CR-136, CR-189, CR-255 (currency cells), CR-257 (product type per row, blank required = warning, typable column picker, Books export names auto-map), CR-258 (Product type box decides, "From Category Name")
- Last comment: Dhiraj 29-Sep, what shipped + setup note (Yarn / Thread / Filler product types have no properties on the org yet)
- Action: none; awaiting Krushika's testing. Open on our side: set up the Yarn / Thread / Filler properties, verify a real import on the org

## Simero AMC — EST/25-26/1927 (project 1414095000023798121)

**SA6-T49 — AO | VZ | Item Age Report Details Mismatch Data** · Waiting for Client Input · due 2026-04-04 (overdue) · none · Dhiraj, Vishal C, Vipul, Krishna · 1414095000024943103
- Repo: not this repo (Axon team via Vipul)
- Last comment: Bhumika 26-May asking whether it is still open
- Action: queue #6

## Excluded

- VP Duties Dhiraj Sajagure — 17 open tasks, intentionally not tracked here.
