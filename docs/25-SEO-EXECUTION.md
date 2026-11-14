# 🔎 SEO execution contract — primary product requirement

SEO is a primary Lavbe acceptance area, not a final metadata task. This contract extends docs/08-SEO.md and overrides ambiguous route/index defaults there. Sources: Google localized versions, canonical consolidation and spam policies; IndexNow documentation, reviewed 2026-11-14. These are engineering rules, not ranking guarantees.

## 1. One source of route truth

config/seo/routes.json is the canonical intent/route/related-link registry. Every entry defines a working tool, English query hypotheses and its distinct purpose. English seeds are not measured search demand, recommendations to stuff keywords, or completed native research. Metadata, navigation, sitemaps, alternates and crawler tests derive from this registry plus publication state. No competing /spinner/ alias alongside home. Student/classroom use lives inside random-name-picker until distinct purpose and content justify a separate route decision.

Public baseline: global home + ten localized discovery/tool routes per locale (localized home included) + six legal routes. This is a planned inventory, not permission to index unfinished translations. All 110 locales remain launch scope. Content-native review is a launch work item; UI translation alone does not fulfill it.

## 2. Publication state machine

Draft → content-validated → native-reviewed → SEO-reviewed → published. Persist sourceHash, reviewer/date, intent ownership, title/description/H1, examples and module coverage. Any source change marks dependent translations stale; no automatic publish from stale source. Public pages cannot display English fallback while claiming another language. Failed translation build keeps previous valid artifact. State changes produce a diff listing new/removed public routes and changed alternates/sitemaps.

config/seo/locale-research.json explicitly records pending research for all 110 locales. Research must include native terms, task intent, observed results/date/country/device, competitor format and evidence reference. Paid volume data is optional: absent volume is null, never zero or invented. Evaluate priority by user need, intent match, competition and supported monetization; do not discard useful languages merely because ads are unsupported.

## 3. Page contract

Each localized tool page requires: unique descriptive title and description; one primary H1; correct language/direction; useful functioning tool immediately; concise how-to; rules and probability where relevant; examples; privacy/storage explanation; accessible alternative to Canvas; related tools and legal links. Content is visible semantic HTML without JavaScript. No arbitrary word count, hidden text or generated filler. All visible copy is native-reviewed. User entries cannot become page titles, meta descriptions, JSON-LD or canonical query values.

Titles/descriptions have editorial previews, not hard Google character-limit claims. Home owns generic wheel intent; each subpage owns its distinct task. Use helpful natural wording, not lists of synonyms. Game pages include actual playable reviewed packs, audience/equipment and skip behavior. Locale-specific cultural replacements preserve actual tool purpose.

## 4. Localization and alternatives

Use exact canonical locale spelling from registry (zh-Hans, pt-BR etc.) and approved case aliases. Generate fully qualified reciprocal HTML hreflang, including self, only between published same-intent pages. Tool x-default points to the English same-tool route; home x-default is /. Legal pages use language alternatives only for matching document types; legal pages are indexable but omitted from XML sitemap by default. No fake regional alternates when the content has no regional distinction.

Canonical is self-referencing per published locale, not English. Do not derive hreflang from <html lang> without validating Google-supported code mapping. For example registry no maps to supported Norwegian no; exact regional/script mapping is tested before release. Country cannot redirect a requested locale. On / render useful default HTML and offer preferred-language navigation; do not replace crawlable main content unpredictably using geo signals.

## 5. Index and URL behavior

config/seo/indexing.json controls page types. config/seo/url-cases.json supplies HTTP contract fixtures; actual origin/CDN tests must reproduce them. Normalize scheme/hostname/slash/case aliases in one hop when possible. Resolve full target before issuing redirect. Reject malformed escapes/unsafe traversal. Unknown locale or path is real 404 with useful links, never 200 home. Retired content: 301 only to genuinely equivalent content, otherwise 410; no blanket redirect to home.

Tracking-only query params: serve 200, canonical clean, do not create internal query links. q/entries/title and unknown state-bearing params: noindex,follow; strip private state from telemetry and metadata. Unsupported pagination: 404. Root fragments never represent SEO pages. Preview requires authorization + noindex; robots is not access control. Share/API routes use X-Robots-Tag defense in depth, no-store and no shared cache. Do not disallow share URLs in robots in a way preventing observation of noindex. Do not add secret IDs to sitemap/log reports.

## 6. Sitemap and crawl access

One sitemap index with locale/tool submaps, only canonical published indexable 200 URLs. Practical submap ≤5,000 URLs and <10 MiB uncompressed (product limits below protocol ceilings). lastmod is ISO timestamp from meaningful visible content source change; no deploy-time/random bump. XML escaping and UTF-8 tested. Do not include redirects/errors/noindex/legal/private/admin/query variants. Root includes sitemap location in robots.txt. CSS/JS/fonts needed to understand public content remain crawlable. Staging requires authentication plus noindex; production config MUST fail if staging-wide noindex/disallow is present.

IndexNow submits only real added/changed/deleted public URLs after successful release promotion, max 10,000 URLs per request, with key verification, retries/backoff and deduplication. Keep submission log with public paths and result code, not private tokens. Google gets ordinary sitemap/crawl discovery; do not use its restricted Indexing API as a generic submission channel.

## 7. Internal linking and structured data

Home links all tools using native anchor text. Each tool links its registry related tools and home; game discovery links reviewed packs within a bounded page, not infinite generated URLs. Each published tool is reachable within two navigation steps from localized home. Locale switch links to the same intent, fallback visibly explained if not published. No orphan page, empty href, JS-only navigation or all-to-all keyword footer.

Site identity: Organization and WebSite with stable IDs and real operator facts only. Tool: WebApplication with URL, native name/description, applicationCategory, operatingSystem='Any' and isAccessibleForFree=true. Include no invented rating, review count, award, offer or certification. Match visible functionality; do not promise rich results. Secondary pages use BreadcrumbList matching visible breadcrumb. Legal pages use WebPage, not SoftwareApplication. JSON-LD serializer escapes script-breaking characters. Social preview is native metadata and first-party generic art, never participant data.

## 8. SEO and performance coexistence

Apply motion/performance budgets with ads on/off and real fonts. Default content includes semantic text even if Canvas fails. No language megabundle or autoplay media. Dynamic overlays must not hide first-use tool/content. PWA offline route fallback must not turn missing production URLs into 200. CDN varies safely by URL/version, not uncontrolled language cookies; no browser-specific canonical or bot-only content.

## 9. Required build artifacts

Generate: route-manifest.json (URL, routeId, locale, contentHash, canonical, robots, HTTP expectation, alternatives, sitemap file, source review IDs), sitemap index/submaps, robots.txt, redirect manifest and seo-audit.json. Private routes are represented by route templates only, never real IDs. Build report identifies mismatches and blocks deployment. Missing native/content review is not bypassed for a green build.

## 10. Search acquisition and operating cadence

Prepare original shareable teacher/event guides, genuinely useful examples and embeddable/public tool links as distribution assets; public embed support requires its own privacy/security contract before activation. No paid-link schemes, automated comment spam or forced followed backlinks. Sponsored links use appropriate sponsored/nofollow relationship. No mass irrelevant directories.

Launch: verify domain properties, sitemap fetch/status, representative locale/tool live inspection, headers, robots and actual CDN behavior. First two weeks: daily error/index exclusion checks; weekly thereafter. Day 30/60/90: review route/locale impressions, clicks, query intent and conversion to first useful selection. Do not promise index coverage/traffic deadlines or compare incomplete recent days without considering reporting delay.

Split problems: not discovered → links/sitemap; crawled not indexed → quality/duplicates/content review; indexed few impressions → demand/competition; impressions low CTR → intent/title review; visits no successful use → UX/tool issue. Do not delete useful seasonal pages after a short no-traffic window. Data-driven consolidation needs redirect/equivalence review and preserved translations.

## 11. Release-blocking engineering tests

All public routes, not only samples: parse built HTML; unique canonical and noindex rules; HTTP/CDN status; locale/lang/dir; no English fallback; title/H1/description nonempty; visible content modules; reciprocal alternatives pointing to final indexable 200 URLs; sitemap equality; no orphans; links resolve; JSON-LD matches visible data; no private text/tokens; robots doesn't block public assets; staging directives absent. Native review and live webmaster inspection remain evidence, not fabricated automation.

Run npm run test:seo against the real generated site, plus origin HTTP tests after deploy-to-staging. The current scripts/validate_seo_contract.py validates the specification registry/fixtures only, NOT a website. Add property tests for all 110 locales and URL normalization fuzz cases. Output every failure with public route/requirement ID. Never label this package technically implemented because documentation CI passes.
