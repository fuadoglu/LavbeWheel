# 🔎 Search architecture and organic discovery

## Routes

/ is an indexable useful x-default home with a working default tool and locale links. /{locale}/ is a complete localized home. Stable tool routes: /{locale}/random-name-picker/, /random-number-picker/, /yes-or-no-wheel/, /weighted-wheel/, /team-generator/, /spin-the-bottle/, /truth-or-dare/, /couples-games/, /group-games/ under each locale. English slugs are stable route IDs; translated visible names and metadata are required. Do not create duplicate generic spinner URLs that compete with the localized home.

Every tool route must provide the appropriate working tool, original localized explanation, rules, concrete examples, accessibility instructions and relevant internal links. Content precedes optional lazy enhancements in server-delivered HTML. Semantic headings and links accompany Canvas. No arbitrary minimum word count; usefulness and correctness are reviewed.

## Index controls

Each public locale/tool page self-canonicalizes to its absolute HTTPS trailing-slash URL. Alternate hreflang links are reciprocal and include self and actual published equivalents; x-default points to the useful default route. Do not canonicalize all languages to English. Snapshot, admin, preview and API routes are noindex; no user labels in public metadata. Shared pages remain crawlable enough to observe noindex; robots.txt is not access control.

Sitemap index groups locale files, includes only canonical published public URLs, and follows protocol limits. lastmod comes from meaningful content/build-source change, never a random clock value. 301 www/http/duplicate slashes to one hostname without redirect loops. Return real 404/410 statuses, not a 200 home fallback. Query variants canonicalize to the clean route; UI state does not generate indexable URL explosions.

## Structured data and distribution

Use Organization/WebSite and accurate SoftwareApplication/WebApplication markup only where supported and truthful. No fabricated reviews, ratings, prices or FAQ-rich-result promises. Social preview images are first-party branded assets; private shares use generic metadata. Ensure Bing and other standards-based crawlers receive the same useful content, not bot-only pages.

Submit domain property and sitemaps to Search Console and Bing Webmaster Tools; use IndexNow for added/changed/deleted public URLs with a host verification key. Google coverage uses normal crawling/sitemaps; no generic Google instant-indexing promise. Additional regional webmaster portals are an operator option, not an unsupported automatic integration.

## Content and measurement

Start from distinct intents in each market, not a Cartesian keyword-page generator. Related use cases can live within a tool page. Publication requires native title/description/content review. Capture per-route impressions/clicks, index exclusions, crawl errors and performance in webmaster tools. Segment first-party analytics only after consent. Do not store search queries containing user-entered names.

Organic rankings depend on competition, content and reputation, not schema tags alone. Review 404s, duplicate canonicals, stale translations and low-value pages periodically. Ads must not make the initial tool or public content inaccessible. [Sources](20-SOURCES.md) are guidance, not ranking guarantees.
