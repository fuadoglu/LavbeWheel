# 🎯 Product specification

## Audience and promise

Lavbe serves people making a quick choice, educators/organizers and couples/friend groups playing together around a device. The core task must stay as short as paste → spin → result. The root page opens a usable classic wheel, with example entries clearly identified as examples. First user input replaces examples only after a clear action; never silently deletes user content.

## Mandatory requirements

| ID | Requirement |
|---|---|
| SEL-01 | Equal-probability names, integer range, yes/no and explicit weighted selection |
| SEL-02 | Balanced random teams; no duplicate assignment or omitted member |
| GAM-01 | Bottle with explicit seat mapping and no physical-position inference |
| GAM-02 | Truth/dare, getting-to-know-you, couples and friend-group packs; skip/pause and no repeated card in a session |
| UX-01 | Touch-first responsive layouts, system/light/dark and consistent controls |
| MOT-01 | Precise landing, configurable duration/sound, adaptive effects, reduced motion |
| TXT-01 | Measured label fitting and readable fallback for dense/long labels |
| DAT-01 | Local autosave, restore, undo, validated import/export and storage-failure recovery |
| REP-01 | Durable history, per-entry counts, observed percentages, rounds and CSV |
| SHR-01 | Immutable shared snapshot with expiry, revocation and independent recipient sessions |
| LOC-01 | All 110 registry locales reviewed; explicit language and RTL behavior |
| SEO-01 | Static useful locale/tool pages and controlled indexing; private routes excluded |
| PWA-01 | Installation, offline eligible tools and safe version updates |
| ADS-01 | Nonblocking placements and consent-controlled integration |
| PRI-01 | Minimal data, documented rights handling and protected capabilities |
| ADM-01 | Authenticated content/config administration and validated publication |
| OPS-01 | Shared-host deployment, backups, restore and rollback |

## Selected capacity defaults

Normative values are in [limits.json](../config/limits.json). A wheel supports 1–1,000 entries, labels up to 120 Unicode grapheme clusters, and title up to 80 graphemes. Names may repeat but receive distinct IDs. One remaining entry is displayed as a deterministic remaining result without pretending a meaningful random contest; zero eligible entries disables spin. Positive integer weights are 1–1,000. Integer ranges are inclusive, within ±1,000,000 with at most 10,000 possible outcomes and generated without rendering 10,000 wedges. Team count is 2–50 and no greater than member count.

These are safety and usability bounds, not claims that 1,000 labels fit legibly on a phone. Show a clear dense-view notice with an accessible complete list.

## Content delivery scope

Six mandatory pack families: icebreakers, friends, couples, truth, dare, family. Each family has at least 50 distinct source cards (300 total), with complete reviewed localization in all launch locales. Each translated card may have locale-specific replacement content while retaining a stable semantic ID. Every pack declares minimum/maximum players, age suitability, intensity, equipment and estimated duration. Adult-oriented relationship packs may use neutral 18+ audience labels without explicit text; this is a content suitability label, not a legally sufficient age-verification claim.

## Scope exclusions

No chat, live synchronized multiplayer, public UGC library, payment/subscription flow, public accounts, gambling/betting, prizes fulfillment or certified lottery claims. Users may enter text but no public discovery directory is created. Private snapshots remain subject to abuse reporting and removal.

## Success criteria

Measure first successful user-owned selection time, repeat visits, share-open conversion, failures, consented performance and revenue per 1,000 sessions. No fabricated numeric growth forecast. Comparative UX testing must cover paste/edit/spin/share/resume, not only visual preference.
