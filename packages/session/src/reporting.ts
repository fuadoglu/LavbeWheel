import type { SessionEnvelope } from '@lavbe/contracts';

export interface RoundReportRow {
  entryId: string;
  label: string;
  inRoundCandidateSet: boolean;
  count: number;
  observedShare: number | null;
  nextChance: number | null;
  isCurrentCandidate: boolean;
  lastCommittedAt: string | null;
}

export interface RoundReportEvent {
  resultId: string;
  sequence: number;
  entryId: string;
  label: string;
  committedAt: string;
  presentation: SessionEnvelope['results'][number]['presentation'];
}

export interface RoundReport {
  roundId: string;
  startedAt: string;
  reason: string;
  mode: string;
  resultCount: number;
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

/** Build reports from immutable result revisions and current selection state. */
export function buildRoundReports(session: SessionEnvelope): RoundReport[] {
  const revisions = new Map(session.configRevisions.map((revision) => [revision.id, revision.wheel]));
  const resultsByRound = new Map<string, SessionEnvelope['results']>();
  for (const result of session.results) {
    const roundResults = resultsByRound.get(result.roundId) ?? [];
    roundResults.push(result);
    resultsByRound.set(result.roundId, roundResults);
  }
  return session.rounds.map((round) => {
    const results = resultsByRound.get(round.id) ?? [];
    const entryResults = results.filter((result): result is Extract<SessionEnvelope['results'][number], { kind: 'entry' }> => result.kind === 'entry');
    const currentWheel = revisions.get(session.currentRevisionId);
    const revision = results[0] ? revisions.get(results[0].configRevisionId) : round.id === session.rounds.at(-1)?.id ? currentWheel : undefined;
    const wheel = revision && !['numbers', 'teams', 'game'].includes(revision.tool) ? revision : undefined;
    const candidates = new Map((wheel?.entries ?? []).map((entry) => [entry.id, entry]));
    const counts = new Map<string, number>();
    const lastCommittedAt = new Map<string, string>();
    for (const result of entryResults) {
      counts.set(result.entryId, (counts.get(result.entryId) ?? 0) + 1);
      lastCommittedAt.set(result.entryId, result.committedAt);
    }
    const currentIds = new Set(currentWheel?.entries.filter((entry) => entry.active).map((entry) => entry.id) ?? []);
    const rows = [...candidates.values()].filter((entry) => entry.active).map((entry) => ({
      entryId: entry.id,
      label: entry.label,
      inRoundCandidateSet: true,
      count: counts.get(entry.id) ?? 0,
      isCurrentCandidate: currentIds.has(entry.id),
      lastCommittedAt: lastCommittedAt.get(entry.id) ?? null,
    }));
    // Preserve outcomes even when the winner was later removed from the wheel.
    for (const result of entryResults) {
      if (candidates.has(result.entryId)) continue;
      rows.push({ entryId: result.entryId, label: result.label, inRoundCandidateSet: false, count: counts.get(result.entryId) ?? 0, isCurrentCandidate: false, lastCommittedAt: lastCommittedAt.get(result.entryId) ?? null });
    }
    const total = entryResults.length;
    const activeCurrent = currentWheel?.entries.filter((entry) => entry.active) ?? [];
    const weightedPool = activeCurrent.reduce((sum, entry) => sum + entry.weight, 0);
    const remaining = session.cycle.remainingEntryIds;
    return {
      roundId: round.id,
      startedAt: round.startedAt,
      reason: round.reason,
      mode: wheel?.mode ?? 'unknown',
      resultCount: results.length,
      distinctSelectedCount: counts.size,
      events: [...entryResults].reverse().map((result) => ({ resultId: result.id, sequence: result.sequence, entryId: result.entryId, label: result.label, committedAt: result.committedAt, presentation: result.presentation })),
      rows: rows.map((row) => ({
        ...row,
        observedShare: total ? row.count / total : null,
        nextChance: !row.isCurrentCandidate || !activeCurrent.length || !currentWheel
          ? null
          : currentWheel.mode === 'remove-winner'
            ? (remaining.length ? remaining.includes(row.entryId) ? 1 / remaining.length : 0 : 1 / activeCurrent.length)
            : currentWheel.mode === 'shuffled-cycle'
              ? (remaining.length ? row.entryId === remaining[0] ? 1 : 0 : 1 / activeCurrent.length)
              : (activeCurrent.find((entry) => entry.id === row.entryId)?.weight ?? 0) / weightedPool,
      })),
    };
  });
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Export one round as UTF-8 CSV with spreadsheet formula injection protection. */
export function exportRoundReportCsv(report: RoundReport): string {
  const rowsById = new Map(report.rows.map((row) => [row.entryId, row]));
  const rows: (string | number)[][] = [
    ['record_type', 'round_id', 'round_started_at_utc', 'round_reason', 'mode', 'result_count', 'distinct_selected_count', 'sequence', 'result_id', 'committed_at_utc', 'presentation', 'entry_id', 'label', 'in_round_candidate_set', 'is_current_candidate', 'count', 'observed_share', 'next_chance'],
    ...report.events.map((event) => {
      const row = rowsById.get(event.entryId)!;
      return ['selection', report.roundId, report.startedAt, report.reason, report.mode, report.resultCount, report.distinctSelectedCount, event.sequence, event.resultId, event.committedAt, event.presentation, event.entryId, event.label, row.inRoundCandidateSet ? 'true' : 'false', row.isCurrentCandidate ? 'true' : 'false', row.count, row.observedShare ?? '', row.nextChance ?? ''];
    }),
    ...report.rows.filter((row) => !row.count).map((row) => ['participant-summary', report.roundId, report.startedAt, report.reason, report.mode, report.resultCount, report.distinctSelectedCount, '', '', '', '', row.entryId, row.label, row.inRoundCandidateSet ? 'true' : 'false', row.isCurrentCandidate ? 'true' : 'false', 0, row.observedShare ?? '', row.nextChance ?? '']),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
