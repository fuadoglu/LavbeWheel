# ✅ Acceptance matrix and release gates

Status of all application gates in this baseline: **NOT RUN — application not implemented**. Documentation validation is a separate check. Each gate requires commit, environment, method, result, evidence path and reviewer; failure or missing evidence blocks public release unless explicitly categorized as postlaunch observation.

| Requirement | Required evidence / negative scenarios |
|---|---|
| SEL-01 | Uniform rejection boundaries, weighted intervals, integer endpoints, duplicate IDs rejected, 0/1/max entries |
| SEL-02 | Every member exactly once, sizes differ ≤1, invalid team counts rejected |
| GAM-01 | Seat mapping matches pointer, orientation/RTL tested, seating changes start a round |
| GAM-02 | 6 families ×50 cards ×110 reviewed locales; no repeats, skip/pause/resume, exhaustion, suitability review |
| UX-01 | 320–1440 widths, tablet rotations, keyboard, 200% text zoom, both themes, no focus obstruction |
| MOT-01 | Actual-device frame traces; exact landing; hidden-tab recovery; sound unavailable; reduced motion |
| TXT-01 | 120-grapheme/emoji/RTL labels; 1,000 participants; truthful dense fallback; unchanged eligibility |
| DAT-01 | Quota denial, private mode, migration, corrupt import, crash boundaries and concurrent tabs |
| REP-01 | Exactly-once records; duplicate labels; count totals; no false probability; safe CSV; round transitions |
| SHR-01 | Create/read/revoke/expire; invalid capability; idempotency replay/conflict; no cache/log/token leak |
| LOC-01 | 110 reviewed coverage records, placeholders/plurals, preference matrix, URL language retained |
| SEO-01 | Crawl built routes; reciprocal alternates; no private data in sitemap/metadata; true 404/410 |
| PWA-01 | Real iOS/Android install flows; warm offline; lost network; busy-tab update; no private caches |
| ADS-01 | Allowed route placements; no layout obstruction; denied/partial/granted/withdrawn network captures |
| PRI-01 | Threat tests, processor/retention map, rights/delete/restore suppression and incident rehearsal |
| ADM-01 | Roles/MFA/CSRF; bad import; stale review; failed build; promotion/rollback; reviewed admin OpenAPI |
| OPS-01 | Actual shared-host route/TLS/header tests, load envelope, off-host restore and rollback rehearsal |

## Browser/device coverage

Desktop: supported current Chrome, Firefox, Safari and Edge. Mobile: real Safari on iPhone, Chrome on Android, iPad Safari and representative Android tablet. Pin tested OS/browser versions in evidence at release. Automated Chromium/WebKit/Firefox coverage supplements, does not replace, real install/audio/keyboard checks. Reference mid-range Android device selected and recorded before visual signoff. Current+previous major browser target subject to actual feature detection and graceful fallbacks.

## Performance and usability

Use budgets in docs/03-MOTION-PERFORMANCE.md with ads on/off and consent permutations. Lab evidence is required prelaunch; field p75 CWV is postlaunch observation once enough traffic exists. Comparative task test: at least 8 independent participants, including 4 primarily mobile, perform paste/edit/spin/share/resume on both tools with order counterbalanced. Record failures/time and preference separately. It informs UX decisions, not a statistically broad market superiority claim.

## Release checklist

- [ ] All mandatory gates have evidence and no unresolved critical/high security defects.
- [ ] No mock controls, fabricated translations/reviews or placeholder operator details remain.
- [ ] 110 locale UI/legal/content reviews complete; content version locked.
- [ ] All deployment secrets installed outside repository/public root.
- [ ] Legal/operator and processor inputs reviewed for actual operation.
- [ ] CMP/tag behavior proven by network traces; ads account approval verified before live ads.
- [ ] No tracking identifiers or names in snapshots, errors, logs or public test artifacts.
- [ ] Host capacity, filesystem limits, TLS, cron and backup restore verified.
- [ ] Full release artifact checksums and rollback artifact retained.
- [ ] Owner has received handbook, recovery codes and credential setup through secure channels.

A release may be functionally code-complete while launch remains blocked by external inputs. Keep these states separate. Do not publish incomplete functionality to collect evidence from unsuspecting users.
