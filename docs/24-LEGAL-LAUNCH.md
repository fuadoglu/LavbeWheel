# Legal pages and production readiness

This is an implementation and operator-review specification, not a legal opinion or worldwide compliance certificate. Apply the actual operator jurisdiction, audience and processing; qualified review is a launch requirement. Never publish invented company details or claims of completed certification.

## Required public routes in every launch locale

| Route suffix | Required content and behavior |
|---|---|
| privacy/ | Controller identity/contact, purposes and legal bases by data flow, local/server distinction, recipients/processors, international transfers, retention, rights, complaint authority, children, automated decision-making position, effective date and change history |
| cookies/ | Actual cookie/storage inventory: name/provider, purpose, category, duration, first/third party and activation condition; IndexedDB/SW/localStorage disclosed, not just cookies; consent choices link |
| terms/ | Operator identity, service description, eligibility, acceptable use, user-entered content permissions limited to delivering service, share exposure, non-certified random selection, reasonable liability/availability terms subject to mandatory rights, governing law/dispute channel after review |
| privacy-rights/ | Access/export/deletion/restriction/objection/withdrawal and applicable opt-out request instructions; proportionate verification; local-data clear/export controls; request status reference, expected response procedure and complaint channel |
| contact/ | Real operator contact and service/privacy/security/abuse channels; no invented addresses |
| accessibility/ | Actual accessibility target and audited status, known limitations, assistance/feedback channel and review date; no unsupported compliance claim |

Footer on all public tool/content pages: privacy, cookies, terms, privacy choices, rights, accessibility, contact. Private share screens retain first-party legal links without loading third-party tags. Consent text must match current providers and actual data flow. Operator-specific imprint/company-information page is added where applicable, not assumed universally unnecessary.

## Binding privacy-page inventory

Disclose: local names/reports and deletion controls; explicit server sharing and link-access implications; management token loss; immutable recipient copies; expiry/revocation and backup limits; host/CDN IP handling; pseudonymous rate/security logs; CMP consent records; analytics/ad recipients when enabled. State which optional processing stops after withdrawal and which necessary operations continue on an appropriate basis. Do not describe pseudonymous data as anonymous. No generic claim that all data stays on device when sharing exists.

## Rights workflow

Select owner/channel; collect minimal request details; acknowledge receipt and set jurisdiction-specific due date; verify without excessive identity collection; search server records via appropriate capability/reference; fulfill or explain lawful exceptions; record outcome without retaining unnecessary identity material. Export uses a safe machine-readable format. Delete live payload and journal its removal for backup restore suppression. Close request and expire case records under a reviewed retention schedule. Local browser data is controlled by in-app export/clear; operator cannot remotely inspect every anonymous device. Losing a management token is handled honestly, with proportionate alternative verification only when feasible.

## Cookie/consent acceptance

Reject and accept are equally discoverable. No optional preselection; category/vendor choices; change/withdraw at any time. New vendor/purpose or materially changed terms triggers review and renewed consent when required. On reject/unknown/CMP failure no optional requests. Nonpersonalized advertising is not automatically exempt from storage/consent requirements. Test all regions and GPC applicability with real configuration. Browser tools/crawler cookie inventory must match published disclosures. Test cookies AND localStorage/IndexedDB/network requests.

## Child and social content decision

Operator documents whether service or portions are child-directed and applicable age/parental-consent treatment before analytics/advertising activation. School/family usability does not justify profiling children. No explicit content, pressured intimacy, intoxication, dangerous dares or coercion. Age suitability labels are not legally sufficient age verification. User text has report/removal workflow without public indexing.

## Versioned publication and launch blockers

Each legal document stores locale, document ID, revision, operatorRevision, effectiveAt, reviewedAt, reviewer and sourceHash. Changing operator/provider/purpose/retention marks affected legal translations stale and disables activation of changed optional processing until reviewed. Required documents cannot be unpublished while the service remains live; rollback retains an accurate previous operational configuration. No raw HTML/script insertion through legal content.

Operator inputs: real legal name/type, establishment country/address where required, contact/rights/security channels, competent authority and complaint details, actual processor/subprocessor inventory, transfer mechanism, lawful bases, retention schedule, child-audience decision, applicable representative/DPO decision and terms dispute clauses. These are genuine external facts. No placeholder or '100% GDPR compliant' badge may substitute.

## Evidence required before production

1. Operator fact sheet and applicable-jurisdiction review signed off.
2. Six page types complete in 110 locales with legal/native review metadata; applicable imprint added.
3. No unresolved placeholder fields, stale legal source hashes or absent contact channels.
4. Actual cookie/storage/network scan reconciled with inventory, consent and processor list.
5. Test rights request, consent withdrawal, abusive share removal, live deletion and restored-backup suppression.
6. Verify footer links, keyboard accessibility, readable mobile layout, real HTTP status and effective dates.
7. Confirm DPAs/transfer safeguards where applicable and approved operational incident/response procedure.
8. Record operator approval and evidence in release manifest; code CI cannot mark legal review complete.

Full production readiness requires BOTH completed implementation gates and genuine operator/provider/content review. Documentation can define and enforce these gates; it cannot truthfully manufacture the missing external facts or guarantee every jurisdiction's legal outcome.
