# 📚 Primary reference register

Reviewed 2026-11-14. External policies and documentation can change; recheck relevant sections during implementation and before production activation. Sources inform requirements; they do not certify the implementation.

| Topic | Primary source | Use |
|---|---|---|
| Competitor | [Wheel of Names](https://wheelofnames.com/) / [FAQ](https://wheelofnames.com/faq) | Existing features and share semantics |
| International search | [Google multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) | Locale URLs and redirect behavior |
| Alternate languages | [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions) | hreflang implementation |
| Search quality | [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies) | Avoid low-value scaled pages |
| IndexNow | [Protocol documentation](https://www.indexnow.org/documentation) | Change notifications, not ranking guarantees |
| Consent | [Google consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode) | Basic/advanced behavior distinction |
| Advertising CMP | [Google publisher CMP requirements](https://support.google.com/adsense/answer/13554116?hl=en) | Applicable certified CMP/TCF requirements |
| Analytics privacy | [GA PII guidance](https://support.google.com/analytics/answer/6366371) | No names/private URLs in analytics |
| Privacy principles | [European Commission GDPR principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en) | Minimization and privacy by design |
| Consent rights | [European Commission legal grounds](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en) | Consent and withdrawal |
| Accessibility | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | AA target and manual review |
| Performance | [Core Web Vitals](https://web.dev/articles/vitals) | Field p75 thresholds |
| PWA | [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) | Lifecycle/cache behavior |
| Static deploy | [Astro deployment](https://docs.astro.build/en/guides/deploy/) | Static output and hosting |
| API format | [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) | HTTP contract format |
| JSON schema | [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | Payload validation |

Policy statements in this package are implementation requirements chosen for Lavbe. Operator-specific legal duties must be assessed against real jurisdiction, audience and processing. No performance/traffic/revenue numbers are presented as observed Lavbe results.
