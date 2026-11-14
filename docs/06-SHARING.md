# 🔗 Sharing and capability lifecycle

## Semantics

A share is an immutable snapshot of title, active entries, weights, mode and visual settings. It does not contain reports, consent state, editor history or management secrets. Recipients get independent local sessions; edits never mutate the source. Share link language is a suggestion for the share shell; an explicit stored preference can override it. Names and custom text are not translated.

Create via POST /api/v1/shares. Default TTL 30 days; choices 1/7/30/90 days. The server returns a 192-bit random base64url view ID (32 characters), independent 256-bit management token, creation/expiry time and URLs. Store only a SHA-256 hash of the management token; compare in constant time. Token is returned once over TLS, stored by the creator locally with explicit export guidance, and must not appear in query strings, logs or referrers. Revocation uses an Authorization bearer header. Without the token there is no anonymous recovery claim.

Creation returns a fixed first-party success view with a copy button. Link preview metadata is generic, with no names/title from user input. View ID is a bearer capability, not authenticated privacy; anyone with the link may view it. Names must never be embedded in path/query. Do not offer search/discovery listings.

## Routes and lifecycle

Share route /s/{shareId}/ is a thin dynamic PHP-rendered shell with same-origin assets and no third-party scripts/fonts/ads/analytics. GET API response and shell use no-store, noindex and no-referrer. Exclude share routes from SW caching, CDN caching and sitemaps. Do not block crawling in robots.txt as a substitute for noindex. Unknown ID returns 404; expired/revoked returns 410 with the same generic unavailable message. Never include payload in error pages.

Expiry/revocation is enforced on every read, not only by cron. Cron purges payloads within 24 h; snapshot deletion tombstone retains no names. Revocation stops future server reads but cannot erase previously downloaded recipient copies, exports or backups. Explicitly explain this. Backups expire per retention and restored records must reapply revocation/deletion journals before becoming readable.

## Abuse and resource controls

Validate against [snapshot schema](../contracts/wheel.schema.json); reject unknown fields, excessive UTF-8 bytes, invalid weights/IDs and unsupported combinations. Payload ≤256 KiB. Per pseudonymous network key: 10 creates/minute, 100/day, 120 reads/minute. Token revoke attempts: 10/minute per key. Shared-host/CDN edge controls may supplement these values without disabling origin enforcement. Return 429 with Retry-After. No CAPTCHA on every use; escalation only for abuse with an accessible alternative.

Public report-abuse form accepts share URL and reason, never republishes content. Admin can quarantine/revoke with an audit record. No URL/image uploads or executable attachments in the first complete scope. Template images/sounds are first-party licensed assets only, avoiding SSRF and upload attack surfaces.

## Retry contract

Client sends Idempotency-Key UUID when creating a share. Retry with same key+payload returns the same response for 24 h, including the one-time token via a short-lived encrypted response cache. Persist no plaintext token in logs/DB. Same key with different payload returns 409. Key is a creation capability and must be redacted. Expired retry window requires an explicit new creation action, not an automatic duplicate.
