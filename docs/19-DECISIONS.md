# 📝 Decisions, defaults and launch inputs

## Settled architecture/product decisions

| ID | Decision | Reason |
|---|---|---|
| ADR-01 | Static Astro + local TS + PHP/MySQL | SEO-ready HTML and shared hosting without a Node server |
| ADR-02 | Result-first rendering | Exact pointer/report agreement independent of frame rate |
| ADR-03 | Local-first, no public accounts | Fast start and minimal personal data |
| ADR-04 | Immutable capability-based shares | Predictable independent recipients, explicit revocation |
| ADR-05 | 110 reviewed launch locales | Meets 100+ requirement with a fixed registry |
| ADR-06 | Non-explicit social games | Fits agreed couples/group scope and broad audience |
| ADR-07 | Complete-scope public release | Owner rejects an MVP |
| ADR-08 | Basic opt-in optional tags | Predictable privacy boundary, graceful provider failure |
| ADR-09 | Static content publication through trusted builder | Admin panel works without Node on hosting |
| ADR-10 | Reports grouped by explicit rounds | Prevents mixed rules from misleading statistics |
| ADR-11 | Admin imports are stored as encrypted immutable content versions; the server resets imported review claims and derives reviewer identity/state itself | Prevents client-controlled approval state and protects unpublished editorial content |

### 2026-11-15 — WP08 content import trust boundary

- **Problem / requirements:** WP08 and `docs/14-ADMIN-CONTENT.md` require strict imported schemas, server-verified source/review state and protected drafts.
- **Selected behavior:** Imported records are schema-checked, encrypted at rest, assigned a server revision and saved as `draft`; client-supplied `reviewed` state is discarded. UI source keys, source hashes, placeholders and unsafe markup are checked against the English catalog. Pack source hashes follow the recursive key-sort rule documented in `content/packs/README.md`.
- **Alternative rejected:** trusting imported `status`, reviewer, or source-hash values would let an editor upload self-approved content and is not acceptable.
- **Acceptance impact:** draft import/validation/review can be exercised locally. Full ICU parsing, remaining publication APIs and production publication remain open; this decision does not approve content or enable publishing.

### 2026-11-15 — WP08 publication digest boundary

- **Problem / requirements:** `PublishRequest` accepted `versionIds` and `manifestHash`, but the API creates `buildId` and `createdAt`; a publisher cannot compute a digest over server-generated envelope fields before submitting the request.
- **Selected behavior:** `manifestHash` is SHA-256 over RFC 8785 canonical UTF-8 bytes of the sorted immutable `versions` array only. `buildId` and `createdAt` are envelope metadata and excluded. The browser and PHP implementation share `contracts/canonical-json-vectors.json`; the trusted runner must recompute the same versions digest before building.
- **Alternative rejected:** having the client guess server-generated metadata or letting the runner trust the supplied digest would make validation impossible or weaken the integrity boundary.
- **Acceptance impact:** the request is computable before job creation and deterministic across the clients. This does not authorize deployment or mark any editorial content reviewed.

## Concrete baseline defaults

1,000 entries; 120 graphemes/label; 80/title; weight 1–1,000; 1–10 s spin, default 4; 10–24 px wheel labels; share TTL 30 days (1/7/30/90); 256 KiB share body; bottle 2–20 seats; teams 2–50; six families ×50 reviewed cards; 10,000 local results/session and 20 sessions; 30 MiB managed PWA cache. These are selected specification defaults, not owner-provided measured capacities. Changes require synchronized config/contracts/docs and evidence.

## External inputs (do not fabricate)

| Input | Needed for | Independent work can proceed? |
|---|---|---|
| Operator identity/country/contact and rights channel | Accurate legal pages and responsibilities | Yes |
| Legal/child-directed-use and processor review | Activating production data/ads operation | Yes |
| Domain/DNS/hosting access and actual limits | Final HTTPS deployment and routing | Yes |
| Supported runtime/dependency version selection | Bootstrap and security support | Inspect immediately |
| Native translation and content reviewers | 110-language launch completion | Build pipeline/UI while content progresses |
| Final brand approval and licensed sounds/fonts | Final assets and PWA exports | Use original provisional assets clearly labeled |
| CMP provider/configuration | Live consent and regional behavior | Implement adapter/tests with fixtures |
| GA4/GTM/publisher IDs and ad approval | Live tracking/monetization | Keep integrations safely disabled |
| Search/Bing property verification | Submission and monitoring | Generate valid SEO artifacts |
| Build runner/deploy credentials | Panel-to-static publishing promotion | Implement job protocol locally |
| Admin owner/MFA and alert destination | Secure operation | Implement bootstrap/runbooks |

External inputs block their production activation, not unrelated coding. Never substitute placeholder legal text or fabricated review metadata to pass a complete-scope release gate.

## Change protocol

Record date, owner instruction/problem, affected requirements, selected solution, alternatives and acceptance impact. Update contracts/config/fixtures together. A source-code change does not silently alter the product contract. Routine maintenance is necessary; no permanent no-update promise is part of this baseline.
