import type { SessionEnvelope } from '@lavbe/contracts';

export type ReportRowKind = 'entry' | 'number' | 'team-member' | 'card';

export interface RoundReportRow {
  key: string;
  kind: ReportRowKind;
  entryId: string | null;
  cardId: string | null;
  value: number | null;
  label: string;
  text: string | null;
  inRoundCandidateSet: boolean;
  count: number;
  observedShare: number | null;
  nextChance: number | null;
  isCurrentCandidate: boolean;
}

export interface RoundReportEvent {
  resultId: string;
  sequence: number;
  kind: SessionEnvelope['results'][number]['kind'];
  entryId: string | null;
  cardId: string | null;
  value: number | null;
  label: string;
  text: string | null;
  teams: string[][] | null;
  status: 'pending' | 'completed' | 'skipped' | null;
  committedAt: string;
  presentation: SessionEnvelope['results'][number]['presentation'];
}

export interface ReportRoundSummary {
  roundId: string;
  startedAt: string;
  reason: string;
  tool: string;
  mode: string;
  resultCount: number;
}

export interface RoundReport extends ReportRoundSummary {
  distinctSelectedCount: number;
  rows: RoundReportRow[];
  events: RoundReportEvent[];
}

export interface ReportPage<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function paginateReportRows<T>(items: readonly T[], requestedPage: number, pageSize = 50): ReportPage<T> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive safe integer');
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0));
  return { items: items.slice(page * pageSize, (page + 1) * pageSize), page, pageCount, total: items.length };
}

/** Small round index for the selector; it never materializes any report rows. */
export function listReportRounds(session: SessionEnvelope): ReportRoundSummary[] {
  const byRound = new Map<string, SessionEnvelope['results']>();
  for (const result of session.results) {
    const rows = byRound.get(result.roundId) ?? [];
    rows.push(result);
    byRound.set(result.roundId, rows);
  }
  return session.rounds.map((round) => {
    const results = byRound.get(round.id) ?? [];
    const revisionId = results[0]?.configRevisionId ?? (session.rounds.at(-1)?.id === round.id ? session.currentRevisionId : undefined);
    const wheel = revisionId ? session.configRevisions.find((revision) => revision.id === revisionId)?.wheel : undefined;
    return {
      roundId: round.id,
      startedAt: round.startedAt,
      reason: round.reason,
      tool: wheel?.tool ?? 'unknown',
      mode: wheel?.mode ?? 'unknown',
      resultCount: results.length,
    };
  });
}

/** Build just one selected round to bound memory for large number ranges and histories. */
export function buildRoundReport(session: SessionEnvelope, roundId: string): RoundReport | null {
  const round = session.rounds.find((item) => item.id === roundId);
  if (!round) return null;
  const results = session.results.filter((result) => result.roundId === roundId);
  const currentWheel = session.configRevisions.find((item) => item.id === session.currentRevisionId)?.wheel;
  const revision = results[0]
    ? session.configRevisions.find((item) => item.id === results[0]!.configRevisionId)?.wheel
    : round.id === session.rounds.at(-1)?.id ? currentWheel : undefined;
  const wheel = revision;
  const summary: ReportRoundSummary = {
    roundId: round.id,
    startedAt: round.startedAt,
    reason: round.reason,
    tool: wheel?.tool ?? 'unknown',
    mode: wheel?.mode ?? 'unknown',
    resultCount: results.length,
  };
  const entryResults = results.filter((result): result is Extract<SessionEnvelope['results'][number], { kind: 'entry' }> => result.kind === 'entry');
  const cardResults = results.filter((result): result is Extract<SessionEnvelope['results'][number], { kind: 'card' }> => result.kind === 'card');
  const numberResults = results.filter((result): result is Extract<SessionEnvelope['results'][number], { kind: 'number' }> => result.kind === 'number');
  const teamResults = results.filter((result): result is Extract<SessionEnvelope['results'][number], { kind: 'teams' }> => result.kind === 'teams');
  const counts = new Map<string, number>();
  for (const result of entryResults) {
    counts.set(result.entryId, (counts.get(result.entryId) ?? 0) + 1);
  }
  for (const result of cardResults) {
    counts.set(result.entryId, (counts.get(result.entryId) ?? 0) + 1);
  }
  for (const result of teamResults) for (const entryId of result.teams.flat()) counts.set(entryId, (counts.get(entryId) ?? 0) + 1);

  let rows: RoundReportRow[] = [];
  let distinctSelectedCount = 0;
  if (wheel?.tool === 'numbers' && wheel.range) {
    const numberCounts = new Map<number, number>();
    for (const result of numberResults) numberCounts.set(result.value, (numberCounts.get(result.value) ?? 0) + 1);
    const currentRange = currentWheel?.tool === 'numbers' ? currentWheel.range : undefined;
    const currentOutcomeCount = currentRange ? currentRange.max - currentRange.min + 1 : 0;
    for (let value = wheel.range.min; value <= wheel.range.max; value += 1) {
      const count = numberCounts.get(value) ?? 0;
      rows.push({
        key: `number:${value}`, kind: 'number', entryId: null, cardId: null, value, label: String(value), text: null,
        inRoundCandidateSet: true, count, isCurrentCandidate: Boolean(currentRange && value >= currentRange.min && value <= currentRange.max),
        observedShare: results.length ? count / results.length : null,
        nextChance: currentOutcomeCount && value >= currentRange!.min && value <= currentRange!.max ? 1 / currentOutcomeCount : null,
      });
    }
    distinctSelectedCount = numberCounts.size;
  } else if (wheel?.tool === 'teams') {
    const candidateEntries = wheel.entries.filter((entry) => entry.active);
    const currentIds = new Set(currentWheel?.entries.filter((entry) => entry.active).map((entry) => entry.id) ?? []);
    const totalAssignments = teamResults.reduce((sum, result) => sum + result.teams.flat().length, 0);
    rows = candidateEntries.map((entry) => ({
      key: `entry:${entry.id}`, kind: 'team-member', entryId: entry.id, cardId: null, value: null, label: entry.label, text: null,
      inRoundCandidateSet: true, count: counts.get(entry.id) ?? 0, isCurrentCandidate: currentIds.has(entry.id),
      observedShare: totalAssignments ? (counts.get(entry.id) ?? 0) / totalAssignments : null,
      nextChance: null,
    }));
    for (const [entryId, count] of counts) {
      if (candidateEntries.some((entry) => entry.id === entryId)) continue;
      rows.push({ key: `entry:${entryId}`, kind: 'team-member', entryId, cardId: null, value: null, label: entryId, text: null, inRoundCandidateSet: false, count, isCurrentCandidate: false, observedShare: totalAssignments ? count / totalAssignments : null, nextChance: null });
    }
    distinctSelectedCount = counts.size;
  } else if (wheel?.tool === 'game' && session.game) {
    const candidates = new Map(wheel.entries.filter((entry) => entry.active).map((entry) => [entry.id, entry]));
    rows = [...candidates.values()].map((entry) => ({
      key: `entry:${entry.id}`, kind: 'entry', entryId: entry.id, cardId: null, value: null, label: entry.label,
      text: null,
      inRoundCandidateSet: true, count: counts.get(entry.id) ?? 0,
      isCurrentCandidate: currentWheel?.entries.some((candidate) => candidate.id === entry.id && candidate.active) ?? false,
      observedShare: results.length ? (counts.get(entry.id) ?? 0) / results.length : null, nextChance: null,
    }));
    const cardCounts = new Map<string, number>();
    for (const result of cardResults) cardCounts.set(result.cardId, (cardCounts.get(result.cardId) ?? 0) + 1);
    const usedCards = new Set(session.game.usedCardIds);
    const remainingCards = session.game.packSnapshot.cards.filter((card) => !usedCards.has(card.id));
    for (const card of session.game.packSnapshot.cards) {
      const count = cardCounts.get(card.id) ?? 0;
      rows.push({ key: `card:${card.id}`, kind: 'card', entryId: null, cardId: card.id, value: null, label: card.text, text: card.text, inRoundCandidateSet: true, count, isCurrentCandidate: !usedCards.has(card.id), observedShare: results.length ? count / results.length : null, nextChance: !usedCards.has(card.id) && remainingCards.length ? 1 / remainingCards.length : usedCards.has(card.id) ? 0 : null });
    }
    distinctSelectedCount = counts.size;
  } else {
    const candidateEntries = wheel?.entries.filter((entry) => entry.active) ?? [];
    const currentEntries = currentWheel?.entries.filter((entry) => entry.active) ?? [];
    const currentIds = new Set(currentEntries.map((entry) => entry.id));
    rows = candidateEntries.map((entry) => ({
      key: `entry:${entry.id}`, kind: 'entry', entryId: entry.id, cardId: null, value: null, label: entry.label, text: null,
      inRoundCandidateSet: true, count: counts.get(entry.id) ?? 0, isCurrentCandidate: currentIds.has(entry.id),
      observedShare: results.length ? (counts.get(entry.id) ?? 0) / results.length : null,
      nextChance: !currentIds.has(entry.id) || !currentWheel || !currentEntries.length ? null
        : currentWheel.mode === 'remove-winner'
          ? session.cycle.remainingEntryIds.length ? session.cycle.remainingEntryIds.includes(entry.id) ? 1 / session.cycle.remainingEntryIds.length : 0 : 1 / currentEntries.length
          : currentWheel.mode === 'shuffled-cycle'
            ? session.cycle.remainingEntryIds.length ? entry.id === session.cycle.remainingEntryIds[0] ? 1 : 0 : 1 / currentEntries.length
            : (currentEntries.find((candidate) => candidate.id === entry.id)?.weight ?? 0) / currentEntries.reduce((sum, candidate) => sum + candidate.weight, 0),
    }));
    for (const result of entryResults) {
      if (candidateEntries.some((entry) => entry.id === result.entryId)) continue;
      rows.push({ key: `entry:${result.entryId}`, kind: 'entry', entryId: result.entryId, cardId: null, value: null, label: result.label, text: null, inRoundCandidateSet: false, count: counts.get(result.entryId) ?? 0, isCurrentCandidate: false, observedShare: results.length ? (counts.get(result.entryId) ?? 0) / results.length : null, nextChance: null });
    }
    distinctSelectedCount = counts.size;
  }

  const activeMemberLabels = new Map(wheel?.entries.map((entry) => [entry.id, entry.label]) ?? []);
  const events: RoundReportEvent[] = [...results].reverse().map((result) => {
    if (result.kind === 'entry') return { resultId: result.id, sequence: result.sequence, kind: result.kind, entryId: result.entryId, cardId: null, value: null, label: result.label, text: null, teams: null, status: null, committedAt: result.committedAt, presentation: result.presentation };
    if (result.kind === 'number') return { resultId: result.id, sequence: result.sequence, kind: result.kind, entryId: null, cardId: null, value: result.value, label: String(result.value), text: null, teams: null, status: null, committedAt: result.committedAt, presentation: result.presentation };
    if (result.kind === 'teams') return { resultId: result.id, sequence: result.sequence, kind: result.kind, entryId: null, cardId: null, value: null, label: '', text: null, teams: result.teams.map((team) => team.map((id) => activeMemberLabels.get(id) ?? id)), status: null, committedAt: result.committedAt, presentation: result.presentation };
    return { resultId: result.id, sequence: result.sequence, kind: result.kind, entryId: result.entryId, cardId: result.cardId, value: null, label: result.label, text: result.text, teams: null, status: result.status, committedAt: result.committedAt, presentation: result.presentation };
  });

  return { ...summary, distinctSelectedCount, rows, events };
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '""';
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Export event detail and aggregate rows as UTF-8 CSV with formula-injection protection. */
export function exportRoundReportCsv(report: RoundReport): string {
  const rowsByKey = new Map(report.rows.map((row) => [row.key, row]));
  const rows: (string | number | boolean | null)[][] = [
    ['record_type', 'round_id', 'round_started_at_utc', 'round_reason', 'tool', 'mode', 'result_count', 'distinct_selected_count', 'sequence', 'result_id', 'committed_at_utc', 'presentation', 'result_kind', 'entry_id', 'card_id', 'value', 'label', 'text', 'team_rosters', 'in_round_candidate_set', 'is_current_candidate', 'count', 'observed_share', 'next_chance'],
    ...report.events.map((event) => {
      const key = event.kind === 'number' ? `number:${event.value}` : event.kind === 'card' ? `card:${event.cardId}` : event.entryId ? `entry:${event.entryId}` : null;
      const aggregate = key ? rowsByKey.get(key) : undefined;
      return ['selection', report.roundId, report.startedAt, report.reason, report.tool, report.mode, report.resultCount, report.distinctSelectedCount, event.sequence, event.resultId, event.committedAt, event.presentation, event.kind, event.entryId, event.cardId, event.value, event.label, event.text, event.teams?.map((team, index) => `Team ${index + 1}: ${team.join(' / ')}`).join(' | ') ?? null, aggregate?.inRoundCandidateSet ?? null, aggregate?.isCurrentCandidate ?? null, aggregate?.count ?? null, aggregate?.observedShare ?? null, aggregate?.nextChance ?? null];
    }),
    ...report.rows.filter((row) => row.count === 0).map((row) => ['outcome-summary', report.roundId, report.startedAt, report.reason, report.tool, report.mode, report.resultCount, report.distinctSelectedCount, null, null, null, null, row.kind, row.entryId, row.cardId, row.value, row.label, row.text, null, row.inRoundCandidateSet, row.isCurrentCandidate, row.count, row.observedShare, row.nextChance]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
