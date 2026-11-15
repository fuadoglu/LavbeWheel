# 💰 Advertising, consent and measurement

## Revenue model

Free tools and games; initial monetization is display advertising on public tool and pack-discovery pages. Optional clearly labeled direct sponsorship slots may be configured, but there is no self-service advertiser billing system in scope. No mandatory ad to spin, reveal a result, skip a card, export or restore. No popunder, forced video, misleading controls, artificial pageview or spin-triggered refresh. Revenue estimates remain hypotheses until real data exists.

## Placement contract

Desktop: one reserved secondary rail slot when width permits; optional lower content slot. Mobile: one inline slot below primary controls, outside spin/result/editor interaction. Never persistent overlays squeezing the board/keyboard or putting ads beside a deceptive tap target. Reserve dimensions before ad load to avoid CLS. Empty/blocked ads collapse only at a safe layout boundary with no active pointer interaction. Fullscreen, admin, snapshots and private local-library/report views have no ad tags. No fake ad placeholders counted as monetized impressions.

Ad refresh is disabled by default. Any future change requires provider-policy review and a documented decision, not an animation event hook. Sponsor selection uses coarse country only when lawfully available, separate from UI language; never infer sexual interests, relationship status or participant identity.

## Consent architecture

Basic consent mode: optional Google/GTM/analytics/ad scripts do not load until the relevant permission is granted. First-party CMP is initialized independently; consent never relies on loading an otherwise-blocked GTM. Default analytics_storage/ad_storage/ad_user_data/ad_personalization are denied. Enable categories separately. Google requires publishers using AdSense, Ad Manager or AdMob to use a Google-certified CMP integrated with IAB TCF when serving ads in the EEA, UK or Switzerland; verify current provider and inventory requirements before activation ([Google publisher requirements](https://support.google.com/adsense/answer/13554116?hl=en)). Consent Mode is not consent collection or legal certification.

Accept/reject/customize are equally discoverable; no preselected optional categories or consent wall for core functionality. Footer privacy choices can reopen CMP. Withdrawal stops further optional requests, clears controllable identifiers and explains limits of previously processed data. Region failure defaults to strict opt-in globally. Provider/CDN failure leaves the tool usable and tags off. Honor supported GPC/opt-out signals according to applicability; record chosen legal configuration in launch evidence.

## GA4 / GTM event allowlist

| Event | Allowed parameters |
|---|---|
| tool_ready | tool_id, locale, build_id |
| selection_completed | tool_id, mode, entry_count_bucket |
| game_started / game_ended | pack_family, player_count_bucket |
| share_created | tool_id, ttl_days |
| export_completed | format, report_type |
| app_error | enumerated error_code, build_id |
| web_vital | metric_name, bucket, public_route_id |

No labels, titles, cards, raw errors, clipboard, share IDs, management tokens, full URLs, persistent local participant IDs or unbounded free text. Disable automatic form/site-search collection and sanitize page_location/page_title to public canonical route data. Snapshot routes load neither GTM nor GA4. Do not send precise spin-level histories. No replay/heatmap SDK in baseline.

## Operational controls

Integration IDs are external config, never fabricated. Use provider-safe templates and reviewed GTM versions; admin cannot inject arbitrary script HTML. Track revenue/1,000 sessions, ad viewability, return rate and performance together. Run controlled experiments with a kill switch; winner must not worsen core success/retention beyond an explicitly approved threshold. Ad approval is an external launch input and not guaranteed by document completeness.

Current WP11 implementation: a first-party EN/AZ privacy-choice panel stores separate analytics and advertising choices, can be reopened from the footer, honors Global Privacy Control by keeping optional categories denied, and defaults to essential-only behavior. GTM/GA4 scripts are considered only when a single strict integration record is in the trusted build manifest and analytics permission was granted; consent-mode storage defaults are denied before those scripts are inserted. The trusted runner passes only the reviewed integration record to the static build. No IDs are configured, and no event telemetry is emitted by the current UI. Ad scripts and ad placements remain disabled: the integration contract has no approved ad-unit IDs or selected/verified CMP provider integration. The UI's local choice state is not a legal-compliance certification; operator, jurisdiction, processor and provider review remain required before production activation.
