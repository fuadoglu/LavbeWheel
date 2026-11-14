# 🧨 Red-team findings and competitive decisions

Competitive baseline reviewed 2026-11-14 against [Wheel of Names](https://wheelofnames.com/) and [official FAQ](https://wheelofnames.com/faq). This is a documentation comparison, not an exhaustive UI audit. Existing capabilities include weighted wheels, short-link snapshots, customization, local/cloud saving, multi-wheel, Sheets import, many languages and closeable ads. Do not claim these are unique Lavbe innovations. Unverified competitor absence (report details, dark theme, label fitting) must stay unverified.

| Failure scenario | Severity | Required mitigation / residual risk |
|---|---|---|
| Beautiful clone attracts no users | High | Test task advantage; useful localized tools, sharing and reviewed game content; traffic remains uncertain |
| 110 thin translations create weak pages | High | Human review, useful route intents and publication gates; substantial content cost remains |
| Effects hurt speed/battery | High | Adaptive quality, asset budgets, real-device traces; weak devices still need fallbacks |
| Very long/dense labels unreadable | Medium | Minimum font, ellipsis/full list, truthful dense mode; no impossible full-label guarantee |
| Renderer lands on another name | Critical | Result-first target geometry and deterministic edge tests |
| Crash creates duplicate/missing result | High | Atomic commit before animation, unique IDs and recovery state |
| Report implies fairness from tiny samples | Medium | Observed share wording; mode and round filters; no rigging accusations from counts |
| Cross-tab changes corrupt session | High | Transactional writer lease and revision checks |
| Share leaks student names | Critical | Explicit disclosure, random capability, generic metadata, no tags/cache; recipients can still copy |
| Anonymous owner cannot revoke | High | Separate management secret + export warning; no false recovery promise |
| Idempotency retry loses token | High | Short encrypted response cache; replay tests and key redaction |
| Revoked data reappears after restore | Critical | Deletion journal and restore suppression tests |
| Ad income assumed from long sessions | High | Measure realized session revenue/retention; fullscreen remains unmonetized |
| GTM loads before consent | High | Independent CMP, fail-closed basic mode and network tests |
| User text causes XSS/CSV injection | Critical | Text-only rendering, strict validation, formula-safe export |
| Party mode undermines school suitability | High | Clear audience packs, non-explicit content and suitability review |
| Admin panel cannot publish static pages | High | Trusted build-runner bridge, job states and tested promotion |
| Shared hosting has no atomic deploy/inode headroom | High | Provider acceptance gate and recovery rehearsal |
| SW serves obsolete or private content | High | Version matching, no private cache and safe activation |
| Docs badge mistaken for certification | Medium | Explicit specification status and evidence-only release claims |

## Where Lavbe intends to win

Mobile task flow, coherent tool-specific styling, purposeful social games and durable reports. These are design hypotheses pending implementation and comparative evidence. Language count and SEO tags are distribution foundations, not defensible advantages alone.

## Design decisions retained after challenge

Keep classic wheel immediately visible. Separate tool and game navigation without a blocking onboarding wizard. Keep ordinary use account-free. Preserve privacy by local storage. Restrict anonymous shares to text and first-party presets. Exclude multiplayer/public UGC/payment scope. Complete all agreed scope before public release, while separating external launch readiness from code completion.

No numerical perfection rating is assigned. Residual business risk is organic acquisition and monetization; residual operational risk is third-party/provider change. Re-review this register before release and after material architecture changes.
