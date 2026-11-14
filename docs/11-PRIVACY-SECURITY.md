# 🛡️ Privacy, security and operator readiness

## Data map and defaults

| Data | Location | Retention / purpose |
|---|---|---|
| Names, wheels, reports | IndexedDB by default | User-controlled; configured local history caps; export/clear |
| Shared snapshot | MySQL encrypted payload | TTL 1/7/30/90 days; deletion within 24 h after unavailable |
| Revocation hash/tombstone | MySQL | Hash until expiry; minimal deletion journal for backup horizon |
| Idempotent response | Encrypted server storage | 24 h, then delete; contains creation capability |
| Rate limit key | HMAC of network prefix, rotating secret | 24 h; no raw IP in application DB |
| Server access/security logs | Host | 7 days access, 30 days security; redact private paths/tokens and bodies |
| Admin audit | Server | 180 days; action/version identifiers, no participant text |
| Backups | Encrypted off-host | Daily, rolling 30 days; restricted restore-only access |
| Consent and analytics | CMP / selected provider | Document actual provider retention and legal configuration before launch |

Hosting/CDN may process raw IPs; do not claim no IP processing because app records are pseudonymous. Rate keys remain potentially personal data. No production user payloads in CI, screenshots, errors or support issues.

## Legal readiness (not a certification)

Operator must supply identity, jurisdiction, contact, processing purposes/bases, rights channel, applicable representatives if required, processor list, DPAs, transfer assessment/safeguards, retention and incident responsibilities. Publish accurate Privacy/Cookie/Terms pages and localized consent notices. Review GDPR/ePrivacy, applicable UK/Swiss/state privacy requirements and child-directed use with qualified advice based on actual operation. Do not promise compliance worldwide or generate a false legal identity.

School/family use must not become behavioral profiling of children. Operator must decide and document child-directed treatment before ads/analytics activation. Default non-profiling approach; no student account collection. Self-declared age alone is not a complete compliance strategy.

Rights requests: acknowledge, verify proportionately, locate server data by share capability or provided identifier, delete/export eligible records, document response and statutory deadlines applicable to operator. No anonymous local-data access claim; users can export/clear local browser data. Incident runbook requires triage, containment, impact assessment and legally applicable notification decisions; no blanket universal deadline claim.

## Threat model

Protect names, capability secrets, content publication and admin credentials. Attackers may submit XSS labels, enumerate URLs, replay create requests, exhaust host resources, forge origins, steal links or poison shared cache. Treat browser selection as user-controlled, not certified evidence.

Controls: TLS; textContent rendering; strict allowlisted schemas and UTF-8 limits; PDO prepared statements; origin-only APIs with no wildcard CORS; admin CSRF protection; CSP with explicit provider allowlists; no eval; nosniff; no-referrer on shares; frame-ancestors self (public embedding deferred); HSTS only after HTTPS readiness; permissions policy disabling unused camera/microphone/geolocation. No remote user asset fetching or upload parsing.

Secrets live outside public_html and Git. Share encryption key is independent of token hashing and backup keys; use authenticated encryption (libsodium XChaCha20-Poly1305), key ID and rotation procedure. Back up keys separately. No plaintext tokens in logs. Validate trusted proxy headers only from configured proxies. Constant-time capability checks; secure admin sessions, MFA and rate limits. Return generic errors with correlation IDs, not stack traces/SQL.

Test XSS, CSRF, SQL injection, revoked/expired link access, cache leakage, token redaction, rate-limit bypass and cross-admin-role writes. Dependency/secret scans and restore tests are required. A scan passing is evidence for that scan, not proof of full security.
