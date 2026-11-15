import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import {
  acquireWriterLease,
  commitSelectionResult,
  deleteSession,
  exportSessionJSON,
  importSessionJSON,
  listSessions,
  loadSession,
  recoverUnacknowledgedResult,
  releaseWriterLease,
  renewWriterLease,
  saveInitialSession,
  saveWheelDraft,
  loadWheelDraft,
  updateSession,
  validateSessionEnvelope,
  type SessionEnvelope,
} from '@lavbe/session';

const fixture = JSON.parse(await readFile(fileURLToPath(new URL('../../contracts/examples/session-names.json', import.meta.url)), 'utf8')) as SessionEnvelope;

async function cleanDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('lavbe-wheel');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('test database deletion blocked'));
  });
}

test('session envelopes validate schemas, references, results and all tool fixtures', async (t) => {
  for (const tool of ['names', 'numbers', 'yes-no', 'weighted', 'teams', 'bottle', 'game']) {
    const value = JSON.parse(await readFile(fileURLToPath(new URL(`../../contracts/examples/session-${tool}.json`, import.meta.url)), 'utf8'));
    await t.test(tool, () => assert.deepEqual(validateSessionEnvelope(value), { ok: true, value }));
  }
  const duplicate = structuredClone(fixture);
  duplicate.results.push({ ...duplicate.results[0]!, sequence: 2 });
  assert.equal(validateSessionEnvelope(duplicate).ok, false);
  const missingRound = structuredClone(fixture);
  missingRound.results[0]!.roundId = 'round_missing';
  assert.deepEqual(validateSessionEnvelope(missingRound), { ok: false, error: 'MISSING_REFERENCE' });
  const alteredLabel = structuredClone(fixture);
  if (alteredLabel.results[0]?.kind === 'entry') alteredLabel.results[0].label = 'Someone else';
  assert.deepEqual(validateSessionEnvelope(alteredLabel), { ok: false, error: 'INVALID_RESULT_MEMBER' });
  const outOfRangeTime = structuredClone(fixture);
  outOfRangeTime.results[0]!.committedAt = '2026-02-31T09:00:10Z';
  assert.equal(validateSessionEnvelope(outOfRangeTime).ok, false);

  const interrupted = structuredClone(fixture);
  interrupted.results[0]!.presentation = 'pending';
  assert.equal(recoverUnacknowledgedResult(interrupted)?.id, interrupted.results[0]!.id, 'reload recovery returns the already committed result');
  const normalized = structuredClone(fixture);
  normalized.configRevisions[0]!.wheel.entries[0]!.label = 'A\u0308ysel';
  normalized.results[0]!.label = 'A\u0308ysel';
  const normalizedResult = validateSessionEnvelope(normalized);
  assert.equal(normalizedResult.ok, true);
  if (normalizedResult.ok && normalizedResult.value.results[0]?.kind === 'entry') assert.equal(normalizedResult.value.results[0].label, 'Äysel');
});

test('IndexedDB commits, presentation recovery, leases, export and import are durable and atomic', async () => {
  await cleanDatabase();
  await saveInitialSession(structuredClone(fixture));
  const now = Date.parse('2026-11-14T09:00:20Z');
  assert.equal(await acquireWriterLease(fixture.wheelId, 'owner-one', now), true);
  assert.equal(await renewWriterLease(fixture.wheelId, 'owner-one', now + 1_000), true);
  assert.equal(await acquireWriterLease(fixture.wheelId, 'owner-two', now + 1), false);

  const next = structuredClone(fixture);
  const source = next.configRevisions[0]!.wheel.entries[1]!;
  next.results.push({
    id: 'spin_demo002', roundId: next.rounds[0]!.id, configRevisionId: next.currentRevisionId,
    sequence: 2, committedAt: '2026-11-14T09:00:20Z', presentation: 'pending', kind: 'entry',
    entryId: source.id, label: source.label,
  });
  let revision = await commitSelectionResult(next, 'owner-one', 1, now);
  assert.equal(revision, 2);
  assert.equal(await commitSelectionResult(next, 'owner-one', 1, now), 2, 'same spin retry is idempotent');
  const skippedReveal = structuredClone(next);
  skippedReveal.results.at(-1)!.presentation = 'acknowledged';
  await assert.rejects(updateSession(skippedReveal, 'owner-one', revision, now + 500), /presentation/i);

  next.results.at(-1)!.presentation = 'revealed';
  revision = await updateSession(next, 'owner-one', revision, now + 1_000);
  assert.equal(revision, 3);
  await assert.rejects(updateSession(next, 'owner-one', 1, now + 1_000), /lease or revision changed/i);
  const loaded = await loadSession(fixture.sessionId);
  assert.equal(loaded?.envelope.results.at(-1)?.presentation, 'revealed');
  assert.equal(loaded?.revision, 3);
  assert.equal((await listSessions()).length, 1);

  const exported = exportSessionJSON(next);
  const copy = await importSessionJSON(exported, { mode: 'copy' });
  assert.notEqual(copy.sessionId, fixture.sessionId);
  assert.notEqual(copy.wheelId, fixture.wheelId);
  assert.equal(validateSessionEnvelope(copy).ok, true);
  assert.equal((await listSessions()).length, 2);

  await assert.rejects(importSessionJSON('{bad json', { mode: 'copy' }), /valid JSON/);
  assert.equal((await loadSession(fixture.sessionId))?.revision, 3, 'failed import leaves the existing session intact');
  const replacement = await importSessionJSON(exported, { mode: 'replace', confirmReplace: true });
  assert.equal(replacement.sessionId, fixture.sessionId);
  await releaseWriterLease(fixture.wheelId, 'owner-two');
  assert.equal(await acquireWriterLease(fixture.wheelId, 'owner-two', now + 2_000), false, 'another owner cannot release the lease');
  await releaseWriterLease(fixture.wheelId, 'owner-one');
  assert.equal(await acquireWriterLease(fixture.wheelId, 'owner-two', now + 2_000), true);
  assert.equal((await loadSession(fixture.sessionId))?.revision, 4);
});

test('session deletion requires the active writer lease and clears only that session draft', async () => {
  await cleanDatabase();
  await saveInitialSession(structuredClone(fixture));
  await saveWheelDraft('private draft', fixture.sessionId);
  const now = Date.parse('2026-11-14T09:01:00Z');
  assert.equal(await acquireWriterLease(fixture.wheelId, 'delete-owner', now), true);
  await assert.rejects(deleteSession(fixture.sessionId, 'other-owner', 1, now), /writer lease/);
  assert.equal((await listSessions()).length, 1);
  assert.equal(await loadWheelDraft(fixture.sessionId), 'private draft');

  await deleteSession(fixture.sessionId, 'delete-owner', 1, now);
  assert.equal((await listSessions()).length, 0);
  assert.equal(await loadSession(fixture.sessionId), null);
  assert.equal(await loadWheelDraft(fixture.sessionId), null);
});

test('storage quota failures are surfaced without writing a partial session', async () => {
  await cleanDatabase();
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function () { throw new DOMException('simulated storage quota', 'QuotaExceededError'); };
  try {
    await assert.rejects(saveInitialSession(structuredClone(fixture)), (error: unknown) => error instanceof DOMException && error.name === 'QuotaExceededError');
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }
  assert.equal(await loadSession(fixture.sessionId), null, 'failed transaction stores no partial record');
  await saveInitialSession(structuredClone(fixture));
  assert.equal((await loadSession(fixture.sessionId))?.revision, 1);
});
