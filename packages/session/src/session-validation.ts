import validateSessionSchema from './generated/session-schema-validator.js';
import type { SessionEnvelope } from '@lavbe/contracts';
import { validateWheelSemantics } from '@lavbe/selection';

export type SessionValidationError =
  | 'INVALID_SCHEMA'
  | 'INVALID_WHEEL'
  | 'DUPLICATE_ID'
  | 'MISSING_CURRENT_REVISION'
  | 'MISSING_REFERENCE'
  | 'INVALID_SEQUENCE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_RESULT_KIND'
  | 'INVALID_RESULT_MEMBER'
  | 'INVALID_CYCLE'
  | 'INVALID_GAME_STATE';

export type SessionValidation = { ok: true; value: SessionEnvelope } | { ok: false; error: SessionValidationError; detail?: string };

function fail(error: SessionValidationError, detail?: string): SessionValidation {
  return { ok: false, error, ...(detail ? { detail } : {}) };
}

function idsAreUnique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function isUtc(value: string): boolean {
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?Z$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const stamp = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
  return stamp.getUTCFullYear() === year && stamp.getUTCMonth() === month! - 1 && stamp.getUTCDate() === day && stamp.getUTCHours() === hour && stamp.getUTCMinutes() === minute && stamp.getUTCSeconds() === second;
}

/** Validates the full JSON Schema and then cross-record invariants the schema cannot express. */
export function validateSessionEnvelope(input: unknown): SessionValidation {
  if (!validateSessionSchema(input)) return fail('INVALID_SCHEMA');
  const envelope = normalizeSessionForStorage(input as unknown as SessionEnvelope);
  if (!validateSessionSchema(envelope)) return fail('INVALID_SCHEMA');
  const revisionIds = envelope.configRevisions.map((item) => item.id);
  const roundIds = envelope.rounds.map((item) => item.id);
  const resultIds = envelope.results.map((item) => item.id);
  if (!idsAreUnique(revisionIds) || !idsAreUnique(roundIds) || !idsAreUnique(resultIds)) return fail('DUPLICATE_ID');
  if (!revisionIds.includes(envelope.currentRevisionId)) return fail('MISSING_CURRENT_REVISION');

  const revisions = new Map(envelope.configRevisions.map((item) => [item.id, item.wheel]));
  const rounds = new Set(roundIds);
  for (const { wheel } of envelope.configRevisions) {
    if (validateWheelSemantics(wheel) !== 'OK') return fail('INVALID_WHEEL');
  }
  if (!isUtc(envelope.createdAt) || envelope.rounds.some((round) => !isUtc(round.startedAt))) return fail('INVALID_TIMESTAMP');
  let roundTimestamp = -Infinity;
  for (const round of envelope.rounds) {
    const at = Date.parse(round.startedAt);
    if (at < roundTimestamp || at < Date.parse(envelope.createdAt)) return fail('INVALID_TIMESTAMP');
    roundTimestamp = at;
  }

  let sequence = 0;
  let committedAt = -Infinity;
  for (const result of envelope.results) {
    const wheel = revisions.get(result.configRevisionId);
    if (!wheel || !rounds.has(result.roundId)) return fail('MISSING_REFERENCE');
    if (result.sequence <= sequence || Date.parse(result.committedAt) < committedAt) return fail('INVALID_SEQUENCE');
    sequence = result.sequence;
    committedAt = Date.parse(result.committedAt);
    if (!isUtc(result.committedAt)) return fail('INVALID_TIMESTAMP');
    const round = envelope.rounds.find((item) => item.id === result.roundId)!;
    if (committedAt < Date.parse(round.startedAt)) return fail('INVALID_TIMESTAMP');
    const active = wheel.entries.filter((entry) => entry.active);
    const entries = new Map(active.map((entry) => [entry.id, entry]));
    const expectedKind = wheel.tool === 'numbers' ? 'number' : wheel.tool === 'teams' ? 'teams' : wheel.tool === 'game' ? 'card' : 'entry';
    if (result.kind !== expectedKind) return fail('INVALID_RESULT_KIND');
    if (result.kind === 'entry' || result.kind === 'card') {
      const entry = entries.get(result.entryId);
      if (!entry || entry.label !== result.label) return fail('INVALID_RESULT_MEMBER');
    } else if (result.kind === 'number') {
      if (!wheel.range || result.value < wheel.range.min || result.value > wheel.range.max) return fail('INVALID_RESULT_MEMBER');
    } else {
      const members = result.teams.flat();
      if (!wheel.teamCount || result.teams.length !== wheel.teamCount || !idsAreUnique(members) || members.length !== active.length || members.some((id) => !entries.has(id))) return fail('INVALID_RESULT_MEMBER');
      const sizes = result.teams.map((team) => team.length);
      if (Math.max(...sizes) - Math.min(...sizes) > 1) return fail('INVALID_RESULT_MEMBER');
    }
  }
  const unresolved = envelope.results.filter((result) => result.presentation !== 'acknowledged');
  if (unresolved.length > 1 || unresolved.length === 1 && envelope.results.at(-1)?.id !== unresolved[0]!.id) return fail('INVALID_SEQUENCE');

  const currentWheel = revisions.get(envelope.currentRevisionId)!;
  const activeIds = currentWheel.entries.filter((entry) => entry.active).map((entry) => entry.id);
  const remaining = envelope.cycle.remainingEntryIds;
  const excluded = envelope.cycle.excludedEntryIds;
  const cycleIds = [...remaining, ...excluded];
  if (!idsAreUnique(cycleIds) || cycleIds.some((id) => !activeIds.includes(id))) return fail('INVALID_CYCLE');
  if (currentWheel.mode === 'independent' && (excluded.length || remaining.length !== activeIds.length || remaining.some((id) => !activeIds.includes(id)))) return fail('INVALID_CYCLE');
  if (currentWheel.mode === 'remove-winner' && (cycleIds.length !== activeIds.length || activeIds.some((id) => !cycleIds.includes(id)))) return fail('INVALID_CYCLE');
  if (currentWheel.mode === 'shuffled-cycle' && (excluded.length || remaining.some((id) => !activeIds.includes(id)))) return fail('INVALID_CYCLE');

  if (envelope.game) {
    const game = envelope.game;
    if (currentWheel.tool !== 'game' || currentWheel.game?.packId !== game.packId || currentWheel.game.packVersion !== game.packVersion || game.packSnapshot.id !== game.packId || game.packSnapshot.version !== game.packVersion || game.packSnapshot.locale !== game.locale) return fail('INVALID_GAME_STATE');
    const cardIds = new Set(game.packSnapshot.cards.map((card) => card.id));
    if (!idsAreUnique(game.usedCardIds) || game.usedCardIds.some((id) => !cardIds.has(id))) return fail('INVALID_GAME_STATE');
    const cards = new Map(game.packSnapshot.cards.map((card) => [card.id, card]));
    const cardResults = envelope.results.filter((result) => result.kind === 'card');
    if (game.packSnapshot.review.reviewedAt && !isUtc(game.packSnapshot.review.reviewedAt)) return fail('INVALID_TIMESTAMP');
    if (!idsAreUnique(cardResults.map((result) => result.cardId)) || cardResults.length !== game.usedCardIds.length || cardResults.some((result, index) => result.cardId !== game.usedCardIds[index])) return fail('INVALID_GAME_STATE');
    for (const result of cardResults) {
      const card = cards.get(result.cardId);
      if (!card || card.text.normalize('NFC') !== result.text.normalize('NFC') || !game.usedCardIds.includes(result.cardId)) return fail('INVALID_GAME_STATE');
    }
    const activeResult = game.activeResultId && envelope.results.find((result) => result.id === game.activeResultId);
    if (game.activeResultId && (!activeResult || activeResult.kind !== 'card' || activeResult.cardId !== game.usedCardIds.at(-1) || activeResult.status !== 'pending')) return fail('INVALID_GAME_STATE');
    if (['awaiting-complete-or-skip', 'revealing-card'].includes(game.phase) && !game.activeResultId) return fail('INVALID_GAME_STATE');
    if (game.phase === 'paused' ? !game.resumePhase : game.resumePhase !== null) return fail('INVALID_GAME_STATE');
    const needsActiveResult = game.phase === 'revealing-card' || game.phase === 'awaiting-complete-or-skip' || game.phase === 'paused' && game.resumePhase === 'awaiting-complete-or-skip';
    if (needsActiveResult !== Boolean(game.activeResultId)) return fail('INVALID_GAME_STATE');
  }
  return { ok: true, value: envelope };
}

/** Creates a detached NFC-normalized session value before validation and persistence. */
export function normalizeSessionForStorage(session: SessionEnvelope): SessionEnvelope {
  const normalize = (value: unknown): unknown => {
    if (typeof value === 'string') return value.normalize('NFC');
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)]));
    return value;
  };
  return normalize(structuredClone(session)) as SessionEnvelope;
}

/** A committed result left pending/revealed by a crash is replayed as-is; callers must never reroll it. */
export function recoverUnacknowledgedResult(session: SessionEnvelope): SessionEnvelope['results'][number] | null {
  const validation = validateSessionEnvelope(session);
  if (!validation.ok) throw new TypeError(`Invalid session: ${validation.error}`);
  return validation.value.results.find((result) => result.presentation !== 'acknowledged') ?? null;
}
