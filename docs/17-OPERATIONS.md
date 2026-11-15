# 🚀 Shared-host deployment and operations

## Provider acceptance

Require supported PHP 8.3+ (or newer supported baseline), PDO_mysql/intl/sodium/mbstring, MySQL 8+ utf8mb4, HTTPS, Apache-compatible routing, cron at least every 15 min, private storage outside public_html, configurable headers and encrypted off-host backups. Verify inode/file quotas for 110 locale outputs, upload limits, CPU/concurrency and DB limits. Staging should match production. CDN is optional for static delivery and must never cache private/dynamic routes.

## Artifact and deployment

Build in CI/trusted runner with pinned dependencies and reviewed content manifest. Produce checksums, buildId, contract/schema version and public/private file manifest. Scan artifact for secrets and personal data. Upload to a new release directory; do not FTP-edit live files one by one. Prefer atomic directory/symlink switch when provider permits; otherwise use a documented maintenance-window promotion with a tested recovery copy. Migrations are additive before compatible app promotion. Purge public HTML cache, retain immutable old assets for installed clients and check real 404/API/share routes.

The Astro static artifact ships `apps/web/public/.htaccess` as `dist/.htaccess`. It disables directory indexes, sets baseline browser security headers, revalidates HTML/manifest/service-worker files and marks fingerprinted CSS/JS and image types for long caching. Serve only `apps/web/dist` as the static document root; keep the PHP source, Composer vendor tree, environment, private storage, signing/encryption keys and database outside it. Mount the API through the separate `apps/api/public` document root or an operator-reviewed path mapping; never copy `apps/api/src`, `vendor`, `.env` or private storage into the static root. Preserve the API's no-store headers and do not cache `/api/*`, admin, preview or share-capability responses at a CDN. The Apache file intentionally does not emit CSP or HSTS: static inline bootstrap scripts need reviewed CSP hashes/origins, and HSTS scope depends on the actual HTTPS domain/subdomain policy. Set those at the verified host after review. The built-site validator checks that these deploy rules survive the Astro build; it does not prove the real host honors `.htaccess` or has the required Apache modules enabled.

The local atomic adapter in `scripts/deploy-local-atomic.mjs` is a filesystem promotion example only. It verifies the artifact tree hash, stores immutable release directories and atomically switches `current`; it is not the production shared-host adapter. Before any real promotion, test the provider's path layout, permissions, symlink support, API mapping, headers, 404s and rollback on staging.

Rollback changes application/static version to known-good artifact without destructive DB rollback. Restore from backup only for data-loss recovery and apply deletion/revocation journals before reopening shares. An old code release must understand current schema or rollback is blocked by compatibility checks.

## Jobs and retention

Every 15 min: prune expired API idempotency/rate data, enforce payload purge queue and refresh publication-job status. Reads enforce expiry immediately regardless of scheduler. Daily: encrypted database/private content backup to a separate account/provider, integrity verification and retention rotation. Keep backup keys separate. Weekly: verify backup presence/age and deletion journal coverage. Monthly: staged restore and report; quarterly: full incident/rollback rehearsal. Failed cron/backup raises an actionable operator alert without including participant text.

## Recovery targets

Initial objectives: RPO ≤24 h for server snapshots/content and RTO ≤4 h after provider access is restored. These are targets requiring a timed rehearsal, not guarantees of shared hosting availability. Local-only user data cannot be recovered by the server; export/import and browser warnings remain essential.

## Monitoring

Observe health route, origin errors, latency, rate-limit spikes, DB/storage quotas, failed jobs, backup age, content version and public route availability. Logs contain route templates/codes, not private IDs or request bodies. Critical alerts need an operator-selected destination before launch; do not silently send messages or invent an inbox. Analytics is not operational monitoring and optional consent denial must not blind server-health checks.

## Runbooks

Share exposure: disable reads if needed, revoke affected IDs, contain logs/cache, rotate compromised keys, assess notifications. Broken release: freeze promotion, restore artifact and verify no data loss. CMP/tag malfunction: kill-switch optional tags globally, preserve tools, verify zero optional requests. Storage/DB full: stop new shares with clear retryable response, preserve reads and existing local tools, recover space safely. Translation/content issue: unpublish affected public version through reviewed rollback; preserve active game versions unless safety requires removal.

## Maintenance policy

No planned feature expansion is required to use the complete product. Security patches, provider changes, supported runtimes, consent rules and browser behavior still require maintenance. Record dependency inventory, owners and update cadence; do not sell the deployment as permanently maintenance-free.
