# 📊 Sessions, rounds and reporting

## Identity and local persistence

Generate stable opaque IDs for wheels, entries, sessions, rounds and spins. Labels are display values, not primary keys. Identical names do not merge. Store wheel configuration, sessions, rounds, spin records, game state, saved wheels, undo metadata and preferences in versioned IndexedDB stores.

Each spin record includes spinId, sessionId, roundId, sequence, UTC committedAt, selected entry ID+label snapshot, algorithm version, mode, eligible IDs+weights, total weight, and presentation state. Update sequence and append record atomically. Unique spinId makes retries idempotent. A selected but not yet displayed result is recovered and revealed exactly once after reload; never reroll to conceal a crash.

## Round boundaries

Manual participant/weight/mode edits create a new round BEFORE the next selection. Theme, locale, sound and spin duration do not. Removing a winner automatically in remove-winner mode stays in the same round; that eligibility change is recorded per spin. Resetting the removal cycle increments cycle metadata. Historical labels are immutable snapshots even when current labels change.

## Tables

History columns: sequence, selected label, local display time, round and state. Newest first; accessible pagination at 50 rows, stable focus and no auto-scroll when a result arrives. Per-participant columns: label/disambiguator, count, observed share. Share = committed selections for that participant / total committed selections in selected round(s). Include zero-count members of the selected round. Do not call observed share the chance of winning next time. When aggregating multiple rounds, show a warning that eligibility may differ; default to current round.

Show total spins, distinct selected participants and active mode. A discarded visual animation is not an erased result. New session starts a fresh report; old session remains available until explicitly removed or retention applies. Do not treat a small-sample count imbalance as evidence of bias.

## Undo, clearing and retention

Undo restores draft edits only. It cannot rewrite committed results. Clear report is an explicit destructive action with export and confirmation; record local reset metadata without sending it to analytics. Default local history retains latest 10,000 results per session and latest 20 sessions; warn before oldest data is pruned and offer export. Never trim mid-spin. These limits are in [config](../config/limits.json).

CSV exports UTF-8 with BOM for spreadsheet compatibility, quoted fields and formula-injection protection for cells starting with =,+,-,@ or control characters. Include UTC timestamp and round/mode/entry IDs; human labels remain localized text. Reports are not official audit certificates. JSON export follows [session.schema.json](../contracts/session.schema.json), includes schemaVersion and restores local selection sessions with validated import preview. The same envelope includes pinned game pack, active card, turn, pause/resume phase and consumed cards. Number/team results have their own discriminated types. See [portable recovery semantics](22-SEMANTIC-CONTRACT.md). Validate ID references, unique IDs, monotonic sequence, matching selected label/ID and eligible membership semantically; JSON Schema alone cannot prove these. No executable content is accepted.

## Cross-tab and failure semantics

Prefer Web Locks for one active writer per wheel. Fallback: transactional IndexedDB lease (owner ID, revision, 10 s expiry), renewed every 3 s while active; compare-and-swap in a transaction before every write. After sleep, reacquire before accepting interaction. BroadcastChannel is advisory, not the lock. Never hold an IndexedDB transaction open across animation. Quota/private-mode errors offer export or explicit ephemeral mode; do not silently pretend persistence succeeded. Test crashes at select/commit/reveal/acknowledge boundaries.
