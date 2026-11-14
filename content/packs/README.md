# Game pack source data

`en/` contains six English source packs, each with at least the configured 50 cards. Pack IDs are stable across revisions; card IDs are stable within a family and never reused for a different prompt. Active sessions embed a fixed pack snapshot, so later content edits cannot change a saved card.

Every pack is currently `draft`. The prompts are original working copy, not approved safety guidance. The dares are designed to be low risk, non-contact, and optional; a player may pass any card without a reason. Human suitability and cultural review must happen before any pack can be marked reviewed or treated as launch-ready. Translation catalogs for all planned locales remain a separate WP09 deliverable.

`review.sourceHash` is SHA-256 over the canonical UTF-8 JSON object formed by sorting object keys recursively and excluding the `review` property. `npm run test:content` checks each pack against `contracts/pack.schema.json`, the configured family/card counts, globally unique card IDs, absence of HTML tags, and this source hash. Structural validation does not imply content approval.
