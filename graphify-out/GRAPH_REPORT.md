# Graph Report - d:/sku-generator  (2026-05-24)

## Corpus Check
- Corpus is ~13,950 words - fits in a single context window. You may not need a graph.

## Summary
- 156 nodes · 177 edges · 21 communities (13 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.89)
- Token cost: 53,485 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `SKUGeneratorPage Component` - 18 edges
2. `Industry DB Model` - 7 edges
3. `Property Manager Page` - 7 edges
4. `Express Application (app.js)` - 6 edges
5. `Industries Router` - 6 edges
6. `SKU Router (generate + create-item)` - 6 edges
7. `SVG Icon Sprite Sheet` - 6 edges
8. `Property DB Model` - 5 edges
9. `Properties Router` - 5 edges
10. `Industries Admin Page` - 5 edges

## Surprising Connections (you probably didn't know these)
- `SKU Studio HTML Shell` --references--> `SKUGeneratorPage Component`  [INFERRED]
  frontend/index.html → frontend/src/pages/SKUGeneratorPage.jsx
- `Manual vs Range Property Value Types` --rationale_for--> `Property DB Model`  [INFERRED]
  backend/src/routes/sku.js → backend/prisma/migrations/20260523180134_init/migration.sql
- `Vite Config (proxy to backend)` --references--> `Server Entry Point (server.js)`  [EXTRACTED]
  frontend/vite.config.js → backend/src/server.js
- `Industries Admin Page` --calls--> `Industries Router`  [EXTRACTED]
  frontend/src/pages/IndustriesPage.jsx → backend/src/routes/industries.js
- `Property Manager Page` --calls--> `Industries Router`  [EXTRACTED]
  frontend/src/pages/PropertyManagerPage.jsx → backend/src/routes/industries.js

## Hyperedges (group relationships)
- **Prisma Data Hierarchy: Industry -> Property -> PropertyValue (cascade delete)** — db_IndustryModel, db_PropertyModel, db_PropertyValueModel, db_SKUItemModel [EXTRACTED 1.00]
- **SKU Generation Pipeline: Industry + Properties + PropertyValues -> SKU string** — db_IndustryModel, db_PropertyModel, db_PropertyValueModel, routes_SKURouter, page_SKUGeneratorPage [INFERRED 0.95]
- **Admin CRUD Pattern: Toolbar + Modal + Page + REST Router** — component_Toolbar, component_Modal, page_IndustriesPage, page_PropertyManagerPage, routes_IndustriesRouter, routes_PropertiesRouter [INFERRED 0.85]
- **Social Media Icons in Sprite Sheet** — icons_svg_sprite, icons_svg_bluesky, icons_svg_discord, icons_svg_github, icons_svg_x, icons_svg_social [EXTRACTED 1.00]
- **SKU Generation Flow** — skugeneratorpage_loadProperties, skugeneratorpage_generatePreview, api_skuGenerate [EXTRACTED 0.95]
- **Popover Interaction Pattern** — skugeneratorpage_openPopover, skugeneratorpage_popoverUI, skugeneratorpage_handleSelect [EXTRACTED 0.95]

## Communities (21 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (12): ModalBtn(), ModalFooter(), tbtn, inputStyle, labelStyle, thStyle, emptyProp, emptyVal (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (24): API /api/industries, API /api/industries/:id/properties, API /api/properties/:id/values, API /api/sku/create-item, API /api/sku/generate, API /api/sku-items, SKU Studio HTML Shell, Main JSX Entry Script Reference (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (22): Modal Component, Toolbar Component, Vite Config (proxy to backend), Industry DB Model, Property DB Model, PropertyValue DB Model, SKUItem DB Model, React App Root (App.jsx) (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (13): express, id, prisma, { PrismaClient }, router, cors, express, industriesRouter (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (3): T, App(), S

### Community 5 - "Community 5"
Cohesion: 0.2
Nodes (9): descParts, express, nameParts, num, prisma, { PrismaClient }, router, skuParts (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (6): express, id, industryId, prisma, { PrismaClient }, router

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (6): express, id, prisma, { PrismaClient }, propertyId, router

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (7): Bluesky Social Network Icon, Discord Icon, Documentation Icon (code file with brackets), GitHub Icon, Social / Community Icon (person with star badge), SVG Icon Sprite Sheet, X (Twitter) Icon

### Community 9 - "Community 9"
Cohesion: 0.33
Nodes (5): express, id, prisma, { PrismaClient }, router

### Community 10 - "Community 10"
Cohesion: 0.7
Nodes (4): addValues(), http, main(), post()

## Knowledge Gaps
- **85 isolated node(s):** `http`, `express`, `cors`, `industriesRouter`, `propertiesRouter` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **What connects `http`, `express`, `cors` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._