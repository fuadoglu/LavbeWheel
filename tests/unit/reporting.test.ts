import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildRoundReport, exportRoundReportCsv, listReportRounds, paginateReportRows, type SessionEnvelope } from '@lavbe/session';

const fixture = JSON.parse(await readFile(fileURLToPath(new URL('../../contracts/examples/session-names.json', import.meta.url)), 'utf8')) as SessionEnvelope;

test('round report keeps immutable outcomes, active candidates and separates observed share from next chance', () => {
  const session = structuredClone(fixture);
  const oldRound = session.rounds[0]!;
  session.results.push({ ...session.results[0]!, id: 'spin_demo002', sequence: 2, entryId: 'entry_aysel', label: 'Aysel', committedAt: '2026-11-14T09:00:20Z' });
  const nextRoundId = 'round_demo02';
  session.rounds.push({ id: nextRoundId, startedAt: '2026-11-14T09:01:00Z', reason: 'manual-config-change' });
  const nextRevision = structuredClone(session.configRevisions[0]!);
  nextRevision.id = 'revision_0002';
  nextRevision.wheel.entries = nextRevision.wheel.entries.filter((entry) => entry.id !== 'entry_aysel');
  session.configRevisions.push(nextRevision);
  session.currentRevisionId = nextRevision.id;
  session.results.push({
    id: 'spin_demo003', roundId: nextRoundId, configRevisionId: nextRevision.id, sequence: 3,
    committedAt: '2026-11-14T09:01:10Z', presentation: 'acknowledged', kind: 'entry', entryId: 'entry_murad', label: 'Murad',
  });

  const reports = listReportRounds(session);
  const oldReport = buildRoundReport(session, oldRound.id)!;
  const newReport = buildRoundReport(session, nextRoundId)!;
  assert.equal(reports.length, 2);
  assert.equal(reports[0]!.roundId, oldRound.id);
  assert.equal(oldReport.resultCount, 2);
  assert.equal(oldReport.distinctSelectedCount, 1);
  assert.deepEqual(oldReport.events.map((event) => event.sequence), [2, 1], 'history is newest first');
  assert.equal(oldReport.rows.find((row) => row.entryId === 'entry_aysel')?.count, 2, 'removing a winner later does not erase its prior round counts');
  assert.equal(newReport.rows.find((row) => row.entryId === 'entry_aysel'), undefined);
  assert.equal(newReport.rows.find((row) => row.entryId === 'entry_murad')?.observedShare, 1);
});

test('CSV quotes fields and neutralizes formulas', () => {
  const session = structuredClone(fixture);
  const formulaLabel = '=HYPERLINK("https://bad","Aysel" )';
  session.configRevisions[0]!.wheel.entries[0]!.label = formulaLabel;
  session.results[0] = { ...session.results[0]!, label: formulaLabel } as typeof session.results[number];
  const report = buildRoundReport(session, session.rounds[0]!.id)!;
  const winner = report.rows.find((row) => row.entryId === 'entry_aysel')!;
  assert.equal(winner.label, formulaLabel);
  const csv = exportRoundReportCsv(report);
  assert.match(csv, /^\uFEFF"record_type","round_id"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad"",""Aysel"" \)"/);
  assert.match(csv, /committed_at_utc/);
  assert.match(csv, /2026-11-14T09:00:10Z/);
  assert.match(csv, /spin_demo001/);
  assert.match(csv, /\r\n/);
});

test('next chance reflects current no-repeat cycle state and empty rounds do not guess their old candidates', () => {
  const session = structuredClone(fixture);
  const wheel = session.configRevisions[0]!.wheel;
  wheel.mode = 'remove-winner';
  session.cycle.remainingEntryIds = ['entry_murad', 'entry_leyla'];
  session.cycle.excludedEntryIds = ['entry_aysel'];
  const report = buildRoundReport(session, session.rounds[0]!.id)!;
  assert.equal(report.rows.find((row) => row.entryId === 'entry_murad')?.nextChance, .5);
  assert.equal(report.rows.find((row) => row.entryId === 'entry_aysel')?.nextChance, 0);

  session.rounds.push({ id: 'round_empty02', startedAt: '2026-11-14T10:00:00Z', reason: 'manual-config-change' });
  session.rounds.push({ id: 'round_empty03', startedAt: '2026-11-14T11:00:00Z', reason: 'manual-config-change' });
  const empty = buildRoundReport(session, session.rounds[1]!.id)!;
  assert.equal(empty.resultCount, 0);
  assert.equal(empty.rows.length, 0, 'empty rounds have no referenced config revision, so historical candidates are unknown');
  assert.equal(buildRoundReport(session, session.rounds[2]!.id)!.rows.length, 3, 'the empty active round shows zero-count current candidates');
});

test('report pagination is bounded to 50 rows and clamps stale pages', () => {
  const rows = Array.from({ length: 123 }, (_, index) => index);
  assert.deepEqual(paginateReportRows(rows, 0).items, rows.slice(0, 50));
  assert.deepEqual(paginateReportRows(rows, 2).items, rows.slice(100));
  assert.equal(paginateReportRows(rows, 99).page, 2);
  assert.deepEqual(paginateReportRows([], 0), { items: [], page: 0, pageCount: 1, total: 0 });
});

for (const [tool, filename] of [['numbers', 'session-numbers.json'], ['teams', 'session-teams.json'], ['game', 'session-game.json']] as const) {
  test(`${tool} reports expose typed outcomes with bounded single-round construction`, async () => {
    const example = JSON.parse(await readFile(fileURLToPath(new URL(`../../contracts/examples/${filename}`, import.meta.url)), 'utf8')) as SessionEnvelope;
    const summaries = listReportRounds(example);
    assert.equal(summaries.length, 1);
    const report = buildRoundReport(example, summaries[0]!.roundId)!;
    assert.equal(report.resultCount, 1);
    assert.equal(report.events.length, 1);
    if (tool === 'numbers') {
      assert.equal(report.events[0]!.value, 7);
      assert.equal(report.rows.length, 10);
      assert.equal(report.rows.find((row) => row.value === 7)?.count, 1);
      assert.equal(report.rows.find((row) => row.value === 1)?.nextChance, 0.1);
    } else if (tool === 'teams') {
      assert.deepEqual(report.events[0]!.teams, [['Aysel', 'Leyla'], ['Murad']]);
      assert.equal(report.rows.reduce((sum, row) => sum + row.count, 0), 3);
      assert.equal(report.rows.find((row) => row.entryId === 'entry_aysel')?.observedShare, 1 / 3);
    } else {
      assert.equal(report.events[0]!.text, 'What small thing made you smile today?');
      assert.equal(report.events[0]!.status, 'pending');
      assert.equal(report.rows.find((row) => row.cardId === 'card_small_joy')?.count, 1);
    }
    assert.match(exportRoundReportCsv(report), /result_kind/);
  });
}
