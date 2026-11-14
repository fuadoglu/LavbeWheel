# 🛠️ Administration and content publishing

## Access

No public admin registration. Owner bootstraps first administrator through an authenticated CLI command outside web root. Use password_hash with supported strong algorithm and TOTP MFA plus one-time hashed recovery codes. Session cookies Secure/HttpOnly/SameSite=Lax, rotate on auth/privilege changes, 30 min idle and 12 h absolute expiry. Password/MFA reset requires owner-controlled recovery, no invented email provider. Rate-limit logins and use CSRF tokens for every session-authenticated mutation.

Roles: owner (users/providers/deployment), editor (drafts/imports), reviewer (approve content/locales), publisher (publish/rollback). Owner can perform all roles for a solo-operated site, but records review and publication as separate actions. Every sensitive action is audited with IDs and versions, not user names from snapshots.

## Content model and import

Packs, localized cards, UI/SEO/legal catalogs, public tool copy, design presets and integration settings. Bulk JSON import uses the same versioned schemas and a preview: added/changed/removed records, invalid keys, source staleness, placeholder mismatch and coverage. Limits: 5 MiB per import, 5,000 records; process staged jobs and paginate results. Do not accept executable HTML/JS, ZIP uploads or remote URL imports. Text formatting uses a minimal safe allowlist implemented consistently.

Pipeline: draft → validated → reviewed → published → archived. Source edits invalidate dependent translation review. Every published pack has a fixed version; active sessions retain prior versions. Revert creates a new version referencing a known-good artifact, never rewrites audit history.

## Static publication on shared hosting

Panel saves revisions in MySQL; content export job produces a signed/hashed JSON manifest outside web root. CI or a trusted local build runner pulls it through an authenticated export endpoint, validates everything, builds static artifacts and runs checks. Owner approves promotion of a validated artifact; no direct edit to production static files. API serves current publication state and last known-good version. Secrets for export/deploy remain in the runner/host, not public config.

Panel publish job statuses: queued, exporting, validating, building, awaiting-promotion, deploying, succeeded, failed, rolled-back. Authenticated runner reports status with scoped credentials. Failure keeps current live release intact. Shared-host Node support is not assumed. Future builder/provider credential is an external launch input. Implement operator-friendly setup instructions rather than pretending the bridge exists now.

## Configuration safety

Allowlisted fields only: analytics/GTM/publisher IDs, approved consent provider identifier, placement toggles, preapproved sponsor text/link/asset ID and rollout percentages. No arbitrary JavaScript snippet editor or raw HTML ad injection. New provider domains require reviewed CSP and privacy changes. Kill switches disable tags without disabling core tools; emergency disable uses server bootstrap config plus CDN purge.

## Required admin workflow evidence

Import invalid pack, reject dangerous content, mark stale translation, review 110-locale coverage, publish failed build without touching live, promote known artifact, rollback, restore after data loss, revoke abusive share, disable ads and audit owner/editor access. Implement [admin OpenAPI](../contracts/admin.openapi.json) with integration tests; internal UI must handle errors and job progress without fake completion. User creation/MFA bootstrap remains an owner CLI workflow; user update never returns credential secrets. Admin lists return at most 50 records and X-Next-Cursor when another page exists.

Manifest digest scope: `manifestHash` covers the RFC 8785 canonical UTF-8 bytes of the sorted immutable `versions` array only. `buildId` and `createdAt` are generated transport metadata and are excluded so the publisher can calculate the digest before job creation. Browser, API and runner must pass the shared vectors in `contracts/canonical-json-vectors.json`.
