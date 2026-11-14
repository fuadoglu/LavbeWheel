# Semantic validation and portable recovery contract

This supplements JSON Schema; implementations MUST run both. TS and PHP must run identical golden vectors in contracts/semantic-vectors.json before API/persistence integration. The reference checker is scripts/validate_semantics.py; it proves vectors, not the future TS/PHP implementations.

## Ordered validation

Normalize string values to NFC before storing; never silently merge names. Reject malformed UTF-8 at HTTP ingress. Use Unicode extended grapheme segmentation consistently (Intl.Segmenter in JS; PHP intl grapheme functions), counting user-perceived characters rather than bytes. UTF-8 total request byte limit remains separate. Reject blank-after-trim labels and unsafe control characters; retain ordinary RTL letters/marks and valid emoji joiners. Use text rendering, not HTML interpretation.

After schema checks evaluate rules in this order; return the first code:

1. DUPLICATE_ENTRY_ID: entry IDs must be unique.
2. LABEL_TOO_LONG / TITLE_TOO_LONG: 120/80 graphemes, respectively.
3. INVALID_RANGE: min≤max and inclusive outcome count ≤10,000.
4. INVALID_TEAM_COUNT: 2≤teamCount≤active member count; all weights equal 1.
5. INVALID_SEATS: unique seat IDs must equal the active entry ID set, 2–20 members.
6. INVALID_WEIGHT_MODE: non-weighted tools use weight=1; weighted tool cannot use shuffled-cycle.
7. NO_ACTIVE_ENTRIES: at least one active entry for selection; editors may retain invalid drafts but cannot spin/share them.

Numbers use range as eligibility; entries is an empty array, not phantom names. Their cycle lists are empty. Number results hold value and no entry ID. Teams results contain every active ID exactly once in groups differing in size by ≤1. Yes/no has two active equal-weight options. Names/yes-no/weighted/bottle yield entry results; game yields card results.

## Session restoration

Validate the full envelope against session.schema.json, then validate every embedded wheel. All wheel/session/round/result/config IDs are unique in their respective namespaces. currentRevisionId must reference an existing revision. Every result references an existing round/revision; sequences strictly increase (gaps permitted after declared history pruning), timestamps are UTC and nondecreasing. Type must match referenced tool. Entry IDs/labels must match the immutable revision; number values must be within its range; team membership must satisfy the rules above.

Cycle remaining/excluded IDs refer to current active entries, are disjoint and never introduce IDs. Independent mode remaining equals active IDs, excluded empty. Remove-winner state is derived from recorded draws and reset cycle metadata; shuffled-cycle preserves actual remaining order without rerolling after reload.

Game pack snapshot matches pack ID/version/locale; card IDs unique. Used-card IDs refer to the snapshot, activeResultId refers to the unresolved card result, its text matches the snapshot. Paused state requires resumePhase; other phases require null. Completed/skipped cards remain consumed. An active session keeps the pinned pack even after content publication updates. Never infer a new result when restoring.

Validate into a temporary store before replacing any live data. Import failure preserves existing data. Colliding IDs on importing a separate copy are remapped transactionally including every reference; replacing an existing session requires confirmation. Exported management tokens are a separate explicit sensitive backup, not part of portable session JSON.

## Admin publication

Each DraftImport kind has a strict record schema. No arbitrary HTML/scripts. Validate placeholder sets and ICU syntax for UI strings, route uniqueness for SEO, operatorRevision for legal, approved template IDs for presets and allowed provider IDs for integrations. Review state/sourceHash are verified server-side, not trusted from imported status fields. Only reviewed immutable versions enter a manifest. Hash canonical UTF-8 JSON with deterministic key ordering (RFC 8785 implementation selected and shared in WP01); exclude manifestHash itself. Build runner recomputes hash and rejects mismatch. Signed/scoped authenticated transport is required in addition to hashes. Source changes invalidate dependent review status; cannot publish stale sourceHash.

Evidence: schema/fixture/reference checks now; actual TS/PHP equivalence and HTTP integration during WP02/WP07. No unexecuted runtime checks are marked passed.
