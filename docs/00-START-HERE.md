# 🧭 Start here

Baseline: 2026-11-14. Normative words MUST, MUST NOT and SHOULD express requirements, prohibitions and justified defaults. All capabilities are planned unless implementation evidence says otherwise.

## Reading order

1. [Product](01-PRODUCT.md), [UX](02-UX-DESIGN.md), [motion](03-MOTION-PERFORMANCE.md).
2. [Selection](04-SELECTION-GAMES.md), [reports](05-SESSIONS-REPORTS.md), [sharing](06-SHARING.md).
3. [Localization](07-I18N.md), [SEO](08-SEO.md), [PWA](09-PWA.md).
4. [Monetization](10-MONETIZATION.md), [privacy/security](11-PRIVACY-SECURITY.md).
5. [Architecture](12-ARCHITECTURE.md), [contracts](13-DATA-CONTRACTS.md), [admin](14-ADMIN-CONTENT.md).
6. [Implementation](15-IMPLEMENTATION.md), [acceptance](16-ACCEPTANCE.md), [operations](17-OPERATIONS.md).
7. [Red-team](18-RED-TEAM.md), [decisions](19-DECISIONS.md), [sources](20-SOURCES.md).

## Package contents and authority

README is the navigation/status overview. Numbered docs define behavior. contracts/*.json define serialized interfaces. config/*.json supplies selected limits, locale inventory and tokens. A fixture demonstrates one valid record; it is not a complete implementation or a translation. Requirement IDs in the product spec map to release evidence in acceptance.

If documents disagree, preserve existing data, block the affected change and resolve in the decision log. Do not infer legal certification, implemented translations or a running build from schema existence.

## What's actually available

Documentation, 110 locale metadata records, design tokens, 36 SVG documentation icons, JSON Schema contracts, an OpenAPI contract, representative fixtures, documentation CI and local validators. Application source, production configs, translations and game packs are intentionally not represented as completed work.

## Definition of ready for implementation

The blueprint fixes architecture and behavior. Codex can implement immediately without domain or advertising credentials. Production publishing additionally requires real operator information, providers, content reviews, language reviews and the evidence checklist. See [launch inputs](19-DECISIONS.md).

No public MVP. No guarantee of permanent zero maintenance, ad approval, legal certification or organic ranking. These limits do not reduce the mandatory functional scope.
