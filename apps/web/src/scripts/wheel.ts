import { uniformIndex, browserRandomSource } from '@lavbe/selection';
import {
  acquireWriterLease, commitSelectionResult, createLocalWheelSession, listSessions, loadWheelDraft,
  recoverUnacknowledgedResult, releaseWriterLease, renewWriterLease, saveInitialSession,
  saveWheelDraft, updateSession, validateSessionEnvelope,
} from '@lavbe/session';
import type { SessionEnvelope } from '@lavbe/contracts';
import { limits } from '../data/config';
import { wheelSpinProgress } from './spin-motion';
import messages from '../../../../content/locales/az.json';

const canvas = document.querySelector<HTMLCanvasElement>('#wheel-canvas');
const input = document.querySelector<HTMLTextAreaElement>('#entries');
const button = document.querySelector<HTMLButtonElement>('#spin');
const result = document.querySelector<HTMLParagraphElement>('#result');
const count = document.querySelector<HTMLElement>('#count');
const reset = document.querySelector<HTMLButtonElement>('#reset');
const editorDone = document.querySelector<HTMLButtonElement>('#editor-done');
const participantPanel = document.querySelector<HTMLElement>('#participants');
const storageStatus = document.querySelector<HTMLElement>('#storage-status');
const historyList = document.querySelector<HTMLOListElement>('#history-list');
const historyEmpty = document.querySelector<HTMLParagraphElement>('#history-empty');
if (!canvas || !input || !button || !result || !count || !reset || !storageStatus) throw new Error('Wheel interface is incomplete');
const wheelCanvas: HTMLCanvasElement = canvas;
const entriesInput: HTMLTextAreaElement = input;
const spinButton: HTMLButtonElement = button;
const resultMessage: HTMLParagraphElement = result;
const participantCount: HTMLElement = count;
const resetButton: HTMLButtonElement = reset;
const saveStatus: HTMLElement = storageStatus;
const ctx = wheelCanvas.getContext('2d');
if (!ctx) throw new Error('Canvas is unavailable');
const context: CanvasRenderingContext2D = ctx;
const palette = ['#5941b8','#9b5600','#14725d','#b3434c','#315eaa','#a43f73','#3d772f','#a34e12'];
function getTabWriterId(): string {
  const key = 'lavbe.writer-owner';
  try {
    const previous = sessionStorage.getItem(key);
    if (previous) return previous;
    const next = crypto.randomUUID().replaceAll('-', '');
    sessionStorage.setItem(key, next);
    return next;
  } catch { return crypto.randomUUID().replaceAll('-', ''); }
}
const writerId = 'locks' in navigator ? getTabWriterId() : crypto.randomUUID().replaceAll('-', '');
let names: string[] = [];
let angle = 0;
let selectedIndex: number | null = null;
let initializationComplete = false;
let editedBeforeRestore = false;
let writerLeaseHeld = false;
let session: SessionEnvelope | null = null;
let sessionRevision = 0;
let pendingWrite: Promise<void> = Promise.resolve();
let configTimer: ReturnType<typeof setTimeout> | undefined;
let persistenceFailed = false;
let releaseWebLock: (() => void) | null = null;
function shouldReduceMotion(): boolean {
  let preference = 'system';
  try { preference = localStorage.getItem('lavbe.motion') ?? 'system'; } catch { /* Follow the OS preference when local settings are unavailable. */ }
  return preference === 'reduced' || (preference === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function renderHistory(): void {
  if (!historyList || !historyEmpty) return;
  const items = session?.results.filter((entry) => entry.kind === 'entry').slice(-50).reverse() ?? [];
  historyList.replaceChildren(...items.map((item) => {
    const row = document.createElement('li');
    row.textContent = messages.messages.resultWinner.replace('{name}', item.label);
    return row;
  }));
  historyEmpty.hidden = items.length > 0;
  historyList.hidden = items.length === 0;
}

function draw(rotation = angle): void {
  const size = wheelCanvas.width, center = size / 2, radius = center - 7;
  context.clearRect(0, 0, size, size);
  names.forEach((name, i) => {
    const arc = Math.PI * 2 / Math.max(1, names.length), start = rotation + i * arc - Math.PI / 2;
    context.beginPath(); context.moveTo(center, center); context.arc(center, center, radius, start, start + arc); context.closePath();
    context.fillStyle = palette[i % palette.length]!; context.fill(); context.strokeStyle = selectedIndex === i ? '#fff' : 'rgba(255,255,255,.82)'; context.lineWidth = selectedIndex === i ? 9 : 5; context.stroke();
    if (selectedIndex === i) {
      context.save(); context.globalAlpha = .16; context.fillStyle = '#fff'; context.fill(); context.restore();
    }
    context.save(); context.translate(center, center); context.rotate(start + arc / 2); context.textAlign = 'right'; context.textBaseline = 'middle';
    context.fillStyle = '#fff'; context.font = '700 25px ui-sans-serif, system-ui';
    const label = name.length > 18 ? `${name.slice(0, 17)}…` : name; context.fillText(label, radius * .74, 0); context.restore();
  });
  context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.strokeStyle = 'rgba(48,35,75,.12)'; context.lineWidth = 2; context.stroke();
}

function currentWheel() {
  if (!session) throw new Error('Session has not loaded');
  return session.configRevisions.find((revision) => revision.id === session!.currentRevisionId)!.wheel;
}

function refreshControls(): void {
  const activeCount = currentWheelSafe()?.entries.filter((entry) => entry.active).length ?? 0;
  spinButton.disabled = !initializationComplete || !writerLeaseHeld || persistenceFailed || activeCount === 0;
}

function currentWheelSafe() {
  const active = session;
  return active?.configRevisions.find((revision) => revision.id === active.currentRevisionId)?.wheel;
}

function sync(persist = true): void {
  names = entriesInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).slice(0, limits.entries.max);
  participantCount.textContent = messages.messages.participantCount.replace('{count}', String(names.length));
  draw();
  refreshControls();
  if (!persist || !initializationComplete) return;
  const text = entriesInput.value;
  saveStatus.textContent = messages.messages.storageSaving;
  pendingWrite = pendingWrite.catch(() => undefined).then(async () => {
    await saveWheelDraft(text);
    if (entriesInput.value === text && !persistenceFailed) saveStatus.textContent = messages.messages.savedLocally;
  }).catch(() => {
    persistenceFailed = true;
    if (entriesInput.value === text) saveStatus.textContent = messages.messages.storageFailed;
    refreshControls();
  });
  if (configTimer) clearTimeout(configTimer);
  configTimer = setTimeout(() => {
    pendingWrite = pendingWrite.catch(() => undefined).then(persistCurrentConfig).catch(markPersistenceFailure);
  }, 350);
}

function markPersistenceFailure(): void {
  persistenceFailed = true;
  loseWriterLease();
}

function loseWriterLease(): void {
  writerLeaseHeld = false;
  releaseWebLock?.();
  releaseWebLock = null;
  saveStatus.textContent = messages.messages.storageFailed;
  refreshControls();
}

function nextTimestamp(after: string): string {
  return new Date(Math.max(Date.now(), Date.parse(after) + 1)).toISOString();
}

async function persistCurrentConfig(): Promise<void> {
  if (!session || !writerLeaseHeld || !names.length) return;
  const oldWheel = currentWheel();
  const byLabel = new Map<string, string[]>();
  for (const entry of oldWheel.entries) {
    const queue = byLabel.get(entry.label) ?? [];
    queue.push(entry.id);
    byLabel.set(entry.label, queue);
  }
  const entries = names.map((label) => {
    const queue = byLabel.get(label.normalize('NFC'));
    const existingId = queue?.shift();
    return { id: existingId ?? crypto.randomUUID().replaceAll('-', ''), label: label.normalize('NFC'), weight: 1, active: true };
  });
  if (entries.length === oldWheel.entries.length && entries.every((entry, index) => entry.id === oldWheel.entries[index]?.id && entry.label === oldWheel.entries[index]?.label)) return;

  const changedAt = nextTimestamp(session.rounds.at(-1)!.startedAt);
  const revisionId = crypto.randomUUID().replaceAll('-', '');
  const roundId = crypto.randomUUID().replaceAll('-', '');
  const next: SessionEnvelope = structuredClone(session);
  next.configRevisions.push({ id: revisionId, wheel: { ...oldWheel, entries } });
  next.currentRevisionId = revisionId;
  next.rounds.push({ id: roundId, startedAt: changedAt, reason: 'manual-config-change' });
  next.cycle = { number: next.cycle.number + 1, remainingEntryIds: entries.map((entry) => entry.id), excludedEntryIds: [] };
  const checked = validateSessionEnvelope(next);
  if (!checked.ok) throw new Error(`Edited wheel is invalid: ${checked.error}`);
  sessionRevision = await updateSession(checked.value, writerId, sessionRevision);
  session = checked.value;
  saveStatus.textContent = messages.messages.savedLocally;
}

function displayResult(label: string): void {
  resultMessage.textContent = messages.messages.resultWinner.replace('{name}', label);
}

function displayLatestResult(): void {
  if (!session) return;
  const latest = session.results.at(-1);
  if (!latest || latest.kind !== 'entry') return;
  const entries = currentWheel().entries.filter((entry) => entry.active);
  const configMatchesCanvas = entries.length === names.length && entries.every((entry, index) => entry.label === names[index]);
  const winnerIndex = configMatchesCanvas ? entries.findIndex((entry) => entry.id === latest.entryId) : -1;
  if (winnerIndex >= 0) {
    selectedIndex = winnerIndex;
    angle = (Math.PI * 2 - (winnerIndex + .5) * Math.PI * 2 / names.length) % (Math.PI * 2);
    draw();
  }
  displayResult(latest.label);
}

async function persistPresentation(presentation: 'revealed' | 'acknowledged'): Promise<void> {
  if (!session || !writerLeaseHeld) throw new Error('Session writer lease is unavailable');
  const next = structuredClone(session);
  const latest = next.results.at(-1);
  if (!latest) throw new Error('No committed spin result is available');
  latest.presentation = presentation;
  sessionRevision = await updateSession(next, writerId, sessionRevision);
  session = next;
}

async function recoverInterruptedResult(): Promise<void> {
  if (!session) return;
  renderHistory();
  const pending = recoverUnacknowledgedResult(session);
  const latest = pending ?? session.results.at(-1) ?? null;
  if (!latest || latest.kind !== 'entry') return;
  displayLatestResult();
  if (pending?.presentation === 'pending') await persistPresentation('revealed');
  if (pending) await persistPresentation('acknowledged');
}

async function initializeSession(labels: string[]): Promise<void> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const records = await listSessions();
    const existing = records.find((record) => record.envelope.wheelId === 'wheel_default_001');
    if (existing) {
      session = existing.envelope;
      sessionRevision = existing.revision;
      writerLeaseHeld = await acquireTabWriter(session.wheelId);
      return;
    }
    const initial = createLocalWheelSession(labels.length ? labels : ['Aylin', 'Murad', 'Leyla', 'Kamran']);
    if (!await acquireTabWriter(initial.wheelId)) { await wait(100); continue; }
    try {
      await saveInitialSession(initial);
      session = initial;
      sessionRevision = 1;
      writerLeaseHeld = true;
      return;
    } catch (error) {
      await releaseWriterLease(initial.wheelId, writerId);
      releaseWebLock?.();
      releaseWebLock = null;
      if (attempt === 11) throw error;
      await wait(100);
    }
  }
}

async function acquireTabWriter(wheelId: string): Promise<boolean> {
  let exclusiveLockHeld = false;
  if ('locks' in navigator) {
    let resolveLock!: (acquired: boolean) => void;
    const acquired = new Promise<boolean>((resolve) => { resolveLock = resolve; });
    void navigator.locks.request(`lavbe-wheel:${wheelId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolveLock(false); return; }
      resolveLock(true);
      await new Promise<void>((resolve) => { releaseWebLock = resolve; });
    }).catch(() => resolveLock(false));
    if (!await acquired) return false;
    exclusiveLockHeld = true;
  }
  const lease = await acquireWriterLease(wheelId, writerId, Date.now(), 10_000, exclusiveLockHeld);
  if (!lease) {
    releaseWebLock?.();
    releaseWebLock = null;
  }
  return lease;
}

function showResultAndAnimate(winnerIndex: number, selectedLabel: string): void {
  spinButton.disabled = true;
  entriesInput.disabled = true;
  resetButton.disabled = true;
  resultMessage.textContent = messages.messages.resultSpinning;
  const slice = Math.PI * 2 / names.length;
  const target = (Math.PI * 2 * 6) + (Math.PI * 2 - (winnerIndex + .5) * slice);
  selectedIndex = null;
  const start = angle, started = performance.now(), duration = shouldReduceMotion() ? 80 : limits.motion.defaultSeconds * 1000;
  function frame(now: number): void {
    const progress = Math.min(1, (now - started) / duration);
    const eased = wheelSpinProgress(progress);
    angle = start + target * eased; draw();
    if (progress < 1) requestAnimationFrame(frame);
    else {
      angle %= Math.PI * 2; selectedIndex = winnerIndex; draw();
      void persistPresentation('revealed').then(() => {
        displayResult(selectedLabel);
        return persistPresentation('acknowledged');
      }).then(() => { saveStatus.textContent = messages.messages.savedLocally; }).catch(markPersistenceFailure).finally(() => {
        entriesInput.disabled = false;
        resetButton.disabled = false;
        refreshControls();
      });
    }
  }
  requestAnimationFrame(frame);
}

sync(false);
saveStatus.textContent = messages.messages.storageLoading;
resultMessage.textContent = messages.messages.resultIdle;
entriesInput.addEventListener('input', () => { editedBeforeRestore = true; sync(); });
resetButton.addEventListener('click', () => { entriesInput.value = 'Aylin\nMurad\nLeyla\nKamran'; editedBeforeRestore = true; sync(); });
entriesInput.addEventListener('focus', () => participantPanel?.classList.add('is-editing'));
entriesInput.addEventListener('blur', () => window.setTimeout(() => {
  if (document.activeElement !== editorDone) participantPanel?.classList.remove('is-editing');
}, 0));
editorDone?.addEventListener('pointerdown', (event) => event.preventDefault());
editorDone?.addEventListener('click', () => {
  entriesInput.blur();
  participantPanel?.classList.remove('is-editing');
});

void (async () => {
  try {
    const saved = await loadWheelDraft();
    if (!editedBeforeRestore && saved !== null) entriesInput.value = saved;
    names = entriesInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).slice(0, limits.entries.max);
    await initializeSession(names);
    renderHistory();
    displayLatestResult();
    if (!editedBeforeRestore && saved === null && session) {
      entriesInput.value = currentWheel().entries.map((entry) => entry.label).join('\n');
      names = currentWheel().entries.filter((entry) => entry.active).map((entry) => entry.label);
    }
    sync(false);
    if (!writerLeaseHeld) saveStatus.textContent = messages.messages.storageFailed;
    window.setInterval(() => {
      if (!session || persistenceFailed) return;
      if (writerLeaseHeld) {
        void renewWriterLease(session.wheelId, writerId).then((renewed) => {
          if (!renewed) loseWriterLease();
        }).catch(markPersistenceFailure);
        return;
      }
      void acquireTabWriter(session.wheelId).then(async (acquired) => {
        if (!acquired) return;
        writerLeaseHeld = true;
        if (session && (currentWheel().entries.map((entry) => entry.label).join('\n') !== names.join('\n'))) await persistCurrentConfig();
        await recoverInterruptedResult();
        saveStatus.textContent = messages.messages.savedLocally;
        refreshControls();
      }).catch(markPersistenceFailure);
    }, 3_000);
    window.addEventListener('pagehide', () => {
      if (session) void releaseWriterLease(session.wheelId, writerId);
      releaseWebLock?.();
      releaseWebLock = null;
    }, { once: true });
    await pendingWrite;
    if (writerLeaseHeld) {
      if (editedBeforeRestore || session && (currentWheel().entries.map((entry) => entry.label).join('\n') !== names.join('\n'))) await persistCurrentConfig();
      await recoverInterruptedResult();
      saveStatus.textContent = messages.messages.savedLocally;
    }
    initializationComplete = true;
    sync(false);
    refreshControls();
  } catch {
    initializationComplete = true;
    markPersistenceFailure();
  }
})();

spinButton.addEventListener('click', () => {
  void (async () => {
    if (!session || !writerLeaseHeld || spinButton.disabled) return;
    spinButton.disabled = true;
    if (configTimer) clearTimeout(configTimer);
    await pendingWrite;
    await persistCurrentConfig();
    const wheel = currentWheel();
    const eligible = wheel.entries.filter((entry) => entry.active);
    if (!eligible.length) { refreshControls(); return; }
    const winnerIndex = uniformIndex(eligible.length, browserRandomSource());
    const winner = eligible[winnerIndex]!;
    const next = structuredClone(session);
    next.results.push({
      id: crypto.randomUUID().replaceAll('-', ''),
      roundId: next.rounds.at(-1)!.id,
      configRevisionId: next.currentRevisionId,
      sequence: (next.results.at(-1)?.sequence ?? 0) + 1,
      committedAt: nextTimestamp(next.results.at(-1)?.committedAt ?? next.rounds.at(-1)!.startedAt),
      presentation: 'pending',
      kind: 'entry',
      entryId: winner.id,
      label: winner.label,
    });
    sessionRevision = await commitSelectionResult(next, writerId, sessionRevision);
    session = next;
    renderHistory();
    showResultAndAnimate(eligible.findIndex((entry) => entry.id === winner.id), winner.label);
  })().catch(markPersistenceFailure);
});
