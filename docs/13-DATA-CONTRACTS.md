# 🗃️ Data model and API contracts

## Canonical files

[Wheel schema](../contracts/wheel.schema.json), [pack schema](../contracts/pack.schema.json), [session export schema](../contracts/session.schema.json), [public OpenAPI](../contracts/openapi.json), [admin OpenAPI](../contracts/admin.openapi.json) and [examples](../contracts/examples/wheel.json) are the initial machine-readable contracts. IDs are opaque; labels are never relational identity. API limits are enforced server-side and supplemented by semantic validation (graphemes, references, unique IDs, locale readiness). JSON Schema maxLength counts code points, not graphemes; semantic validation applies the stricter display rules.

## Local stores

wheels(wheelId, revision), entries(entryId, wheelId), sessions(sessionId, wheelId), rounds(roundId, sessionId), spins(spinId, roundId, sequence), games(sessionId), packs(packId,version,locale), preferences(key), leases(wheelId). Use unique compound (sessionId,sequence) and indexed round/session lookups. Transactions combine append-result and session update. A bounded serialized input snapshot may be deduplicated by immutable config revision rather than copied 10,000 times. Preserve semantics on export.

## Server tables

| Table | Minimum fields / invariant |
|---|---|
| shares | id(32 ASCII PK), payload_cipher, nonce, key_id, schema_version, created_at, expires_at, revoked_at, revoke_hash; expiry indexed |
| idempotency | key_hash PK, request_hash, encrypted_response, nonce, key_id, expires_at; 24 h TTL |
| rate_buckets | key_hash+window PK, count, expires_at; atomic increment |
| admin_users | id, credential hash, encrypted MFA secret, role, disabled_at; no public signup |
| admin_sessions | hashed session ID, user_id, issued/expiry, rotated CSRF material |
| content_versions | id, kind, source_hash, state, author, reviewer, timestamps |
| publish_jobs | id, manifest_hash, state, artifact_hash, error_code, actor, timestamps |
| audit_events | immutable id, actor ID, action code, object/version ID, timestamp |
| deletion_journal | share_id hash, deletion time, retention expiry; restore suppression |

Use UTC timestamps, strict SQL mode and transactions. Store encrypted payload as bytes, not interpolated SQL. Foreign-key choices and cleanup behavior are migration-tested. Do not log JSON bodies or capability headers. Limits must agree with config/limits.json and OpenAPI.

## Public API

OpenAPI includes GET health, POST share, GET share, DELETE share, with bounded bodies, request IDs, idempotency and errors. Route IDs validate before DB lookup. 404 unknown vs 410 unavailable have no private payload. DELETE requires bearer management token; known-view-ID is not sufficient. Same-origin Origin enforcement on browser writes. OpenAPI schemas are not an authentication implementation.

## Admin API

Admin pages use server sessions, MFA and CSRF. Content CRUD/import/export, validation, review, publish and rollback semantics are defined in [admin](14-ADMIN-CONTENT.md). Internal endpoints are specified in [admin OpenAPI](../contracts/admin.openapi.json); never expose them through anonymous public contracts. Add kind-specific import validators and tests for every accepted content kind. Login checks Origin without an existing CSRF token; authenticated mutations use both. List endpoints use an opaque next cursor in the X-Next-Cursor response header (absent at end).

## Contract change rules

Preserve format version or introduce a tested migration. Validate TS producer, PHP consumer and import/export against the same golden fixtures including invalid input. Contract tests must hit real PHP HTTP endpoints; schema-only tests cannot claim API compliance. See examples for baseline valid payloads; secret-like fixture strings are artificial and not reusable production tokens.
