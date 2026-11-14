import type { SessionEnvelope } from '@lavbe/contracts';
import { openDatabase, requestValue, transactionDone, type StoredSession, type WriterLease } from './database.ts';
import { validateSessionEnvelope } from './session-validation.ts';

export class SessionConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'SessionConflictError'; }
}

function assertStableSessionHistory(current: SessionEnvelope, next: SessionEnvelope): void {
  if (current.sessionId !== next.sessionId || current.wheelId !== next.wheelId || current.engineVersion !== next.engineVersion || current.createdAt !== next.createdAt) {
    throw new SessionConflictError('Session identity and creation metadata are immutable');
  }
  if (next.configRevisions.length < current.configRevisions.length || current.configRevisions.some((revision, index) => JSON.stringify(revision) !== JSON.stringify(next.configRevisions[index]))) {
    throw new SessionConflictError('Existing wheel revisions are immutable');
  }
  if (next.rounds.length < current.rounds.length || current.rounds.some((round, index) => JSON.stringify(round) !== JSON.stringify(next.rounds[index]))) {
    throw new SessionConflictError('Existing rounds are immutable');
  }
  if (next.cycle.number < current.cycle.number) throw new SessionConflictError('Cycle number cannot move backwards');
}

function assertResultsOnlyAppend(current: SessionEnvelope, next: SessionEnvelope): void {
  const appended = next.results.at(-1);
  if (next.currentRevisionId !== current.currentRevisionId || next.results.length !== current.results.length + 1 || current.results.some((result, index) => JSON.stringify(result) !== JSON.stringify(next.results[index])) || appended?.roundId !== current.rounds.at(-1)?.id || appended?.configRevisionId !== current.currentRevisionId) {
    throw new SessionConflictError('A committed spin must append exactly one result to the current revision');
  }
}

function assertSafeSessionUpdate(current: SessionEnvelope, next: SessionEnvelope): void {
  const beforeGame = current.game;
  const afterGame = next.game;
  if (JSON.stringify(beforeGame) !== JSON.stringify(afterGame)) {
    if (!beforeGame || !afterGame) throw new SessionConflictError('Game state cannot be removed by a session update');
    const stable = (game: NonNullable<SessionEnvelope['game']>) => ({
      packId: game.packId,
      packVersion: game.packVersion,
      locale: game.locale,
      usedCardIds: game.usedCardIds,
      nextTurnIndex: game.nextTurnIndex,
      packSnapshot: game.packSnapshot,
    });
    if (JSON.stringify(stable(beforeGame)) !== JSON.stringify(stable(afterGame))) throw new SessionConflictError('Game pack, used cards and turn order are immutable during a session update');
    const sameActive = beforeGame.activeResultId === afterGame.activeResultId;
    const pause = afterGame.phase === 'paused' && afterGame.resumePhase === (beforeGame.phase === 'ready' || beforeGame.phase === 'selecting-player' ? 'ready' : 'awaiting-complete-or-skip') && sameActive;
    const resume = beforeGame.phase === 'paused' && afterGame.phase === beforeGame.resumePhase && afterGame.resumePhase === null && sameActive;
    const reveal = beforeGame.phase === 'revealing-card' && afterGame.phase === 'awaiting-complete-or-skip' && sameActive;
    const resolve = beforeGame.phase === 'awaiting-complete-or-skip' && (afterGame.phase === 'ready' || afterGame.phase === 'exhausted') && afterGame.activeResultId === null && afterGame.resumePhase === null;
    const end = (beforeGame.phase === 'ready' || beforeGame.phase === 'exhausted') && afterGame.phase === 'ended' && afterGame.activeResultId === null && afterGame.resumePhase === null;
    if (!pause && !resume && !reveal && !resolve && !end) throw new SessionConflictError('Invalid game state transition');
    if (resolve && current.results.at(-1)?.id !== beforeGame.activeResultId) throw new SessionConflictError('Only the latest active card can be resolved');
  }
  const order = { pending: 0, revealed: 1, acknowledged: 2 } as const;
  if (next.results.length !== current.results.length) throw new SessionConflictError('Session updates cannot add or remove committed results');
  for (const [index, before] of current.results.entries()) {
    const after = next.results[index]!;
    const beforeData = { ...before, presentation: undefined, ...(before.kind === 'card' ? { status: undefined } : {}) };
    const afterData = { ...after, presentation: undefined, ...(after.kind === 'card' ? { status: undefined } : {}) };
    if (JSON.stringify(beforeData) !== JSON.stringify(afterData) || order[after.presentation] < order[before.presentation] || order[after.presentation] > order[before.presentation] + 1) {
      throw new SessionConflictError('Committed result data is immutable and presentation cannot move backwards');
    }
    if (before.kind === 'card' && after.kind === 'card' && before.status !== after.status) {
      const resolvingActiveCard = before.status === 'pending' && (after.status === 'completed' || after.status === 'skipped') && beforeGame?.phase === 'awaiting-complete-or-skip' && beforeGame.activeResultId === before.id && afterGame?.activeResultId === null && (afterGame.phase === 'ready' || afterGame.phase === 'exhausted');
      if (!resolvingActiveCard) throw new SessionConflictError('Only the active pending game card can be completed or skipped');
    }
  }
}

async function getLeaseInTransaction(store: IDBObjectStore, wheelId: string): Promise<WriterLease | undefined> {
  return requestValue(store.get(wheelId) as IDBRequest<WriterLease | undefined>);
}

/** Acquires or re-acquires an expired IndexedDB lease; Web Locks may be layered on top. */
export async function acquireWriterLease(wheelId: string, ownerId: string, now = Date.now(), durationMs = 10_000, exclusiveLockHeld = false): Promise<boolean> {
  if (!wheelId || !ownerId || !Number.isFinite(now) || durationMs < 1_000 || durationMs > 60_000) throw new RangeError('Invalid writer lease arguments');
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction('leases', 'readwrite');
    done = transactionDone(transaction);
    const store = transaction.objectStore('leases');
    const existing = await getLeaseInTransaction(store, wheelId);
    if (existing && existing.ownerId !== ownerId && existing.expiresAt > now && !exclusiveLockHeld) {
      await done;
      return false;
    }
    store.put({ wheelId, ownerId, expiresAt: now + durationMs, revision: (existing?.revision ?? 0) + 1 } satisfies WriterLease);
    await done;
    return true;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export async function renewWriterLease(wheelId: string, ownerId: string, now = Date.now(), durationMs = 10_000): Promise<boolean> {
  if (!wheelId || !ownerId || !Number.isFinite(now) || durationMs < 1_000 || durationMs > 60_000) throw new RangeError('Invalid writer lease arguments');
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction('leases', 'readwrite');
    done = transactionDone(transaction);
    const store = transaction.objectStore('leases');
    const existing = await getLeaseInTransaction(store, wheelId);
    if (!existing || existing.ownerId !== ownerId || existing.expiresAt <= now) {
      await done;
      return false;
    }
    store.put({ ...existing, expiresAt: now + durationMs, revision: existing.revision + 1 });
    await done;
    return true;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export async function releaseWriterLease(wheelId: string, ownerId: string): Promise<void> {
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction('leases', 'readwrite');
    done = transactionDone(transaction);
    const store = transaction.objectStore('leases');
    const existing = await getLeaseInTransaction(store, wheelId);
    if (existing?.ownerId === ownerId) store.delete(wheelId);
    await done;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export async function loadSession(sessionId: string): Promise<StoredSession | null> {
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction('sessions', 'readonly');
    done = transactionDone(transaction);
    const record = await requestValue(transaction.objectStore('sessions').get(sessionId) as IDBRequest<StoredSession | undefined>);
    await done;
    if (!record) return null;
    const validation = validateSessionEnvelope(record.envelope);
    if (!validation.ok) throw new Error(`Stored session failed validation: ${validation.error}`);
    return record;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export async function listSessions(): Promise<StoredSession[]> {
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction('sessions', 'readonly');
    done = transactionDone(transaction);
    const records = await requestValue(transaction.objectStore('sessions').getAll() as IDBRequest<StoredSession[]>);
    await done;
    for (const record of records) {
      const validation = validateSessionEnvelope(record.envelope);
      if (!validation.ok) throw new Error(`Stored session ${record.sessionId} failed validation: ${validation.error}`);
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export async function saveInitialSession(envelope: SessionEnvelope): Promise<void> {
  const validation = validateSessionEnvelope(envelope);
  if (!validation.ok) throw new TypeError(`Invalid session: ${validation.error}${validation.detail ? ` (${validation.detail})` : ''}`);
  envelope = validation.value;
  const database = await openDatabase();
  try {
    const transaction = database.transaction('sessions', 'readwrite');
    transaction.objectStore('sessions').add({ sessionId: envelope.sessionId, envelope, revision: 1, updatedAt: new Date().toISOString() } satisfies StoredSession);
    await transactionDone(transaction);
  } finally { database.close(); }
}

/** Atomically records the selected outcome before animation; retries with the same result ID are idempotent. */
export async function commitSelectionResult(envelope: SessionEnvelope, ownerId: string, expectedRevision: number, now = Date.now()): Promise<number> {
  const validation = validateSessionEnvelope(envelope);
  if (!validation.ok) throw new TypeError(`Invalid session: ${validation.error}${validation.detail ? ` (${validation.detail})` : ''}`);
  envelope = validation.value;
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction(['sessions', 'leases'], 'readwrite');
    done = transactionDone(transaction);
    const sessions = transaction.objectStore('sessions');
    const leases = transaction.objectStore('leases');
    const [lease, current] = await Promise.all([
      getLeaseInTransaction(leases, envelope.wheelId),
      requestValue(sessions.get(envelope.sessionId) as IDBRequest<StoredSession | undefined>),
    ]);
    if (!lease || lease.ownerId !== ownerId || lease.expiresAt <= now) throw new SessionConflictError('Writer lease is missing or expired');
    const candidate = envelope.results.at(-1);
    if (!candidate) throw new SessionConflictError('No committed result was supplied');
    const alreadyCommitted = current?.envelope.results.find((result) => result.id === candidate.id);
    if (alreadyCommitted) {
      if (JSON.stringify(alreadyCommitted) !== JSON.stringify(candidate)) throw new SessionConflictError('Result ID was reused with different data');
      await done;
      return current!.revision;
    }
    if ((current?.revision ?? 0) !== expectedRevision) throw new SessionConflictError('Session revision changed in another tab');
    const oldResults = current?.envelope.results ?? [];
    if (current) {
      assertStableSessionHistory(current.envelope, envelope);
      assertResultsOnlyAppend(current.envelope, envelope);
    } else if (expectedRevision !== 0 || envelope.results.length !== 1) {
      throw new SessionConflictError('A new session must start with exactly one committed result');
    }
    const revision = expectedRevision + 1;
    sessions.put({ sessionId: envelope.sessionId, envelope, revision, updatedAt: new Date(now).toISOString() } satisfies StoredSession);
    await done;
    return revision;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

/** Persists reveal/acknowledgement and other session-state transitions with lease and revision CAS. */
export async function updateSession(envelope: SessionEnvelope, ownerId: string, expectedRevision: number, now = Date.now()): Promise<number> {
  const validation = validateSessionEnvelope(envelope);
  if (!validation.ok) throw new TypeError(`Invalid session: ${validation.error}${validation.detail ? ` (${validation.detail})` : ''}`);
  envelope = validation.value;
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction(['sessions', 'leases'], 'readwrite');
    done = transactionDone(transaction);
    const sessions = transaction.objectStore('sessions');
    const [lease, current] = await Promise.all([
      getLeaseInTransaction(transaction.objectStore('leases'), envelope.wheelId),
      requestValue(sessions.get(envelope.sessionId) as IDBRequest<StoredSession | undefined>),
    ]);
    if (!lease || lease.ownerId !== ownerId || lease.expiresAt <= now || !current || current.revision !== expectedRevision) throw new SessionConflictError('Session lease or revision changed');
    assertStableSessionHistory(current.envelope, envelope);
    assertSafeSessionUpdate(current.envelope, envelope);
    const revision = expectedRevision + 1;
    sessions.put({ sessionId: envelope.sessionId, envelope, revision, updatedAt: new Date(now).toISOString() } satisfies StoredSession);
    await done;
    return revision;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export function exportSessionJSON(envelope: SessionEnvelope): string {
  const validation = validateSessionEnvelope(envelope);
  if (!validation.ok) throw new TypeError(`Invalid session: ${validation.error}${validation.detail ? ` (${validation.detail})` : ''}`);
  return `${JSON.stringify(validation.value, null, 2)}\n`;
}

function newOpaqueId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/** Makes an independent copy with every session-owned identity remapped. */
export function remapImportedSession(source: SessionEnvelope): SessionEnvelope {
  const value = structuredClone(source);
  const sessionId = newOpaqueId();
  const wheelId = newOpaqueId();
  const revisionMap = new Map(value.configRevisions.map((revision) => [revision.id, newOpaqueId()]));
  const roundMap = new Map(value.rounds.map((round) => [round.id, newOpaqueId()]));
  const resultMap = new Map(value.results.map((result) => [result.id, newOpaqueId()]));
  const entryMap = new Map<string, string>();
  for (const revision of value.configRevisions) for (const entry of revision.wheel.entries) if (!entryMap.has(entry.id)) entryMap.set(entry.id, newOpaqueId());
  for (const revision of value.configRevisions) {
    revision.id = revisionMap.get(revision.id)!;
    for (const entry of revision.wheel.entries) entry.id = entryMap.get(entry.id)!;
    if (revision.wheel.seats) revision.wheel.seats = revision.wheel.seats.map((id) => entryMap.get(id)!);
  }
  value.sessionId = sessionId;
  value.wheelId = wheelId;
  value.currentRevisionId = revisionMap.get(value.currentRevisionId)!;
  for (const round of value.rounds) round.id = roundMap.get(round.id)!;
  value.cycle.remainingEntryIds = value.cycle.remainingEntryIds.map((id) => entryMap.get(id)!);
  value.cycle.excludedEntryIds = value.cycle.excludedEntryIds.map((id) => entryMap.get(id)!);
  for (const result of value.results) {
    result.id = resultMap.get(result.id)!;
    result.roundId = roundMap.get(result.roundId)!;
    result.configRevisionId = revisionMap.get(result.configRevisionId)!;
    if ('entryId' in result) result.entryId = entryMap.get(result.entryId)!;
    if (result.kind === 'teams') result.teams = result.teams.map((team) => team.map((id) => entryMap.get(id)!));
  }
  if (value.game?.activeResultId) value.game.activeResultId = resultMap.get(value.game.activeResultId)!;
  return value;
}

export async function importSessionJSON(json: string, options: { mode: 'copy' } | { mode: 'replace'; confirmReplace: true }): Promise<SessionEnvelope> {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new TypeError('Import is not valid JSON'); }
  const validation = validateSessionEnvelope(parsed);
  if (!validation.ok) throw new TypeError(`Import rejected: ${validation.error}${validation.detail ? ` (${validation.detail})` : ''}`);
  const normalized = validation.value;
  const envelope = options.mode === 'copy' ? remapImportedSession(normalized) : normalized;
  const remappedValidation = validateSessionEnvelope(envelope);
  if (!remappedValidation.ok) throw new TypeError(`Import remapping failed: ${remappedValidation.error}`);
  const database = await openDatabase();
  let done: Promise<void> | undefined;
  try {
    const transaction = database.transaction('sessions', 'readwrite');
    done = transactionDone(transaction);
    const store = transaction.objectStore('sessions');
    const existing = await requestValue(store.get(envelope.sessionId) as IDBRequest<StoredSession | undefined>);
    if (existing && options.mode !== 'replace') throw new SessionConflictError('Session ID already exists');
    if (options.mode === 'replace' && !options.confirmReplace) throw new SessionConflictError('Replacing an existing session requires explicit confirmation');
    store.put({ sessionId: remappedValidation.value.sessionId, envelope: remappedValidation.value, revision: (existing?.revision ?? 0) + 1, updatedAt: new Date().toISOString() } satisfies StoredSession);
    await done;
    return remappedValidation.value;
  } catch (error) {
    await done?.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}
