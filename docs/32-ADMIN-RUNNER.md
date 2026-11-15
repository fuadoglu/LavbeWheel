# Trusted admin build runner

The runner is a one-job local Node process. It fetches the job manifest over HTTPS with the one-time, job-scoped bearer credential, verifies the Ed25519 signature against a pinned public key, validates the strict manifest and content schemas, recomputes the RFC 8785 digest, checks current UI/pack source hashes and placeholders, then runs the configured code, unit, content, browser, accessibility and SEO/build gates. It writes the static site and a sanitized reviewed-content snapshot to a private artifact directory outside both the repository and web root. It reports the deterministic artifact tree hash and waits for an owner/publisher promotion.

Before artifact creation, the runner executes `npm run seo:release-check`, which requires the complete public route inventory and published locale/copy/SEO approvals. The normal `npm run test:seo` audits the currently implemented templates and can pass while also reporting that release coverage is incomplete; it is not a deployment approval. Only after the strict release check and owner promotion does the runner invoke the configured deployment adapter. The runner passes the adapter the immutable artifact directory, artifact hash and job ID. It removes runner credentials from both build and adapter subprocess environments. A failed build or adapter leaves the active publication pointer unchanged. The local atomic adapter stages an immutable release directory and atomically switches a `current` symlink; it never overwrites release files or deletes older releases.

## Operator setup

1. Install the supported Node/npm dependencies with `npm ci`, install the Playwright Chromium runtime with `npx playwright install chromium`, and make sure the runner checkout is the reviewed PR commit.
2. Obtain the API's manifest public key with `php apps/api/bin/show-manifest-public-key.php` and pin its base64url value as `LAVBE_RUNNER_MANIFEST_PUBLIC_KEY`. Configure the API origin, job ID, private artifact root, served public root, and deployment adapter through the local secret manager or protected process environment. The artifact root must be an absolute directory outside the repository and public web root.
3. Copy the job credential once from the admin panel into the protected process environment. Do not put it in command history, source files, logs, URLs or build output.
4. Start one job with `npm run admin:runner`. Keep the process running while it awaits owner promotion. The panel polls the job state and displays its artifact hash.
5. Configure the local atomic adapter by setting `LAVBE_RUNNER_DEPLOY_ADAPTER` to the absolute path of `scripts/deploy-local-atomic.mjs` and `LAVBE_STATIC_PUBLISH_ROOT` to a dedicated static-host directory whose document root points at its `current` symlink. Production hosts that cannot serve a symlinked document root need a reviewed adapter that performs atomic release switching and verifies the supplied artifact hash.

Required environment names:

| Variable | Meaning |
| --- | --- |
| `LAVBE_RUNNER_API_ORIGIN` | HTTPS origin of the PHP API; HTTP is accepted only on localhost for local development. |
| `LAVBE_RUNNER_JOB_ID` | Job ID created by the admin panel. |
| `LAVBE_RUNNER_CREDENTIAL` | One-time bearer credential returned in `X-Runner-Credential`. |
| `LAVBE_RUNNER_MANIFEST_PUBLIC_KEY` | Pinned 32-byte Ed25519 public key from the API's signing keypair, encoded as unpadded base64url. |
| `LAVBE_RUNNER_ARTIFACTS_DIR` | Absolute private directory for immutable build artifacts and rollback lookup. |
| `LAVBE_RUNNER_PUBLIC_ROOT` | Absolute currently served static root (or the future `current` path on a first install); the runner refuses artifact storage that overlaps it. |
| `LAVBE_RUNNER_DEPLOY_ADAPTER` | Absolute path to a trusted executable or Node `.mjs`/`.js` adapter. |
| `LAVBE_STATIC_PUBLISH_ROOT` | Root used by the included local atomic symlink adapter. |

Custom adapters receive `LAVBE_DEPLOY_ARTIFACT_DIR`, `LAVBE_DEPLOY_ARTIFACT_HASH` and `LAVBE_DEPLOY_JOB_ID`, plus operator-provided `LAVBE_DEPLOY_*` settings. They do not receive the runner bearer credential. Adapters must verify the supplied tree hash and atomically expose the artifact; exit code zero is the deploy acknowledgment. No production adapter or hosting credentials are included in the repository.

The artifact tree hash is SHA-256 over each regular file sorted by UTF-16 code-unit path order. For each file, hash the 4-byte big-endian path byte length, UTF-8 relative path, 8-byte big-endian content length, and exact file bytes. Symbolic links and special files are rejected. The `.lavbe-artifact.json` metadata file is outside the hashed `site` tree. This hash covers the exact static tree passed to the adapter.

`site/_admin/publication.json` contains reviewed publication data with reviewer identities, per-record review metadata and import-only revision expectations removed. Its `sourceManifestHash` identifies the separately verified immutable source manifest. WP09 consumes this artifact in generated public routes. Until that integration and a production host adapter are verified, local runner output is not evidence of a deployed release.

Local atomic adapter rollback preserves every immutable release under `releases/`; switching back requires a new authenticated rollback job so the API pointer, audit trail and static host stay in sync. Do not manually repoint `current` for a production rollback.
