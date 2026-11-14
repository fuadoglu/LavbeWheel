# 🤖 Codex execution plan

## Starting conditions

This repository currently contains specifications and validators only. Work packages are internal sequencing, not separately publishable MVPs. All mandatory requirements remain release-blocking. Read AGENTS.md and docs/21-READINESS-AUDIT.md first, then validate docs and inspect available tools/runtime. Consume the completed session/admin variants in WP01. Implement the shared semantic vectors in TS/PHP during WP02. Apply docs/23-SCREEN-CONTRACT.md in WP04; real visual acceptance is required before release. Do not ask for domain/ad credentials before completing independent code work.

## Ordered work packages

| WP | Deliverables | Exit evidence |
|---|---|---|
| 01 Foundation | Monorepo, supported locked dependencies, CI, config loaders, contract generation | Fresh clone installs reproducibly; checks run |
| 02 Selection | Pure unbiased algorithms, boundaries, teams, test-only entropy injection | Deterministic edge vectors and invariant tests |
| 03 Persistence | IndexedDB stores, migration, writer lease, atomic result lifecycle, export/import | Reload/crash/quota/cross-tab tests |
| 04 Visual system | All tool layouts, themes, icons, label fitting, motion/audio | Real-device traces, screenshots, keyboard checks |
| 05 Reports | Rounds, counts, percentages, history, CSV protection | Fixtures and invariant tests including removed winners |
| 06 Games | Bottle seats, game state, 6×50 source cards, localization structure | No-repeat/skip/resume/exhaustion tests |
| 07 Sharing API | PHP routing, DB migrations, capabilities, encryption, idempotency | OpenAPI conformance and negative HTTP tests |
| 08 Content/admin | Roles/MFA, imports, review states, publication runner, admin contract implementation | Access, publish-failure and rollback tests |
| 09 Languages/search | 110 reviewed locales, real tool pages, SEO artifacts | Coverage, RTL and built-page crawl audit |
| 10 PWA | Manifest/icons, bounded offline cache, update coordination | Installed/offline/update matrix |
| 11 Integrations | CMP, basic consent, reviewed GTM/GA4/ads configuration | Network evidence for every consent state |
| 12 Release | Hosting package, backup/restore, security/accessibility/load review | All acceptance rows and external inputs closed |

## Stable command contract (foundation established in WP01)

The command interface is present. Each command must gain real package behavior as its work package is implemented. Current shallow foundation checks are identified explicitly and must not be mistaken for API, PWA, or release acceptance:

- npm ci — locked Node workspace dependencies.
- composer install --working-dir=apps/api — locked PHP dependencies.
- npm run check — type and contract consistency checks.
- npm run test:unit — algorithms/session/locale tests.
- npm run test:api — starts an isolated PHP+MySQL test stack and exercises OpenAPI, auth and failures.
- npm run test:e2e — supported browser automation, with no production endpoints.
- npm run test:a11y — automated baseline plus separate manual checklist.
- npm run test:seo — generated HTML/canonical/hreflang/sitemap/status audit.
- npm run test:pwa — offline/cache/update tests.
- npm run test:content — locale/pack coverage and review metadata.
- npm run build — static output and deployable PHP artifact, no secrets.
- npm run verify:release — ordered required suite and evidence manifest validation.

Current limits: `test:api` checks PHP/runtime prerequisites only until WP07–08 add HTTP behavior; `test:pwa` fails explicitly until WP10 adds artifacts and behavior; `test:content` validates registry/catalog key and placeholder structure but not native review; `test:seo` checks only the built root smoke contract, not SEO-01–12. `verify:release` is gated on all work packages having verified evidence.

Runtime-specific tools may be selected at bootstrap, but the command interface must remain stable. CI cannot claim manual/device/legal/account checks passed merely because a command succeeded.

## Evidence and change handling

Maintain implementation progress keyed by WP and requirement ID. Each entry stores status (not-started/in-progress/verified/blocked), commit, command/artifact, reviewer and limitations. Open external inputs from docs/19-DECISIONS.md remain blocked until verified. Completion requires real implementations, not screenshots of controls with no behavior.

For every work package review failure modes in docs/18-RED-TEAM.md. Fix discovered inconsistencies in schema/docs/tests together. Do not expand to chat, multiplayer, accounts or payment without an explicit owner scope change.

## Suggested Codex task

Implement the complete Lavbe scope. Establish the command contract, then work through WP01–12 with evidence. Preserve local data and exact selection/report semantics. Create original UI within the design constraints rather than copying competitor assets. Keep 110-language content/reviews and external provider setup honest. Finish with release evidence, deployment package, operator handbook and clearly identified launch blockers; never label a partial build production-ready.

## SEO integration across work packages

WP01 loads config/seo registry and defines build artifact schema; WP04 preserves semantic content/performance; WP08 validates native/publication state; WP09 generates route/metadata/alternate/sitemap graph and runs SEO-01–12; WP12 tests actual origin/CDN responses. Do not defer SEO to a final tag insertion. Research records remain pending until actual review.

## Visual execution order

WP04 includes high-fidelity screen family, component state gallery and working final-selection moment under docs/27–29. Review before repeating the design across tools. Preserve actual-device performance and localization gates. Final visual owner review belongs in release evidence, not fabricated approval metadata.

## GitHub and continuity contract

Follow [GitHub workflow](30-GITHUB-WORKFLOW.md) and maintain [progress](progress.json). Work follows dependencies; do not claim a WP verified without exit evidence. Localization/research/content preparation starts with WP01 and continues through WP09. CI and manual approvals are separate. Before each task inspect actual source so the historical docs-only baseline is not mistaken for permanent repository state.
