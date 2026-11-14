# Codex implementation contract

## Read first

Read README.md, docs/00-START-HERE.md and docs/21-READINESS-AUDIT.md, then all normative documents linked there before architectural implementation. Use docs/22-SEMANTIC-CONTRACT.md and docs/23-SCREEN-CONTRACT.md with the completed session/admin schemas. Read the CURRENT closing section of the readiness audit rather than treating its historical findings as open. Verify TS/PHP implementations against the common vectors; reference Python checks are not runtime parity evidence. Local instructions in future subdirectories may refine, never silently weaken, this baseline. User changes take precedence and must be reflected in docs/19-DECISIONS.md.

## Authority and honesty

- This is a specification repository, not an implemented app. Do not invent run commands, passing checks, approvals, translations or credentials.
- The JSON schemas and OpenAPI are normative for serialized formats. Product semantics in docs apply in addition. If contradictory, stop the affected implementation, record the conflict and resolve explicitly; do not choose silently.
- Complete public release only. Internal work packages are dependencies, not an MVP permission.
- Preserve user data; migrations and service-worker updates require rollback/recovery design.

## Architecture boundaries

Use Astro static HTML + TypeScript, Canvas rendering and semantic HTML, IndexedDB and same-origin PHP/PDO/MySQL. No always-running Node server, external account requirement for ordinary users, remote call per spin, live multiplayer, public user-content directory or explicit sexual packs.

No generated page matrix without genuine content. No tracking of names, free text, capability tokens or private URLs. No third-party tags on snapshot routes. No production secrets or real personal data in commits or fixtures.

## Implementation discipline

1. Run documentation checks. Audit the available runtime and select currently supported dependency versions; commit lockfiles.
2. Follow docs/15-IMPLEMENTATION.md in order. Implement tests for algorithm, persistence, API and security invariants, not snapshot tests that merely mirror markup.
3. Record executed commands, result and artifact path per requirement in a release evidence manifest. A not-run check is not a pass.
4. Keep public UI nontechnical. Use i18n keys for every visible/system/a11y string. No hardcoded English outside the English catalog.
5. Keep selection, state, rendering, persistence and networking independent. Inject deterministic random bytes only in tests.
6. No speculative features or architectural replacement without a documented decision.
7. Keep all app routes local-first and useful when ads/analytics/CMP fail. Fail closed for optional tags.
8. Never weaken release gates to make a pipeline pass. External launch inputs can remain blocked while independent work proceeds.

## Required verification

Run relevant package checks after each coherent change and the full release suite before completion. Validate the OpenAPI against the real API including error, size, expiry, concurrency and capability tests. Test fresh install, upgraded install, offline, denied consent, ad-blocking, RTL, long labels and storage failure. Report verification limits plainly.

## Completion report

Summarize behavior changed, evidence, remaining external blockers and deployment state. Link to the exact commit/PR. Do not call the implementation 10/10 or compliant based only on self-assessment.

Legal pages and activation must follow docs/24-LEGAL-LAUNCH.md. Missing operator facts are explicit launch blockers, never fabricated copy. Implement full page/workflow behavior while awaiting real facts.

## SEO is a primary requirement

Read docs/25-SEO-EXECUTION.md and docs/26-SEO-ACCEPTANCE.md. Build route/canonical/alternate/sitemap/link artifacts from config/seo, not duplicate hardcoded lists. Run SEO-01–12 gates. The locale research registry is a pending work queue; do not invent volumes or mark it researched. Protect privacy, native usefulness and actual HTTP behavior before public release.

## Design craft

Read docs/27-ART-DIRECTION.md, docs/28-COMPONENT-MOTION.md and docs/29-DESIGN-ACCEPTANCE.md before final UI. Implement 'quiet interface, expressive wheel' using config/design-craft.json and semantic tokens. Do not mistake SVG wireframes for final design or claim awards/owner approval without evidence. Craft cannot override speed, SEO, accessibility or consent.
