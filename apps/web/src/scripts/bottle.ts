import { browserRandomSource, chooseBottleSeat, resetCycle, shuffledBottleCycle } from '@lavbe/selection';
import type { SessionEnvelope } from '@lavbe/contracts';
import {
  acquireWriterLease, buildRoundReport, commitSelectionResult, createLocalBottleSession,
  listSessions, loadSession, releaseWriterLease, renewWriterLease, saveInitialSession, updateSession,
} from '@lavbe/session';
import { wheelSpinProgress } from './spin-motion';
import azCatalog from '../../../../content/locales/az.json';
import enCatalog from '../../../../content/locales/en.json';

const messages = document.documentElement.lang === 'en' ? enCatalog : azCatalog;
const locale = document.documentElement.lang || 'az';
const text = messages.messages;
const setup = document.querySelector<HTMLFormElement>('#bottle-setup');
const namesInput = document.querySelector<HTMLTextAreaElement>('#bottle-names');
const modeSelect = document.querySelector<HTMLSelectElement>('#bottle-mode');
const startButton = document.querySelector<HTMLButtonElement>('#bottle-start');
const playPanel = document.querySelector<HTMLDivElement>('#bottle-play');
const savedSelect = document.querySelector<HTMLSelectElement>('#bottle-sessions');
const canvas = document.querySelector<HTMLCanvasElement>('#bottle-wheel');
const resultText = document.querySelector<HTMLParagraphElement>('#bottle-result');
const cycleText = document.querySelector<HTMLParagraphElement>('#bottle-cycle');
const spinButton = document.querySelector<HTMLButtonElement>('#bottle-spin');
const resetButton = document.querySelector<HTMLButtonElement>('#bottle-reset-cycle');
const history = document.querySelector<HTMLOListElement>('#bottle-history');
const newButton = document.querySelector<HTMLButtonElement>('#bottle-new');
const errorText = document.querySelector<HTMLParagraphElement>('#bottle-error');
if (!setup || !namesInput || !modeSelect || !startButton || !playPanel || !savedSelect || !canvas || !resultText || !cycleText || !spinButton || !resetButton || !history || !newButton || !errorText) throw new Error('Bottle page is incomplete');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Bottle canvas is unavailable');
const context: CanvasRenderingContext2D = ctx;
const colors = ['#146e65', '#be6b37', '#4e56a8', '#bb4d62', '#567d37', '#9b5791', '#337c9d', '#9a761c', '#c06f88', '#596d84'];
const writerId = (() => {
  try {
    const key = 'lavbe.bottle-writer';
    const previous = sessionStorage.getItem(key);
    if (previous) return previous;
    const id = crypto.randomUUID().replaceAll('-', '');
    sessionStorage.setItem(key, id);
    return id;
  } catch { return crypto.randomUUID().replaceAll('-', ''); }
})();
let session: SessionEnvelope | null = null;
let revision = 0;
let writerLeaseHeld = false;
let records: Awaited<ReturnType<typeof listSessions>> = [];
let names: string[] = [];
let angle = 0;
let selectedIndex: number | null = null;
let spinning = false;
let pageReady = false;

function wheel() {
  if (!session) throw new Error('Bottle session has not loaded');
  return session.configRevisions.find((item) => item.id === session!.currentRevisionId)!.wheel;
}

function showError(error: unknown): void { errorText!.hidden = false; errorText!.textContent = error instanceof Error ? error.message : text.bottleError; }
function clearError(): void { errorText!.hidden = true; errorText!.textContent = ''; }

function draw(rotation = angle): void {
  const size = canvas!.width, center = size / 2, radius = center - 8;
  context.clearRect(0, 0, size, size);
  const seats = wheel().seats ?? [];
  const entries = new Map(wheel().entries.map((entry) => [entry.id, entry]));
  const sector = Math.PI * 2 / seats.length;
  seats.forEach((id, index) => {
    const start = rotation - Math.PI / 2 + index * sector;
    context.beginPath(); context.moveTo(center, center); context.arc(center, center, radius, start, start + sector); context.closePath();
    context.fillStyle = colors[index % colors.length]!; context.fill();
    context.strokeStyle = selectedIndex === index ? '#fff' : 'rgba(255,255,255,.86)'; context.lineWidth = selectedIndex === index ? 8 : 4; context.stroke();
    const excluded = session!.cycle.excludedEntryIds.includes(id);
    context.save(); context.translate(center, center); context.rotate(start + sector / 2);
    context.textAlign = 'right'; context.textBaseline = 'middle'; context.fillStyle = excluded ? 'rgba(255,255,255,.54)' : '#fff'; context.font = '700 24px ui-sans-serif, system-ui';
    const label = entries.get(id)?.label ?? id; context.fillText(label.length > 18 ? `${label.slice(0, 17)}…` : label, radius * .73, 0); context.restore();
  });
  context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.strokeStyle = 'rgba(48,35,75,.12)'; context.lineWidth = 2; context.stroke();
}

function renderSavedSessions(): void {
  const bottles = records.filter((record) => record.envelope.configRevisions.some((item) => item.wheel.tool === 'bottle'));
  savedSelect!.replaceChildren(...bottles.map((record) => {
    const option = document.createElement('option'); option.value = record.sessionId; option.selected = record.sessionId === session?.sessionId;
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.envelope.createdAt));
    option.textContent = `Şüşə · ${date}`; return option;
  }));
  savedSelect!.disabled = bottles.length < 2;
}

function render(): void {
  if (!session || !playPanel || !setup || !resultText || !spinButton || !history || !cycleText || !resetButton) return;
  setup.hidden = true; playPanel.hidden = false; renderSavedSessions();
  const current = wheel(); const seats = current.seats ?? [];
  const latest = session.results.at(-1);
  if (latest?.kind === 'entry') {
    selectedIndex = seats.indexOf(latest.entryId);
    resultText.textContent = text.bottleSelected.replace('{name}', latest.label);
  } else { selectedIndex = null; resultText.textContent = ''; }
  draw();
  const remaining = current.mode === 'independent' ? seats.length : session.cycle.remainingEntryIds.length;
  cycleText.textContent = !writerLeaseHeld ? text.bottleReadOnly : text.bottleCycleCount.replace('{remaining}', String(remaining));
  spinButton.disabled = spinning || !writerLeaseHeld || current.mode !== 'independent' && !remaining;
  resetButton.hidden = !writerLeaseHeld || current.mode === 'independent';
  resetButton.disabled = spinning;
  if (current.mode !== 'independent' && !remaining) cycleText.textContent = text.bottleNoRepeatExhausted;
  history.replaceChildren();
  const report = buildRoundReport(session, session.rounds.at(-1)!.id);
  for (const event of report?.events ?? []) {
    if (event.kind !== 'entry') continue;
    const item = document.createElement('li'); item.textContent = event.label; history.append(item);
  }
}

async function refreshSessions(): Promise<void> { records = await listSessions(); renderSavedSessions(); }

async function persist(next: SessionEnvelope): Promise<void> {
  if (!session || !writerLeaseHeld) throw new Error(text.bottleReadOnly);
  revision = await updateSession(next, writerId, revision); session = next;
  await refreshSessions(); render();
}

async function showCommittedResult(): Promise<void> {
  if (!session) return;
  const latest = session.results.at(-1);
  if (!latest || latest.kind !== 'entry') return;
  selectedIndex = (wheel().seats ?? []).indexOf(latest.entryId);
  resultText!.textContent = text.bottleSelected.replace('{name}', latest.label);
  const next = structuredClone(session); next.results.at(-1)!.presentation = 'revealed';
  revision = await updateSession(next, writerId, revision); session = next;
  const acknowledged = structuredClone(next); acknowledged.results.at(-1)!.presentation = 'acknowledged';
  revision = await updateSession(acknowledged, writerId, revision); session = acknowledged;
  render();
}

async function useSession(sessionId: string): Promise<void> {
  if (session && writerLeaseHeld) await releaseWriterLease(session.wheelId, writerId);
  writerLeaseHeld = false;
  const stored = await loadSession(sessionId);
  if (!stored) throw new Error(text.bottleError);
  session = stored.envelope; revision = stored.revision;
  if (wheel().tool !== 'bottle') throw new Error(text.bottleError);
  writerLeaseHeld = await acquireWriterLease(session.wheelId, writerId);
  names = wheel().seats!.map((id) => wheel().entries.find((entry) => entry.id === id)!.label);
  const last = session.results.at(-1);
  selectedIndex = last?.kind === 'entry' ? wheel().seats!.indexOf(last.entryId) : null;
  angle = selectedIndex === null ? 0 : -((selectedIndex + 0.5) * Math.PI * 2 / wheel().seats!.length);
  render();
  if (writerLeaseHeld && last?.presentation !== 'acknowledged') await showCommittedResult();
}

async function startNew(labels = namesInput!.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean), mode = modeSelect!.value as 'independent' | 'remove-winner' | 'shuffled-cycle'): Promise<void> {
  const next = createLocalBottleSession(labels, mode);
  if (!await acquireWriterLease(next.wheelId, writerId)) throw new Error(text.bottleError);
  try { await saveInitialSession(next); }
  catch (error) { await releaseWriterLease(next.wheelId, writerId); throw error; }
  session = next; revision = 1; writerLeaseHeld = true; names = labels;
  angle = 0; selectedIndex = null; clearError(); await refreshSessions(); render();
}

setup.addEventListener('submit', (event) => {
  event.preventDefault(); clearError();
  if (!pageReady) return;
  const labels = namesInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (labels.length < 2 || labels.length > 20) { showError(new Error(text.gameInvalidPlayers)); return; }
  startButton.disabled = true; void startNew(labels).catch(showError).finally(() => { startButton.disabled = false; });
});

spinButton.addEventListener('click', () => {
  if (!session || !writerLeaseHeld || spinning) return;
  window.dispatchEvent(new CustomEvent('lavbe:activity', { detail: { busy: true } }));
  clearError(); spinning = true; spinButton.disabled = true;
  try {
    const selected = chooseBottleSeat(wheel(), session.cycle, browserRandomSource());
    const entry = wheel().entries.find((candidate) => candidate.id === selected.entryId)!;
    const next = structuredClone(session); next.cycle = { ...next.cycle, ...selected.cycle };
    next.results.push({ id: crypto.randomUUID().replaceAll('-', ''), roundId: next.rounds.at(-1)!.id, configRevisionId: next.currentRevisionId, sequence: (next.results.at(-1)?.sequence ?? 0) + 1, committedAt: new Date().toISOString(), presentation: 'pending', kind: 'entry', entryId: entry.id, label: entry.label });
    void (async () => {
      revision = await commitSelectionResult(next, writerId, revision); session = next; render();
      const start = angle, current = ((-selected.targetRadians - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const destination = start + Math.PI * 2 * 5 + current;
      const started = performance.now(), duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 1_800;
      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          const progress = Math.min(1, (now - started) / duration); angle = start + (destination - start) * wheelSpinProgress(progress); draw();
          if (progress < 1) requestAnimationFrame(frame); else { angle = destination % (Math.PI * 2); selectedIndex = selected.sectorIndex; draw(); resolve(); }
        };
        requestAnimationFrame(frame);
      });
      await showCommittedResult();
    })().catch(showError).finally(() => { spinning = false; render(); window.dispatchEvent(new CustomEvent('lavbe:activity', { detail: { busy: false } })); });
  } catch (error) { showError(error); spinning = false; render(); window.dispatchEvent(new CustomEvent('lavbe:activity', { detail: { busy: false } })); }
});

resetButton.addEventListener('click', () => {
  if (!session || !writerLeaseHeld) return;
  try {
    const current = wheel();
    const cycle = current.mode === 'shuffled-cycle' ? shuffledBottleCycle(current, browserRandomSource()) : resetCycle(current.seats ?? []);
    const next = structuredClone(session); next.cycle = { number: session.cycle.number + 1, ...cycle };
    void persist(next).catch(showError);
  } catch (error) { showError(error); }
});
newButton.addEventListener('click', () => { setup.hidden = false; playPanel.hidden = true; startButton!.disabled = false; namesInput!.value = names.join('\n'); namesInput!.focus(); });
savedSelect.addEventListener('change', () => { void useSession(savedSelect.value).catch(showError); });
window.addEventListener('beforeunload', () => { if (session && writerLeaseHeld) void releaseWriterLease(session.wheelId, writerId); });
void refreshSessions().then(async () => {
  const last = records.find((record) => record.envelope.configRevisions.some((item) => item.wheel.tool === 'bottle'));
  if (last) await useSession(last.sessionId);
}).catch(showError).finally(() => { pageReady = true; startButton!.disabled = false; });
window.setInterval(() => {
  if (!session || !writerLeaseHeld) return;
  void renewWriterLease(session.wheelId, writerId).then((renewed) => { if (!renewed) { writerLeaseHeld = false; render(); } }).catch(() => { writerLeaseHeld = false; render(); });
}, 3_000);
