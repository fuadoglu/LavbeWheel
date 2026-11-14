# 🏗️ Architecture and repository layout

## Chosen design

Static Astro HTML for public locale/tool routes, TypeScript islands for local interactions, Canvas presentation plus semantic DOM, IndexedDB for persistence, same-origin PHP API with PDO/MySQL for sharing and administration. A Node build runs in development/CI only. No always-on Node requirement on shared hosting. Third-party analytics/ads are isolated behind first-party consent adapters.

## Proposed application tree (not yet implemented)

| Path | Responsibility |
|---|---|
| apps/web | Astro routes, islands, styles, worker, public assets |
| apps/api | PHP routing, validation, sharing, admin, migrations and CLI jobs |
| packages/selection | Pure uniform/weighted/team algorithms and random-byte port |
| packages/session | State machine, IndexedDB port, history/round semantics |
| packages/ui | Semantic controls, themes and rendering adapters |
| packages/i18n | Catalog validation, negotiation and format adapters |
| packages/contracts | Generated TS/PHP-facing contract artifacts |
| content | Versioned packs, locale catalogs and reviewed public copy |
| contracts | Canonical JSON schemas, OpenAPI and fixtures |
| config | Limits, locale registry and design tokens |
| scripts | Build, validation, deployment and recovery tooling |
| docs | Normative specifications and operational evidence guidance |

## Module boundaries

Selection knows no DOM, storage, HTTP or analytics. Session orchestrates selection and transactional persistence. Renderer consumes selected result; it cannot draw a new winner. UI calls commands rather than mutating stores. API validates independent of client checks. Telemetry accepts an enumerated safe payload, not arbitrary objects.

## Request flows

Public request → CDN/static HTML → required locale/tool JS → IndexedDB. Spin stays local. Explicit share creation → validated PHP endpoint → encrypted MySQL snapshot → returned capabilities. Share read bypasses CDN/SW, is rendered by PHP shell and loaded into an independent local session only on explicit action. Admin publication → validated content export → CI/static build → immutable deployment artifact → reviewed promotion; shared host never needs a Node compiler.

## Versioning and compatibility

Use schemaVersion for wheels, engineVersion for selection, packVersion for game data, database migration sequence and buildId for assets. API /v1 remains backward compatible across at least two deployed web releases. Unknown schema versions fail with export/recovery guidance, not silent coercion. DB migrations follow expand → compatible deploy → eventual cleanup after retention. Do not remove old hashed assets while an installed client may use them.

## Deployment output

A release contains public_html static pages/assets plus /api and /s routing to PHP. Private application/config/vendor/storage directories are outside web root. Ship Apache rules with explicit routing order: existing static file, API router, shared shell, admin, true 404. A generic SPA fallback is prohibited. Exact provider rules are validated on staging. If hosting cannot keep secrets outside web root, provide verified deny rules or reject provider suitability.

## Dependency policy

During bootstrap choose currently supported Node/PHP/MySQL versions against host capability and upstream support. Baseline compatibility: Node 22+ build tooling, PHP 8.3+ with PDO_mysql/intl/sodium/mbstring, MySQL 8+ with utf8mb4. If a baseline version is no longer supported at implementation, select a newer supported version and log it. Lock npm and Composer dependencies; no runtime CDN imports. No app code is implied by this proposed layout.
