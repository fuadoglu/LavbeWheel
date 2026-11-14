# Sharing API operations

The API requires PHP 8.3+, PDO MySQL, intl, mbstring and sodium, plus MySQL 8.0+. Keep `apps/api/src`, `vendor`, database credentials, environment files and encryption keys outside the document root. Only `apps/api/public` is web-accessible.

## Configuration

Provide the variables in `.env.example` through the host's secret manager or a protected file outside the document root. `LAVBE_APP_ORIGIN` and `LAVBE_PUBLIC_ORIGIN` must be HTTPS origins without a path. HTTP is accepted only when `LAVBE_ALLOW_INSECURE_LOCAL=1` is explicitly set for local development/tests. Generate independent keys with `php -r 'echo base64_encode(random_bytes(32)), PHP_EOL;'`; decode the base64 values before assigning the two key variables.

For encryption-key rotation, make the new `LAVBE_ENCRYPTION_KEY_ID` active and provide `LAVBE_ENCRYPTION_KEYS` as a JSON object mapping every retained key ID to its base64-encoded 32-byte key. Reads accept retained key IDs; new payloads use the active key. Keep old keys until all ciphertext encrypted with them has expired and backups containing it have passed retention. The rate-limit HMAC secret is independent and must not be used as an encryption key.

Set `LAVBE_TRUSTED_PROXIES` only to exact proxy IP addresses. The API ignores forwarded client-IP headers unless the immediate peer is in that list. Use HTTPS at the origin; the PHP application does not terminate TLS or establish trusted proxy identity automatically.

## Database and deployment

Create a dedicated MySQL database with `utf8mb4`, grant the API account only the required database privileges, then run `composer migrate --working-dir=apps/api` from a protected deployment step. Migrations are numbered, forward-only and recorded in `schema_migrations`; do not run them automatically at web startup. Schedule `composer cleanup --working-dir=apps/api` at least every 15 minutes. Before restoring a backup, restore the separately protected deletion journal and apply `database/restore-suppressions.sql` before making reads available.

Configure the web server so `/api/v1/*` reaches `public/index.php`, denies access to non-public source/configuration/vendor paths, and sets body limits at least as strict as 256 KiB. Do not cache API responses. Snapshot share shells need the separate `/s/{shareId}/` no-store/noindex/no-referrer routing contract; that shell and static-host integration are not implemented in this WP07 API slice.

## Administrator bootstrap

After applying migrations, run `composer bootstrap-admin --working-dir=apps/api -- <username>` from a protected terminal. Enter a password with at least 14 characters when prompted, then enroll the one-time displayed TOTP secret and store the one-time recovery codes in the approved password manager. Do not redirect this command's output to a log or CI artifact. Bootstrap refuses to create a second initial owner. Additional administrator management will use the authenticated owner API when its WP08 endpoints are implemented.

The current WP08 implementation exposes MFA login/session/logout, strict encrypted content draft import, validation, review and version listing/detail. Publication runner, manifest signing, promotion/rollback, user administration, share revocation and the admin panel remain in progress; do not use this partial API to publish content.

The application does not emit request bodies, network keys, authorization headers or capabilities to logs. Host-level access logs and backups still require the retention/redaction controls in `docs/11-PRIVACY-SECURITY.md` and `docs/17-OPERATIONS.md`.

## Tests

`composer test --working-dir=apps/api` requires a disposable database whose exact name is `lavbe_api_test`, configured through `LAVBE_TEST_DATABASE_DSN`, `LAVBE_TEST_DATABASE_USER` and `LAVBE_TEST_DATABASE_PASSWORD`. The test deliberately drops tables in that database, runs migrations, checks encrypted storage/idempotency/revocation/deletion suppression, then starts a local PHP HTTP server and exercises the API. Never point these variables at another database. CI provisions MySQL 8.4 for the test job.
