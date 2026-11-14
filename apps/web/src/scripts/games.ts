import {
  browserRandomSource, drawGameTurn, endGame, pauseGame, resolveGameTurn, resumeGame, revealGameTurn,
} from '@lavbe/selection';
import type { SessionEnvelope, LocalizedPack } from '@lavbe/contracts';
import {
  acquireWriterLease, buildRoundReport, commitSelectionResult, createLocalGameSession,
  listSessions, loadSession, releaseWriterLease, renewWriterLease, saveInitialSession, updateSession,
} from '@lavbe/session';
import messages from '../../../../content/locales/az.json';

const text = messages.messages;
const setup = document.querySelector<HTMLFormElement>('#game-setup');
const playersInput = document.querySelector<HTMLTextAreaElement>('#game-players');
const packSelect = document.querySelector<HTMLSelectElement>('#game-pack');
const startButton = document.querySelector<HTMLButtonElement>('#game-start');
const playPanel = document.querySelector<HTMLDivElement>('#game-play');
const savedSelect = document.querySelector<HTMLSelectElement>('#saved-games');
const statusText = document.querySelector<HTMLParagraphElement>('#game-status');
const cardPanel = document.querySelector<HTMLElement>('#game-card');
const cardPlayer = document.querySelector<HTMLElement>('#game-player');
const cardText = document.querySelector<HTMLParagraphElement>('#game-card-text');
const cardCount = document.querySelector<HTMLElement>('#game-card-count');
const errorText = document.querySelector<HTMLParagraphElement>('#game-error');
const history = document.querySelector<HTMLOListElement>('#game-history');
const drawButton = document.querySelector<HTMLButtonElement>('#game-draw');
const doneButton = document.querySelector<HTMLButtonElement>('#game-done');
const skipButton = document.querySelector<HTMLButtonElement>('#game-skip');
const pauseButton = document.querySelector<HTMLButtonElement>('#game-pause');
const resumeButton = document.querySelector<HTMLButtonElement>('#game-resume');
const restartButton = document.querySelector<HTMLButtonElement>('#game-restart');
const endButton = document.querySelector<HTMLButtonElement>('#game-end');
const newButton = document.querySelector<HTMLButtonElement>('#game-new');
if (!setup || !playersInput || !packSelect || !startButton || !playPanel || !savedSelect || !statusText || !cardPanel || !cardPlayer || !cardText || !cardCount || !errorText || !history) throw new Error('Game page is incomplete');

const localeFamily: Record<string, string> = {
  icebreakers: text.gameFamilyIcebreakers, friends: text.gameFamilyFriends, couples: text.gameFamilyCouples,
  truth: text.gameFamilyTruth, dare: text.gameFamilyDare, family: text.gameFamilyFamily,
};
const packLoaders: Record<string, () => Promise<{ default: unknown }>> = {
  icebreakers: () => import('../../../../content/packs/en/icebreakers.json'),
  friends: () => import('../../../../content/packs/en/friends.json'),
  couples: () => import('../../../../content/packs/en/couples.json'),
  truth: () => import('../../../../content/packs/en/truth.json'),
  dare: () => import('../../../../content/packs/en/dare.json'),
  family: () => import('../../../../content/packs/en/family.json'),
};
const writerId = (() => {
  try {
    const key = 'lavbe.game-writer';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID().replaceAll('-', '');
    sessionStorage.setItem(key, id);
    return id;
  } catch { return crypto.randomUUID().replaceAll('-', ''); }
})();
let session: SessionEnvelope | null = null;
let sessionRevision = 0;
let writerLeaseHeld = false;
let records: Awaited<ReturnType<typeof listSessions>> = [];
let committing = false;

function showError(error: unknown): void {
  errorText!.hidden = false;
  errorText!.textContent = error instanceof Error ? error.message : text.gameStorageError;
}

function clearError(): void { errorText!.hidden = true; errorText!.textContent = ''; }

function activeCard(): Extract<SessionEnvelope['results'][number], { kind: 'card' }> | null {
  if (!session?.game?.activeResultId) return null;
  const result = session.results.find((item) => item.id === session!.game!.activeResultId);
  return result?.kind === 'card' ? result : null;
}

function renderSavedSessions(): void {
  if (!savedSelect) return;
  const games = records.filter((record) => record.envelope.game);
  savedSelect.replaceChildren(...games.map((record) => {
    const option = document.createElement('option');
    option.value = record.sessionId;
    const family = localeFamily[record.envelope.game!.packSnapshot.family] ?? record.envelope.game!.packSnapshot.family;
    const date = new Intl.DateTimeFormat('az', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.envelope.createdAt));
    option.textContent = `${family} · ${date}`;
    option.selected = record.sessionId === session?.sessionId;
    return option;
  }));
  savedSelect.disabled = games.length < 2;
}

function render(): void {
  if (!session?.game || !playPanel || !setup || !statusText || !cardPanel || !cardPlayer || !cardText || !cardCount || !history) return;
  setup.hidden = true;
  playPanel.hidden = false;
  renderSavedSessions();
  const game = session.game;
  const current = activeCard();
  cardPanel.hidden = !current;
  if (current) {
    cardPlayer.textContent = text.gameSeatLabel.replace('{name}', current.label);
    cardText.textContent = current.text;
  }
  cardCount.textContent = text.gameCardCount.replace('{used}', String(game.usedCardIds.length)).replace('{total}', String(game.packSnapshot.cards.length));
  const paused = game.phase === 'paused';
  const waiting = game.phase === 'awaiting-complete-or-skip';
  statusText.textContent = !writerLeaseHeld ? text.gameReadOnly : paused ? text.gamePaused : game.phase === 'ready' ? text.gamePhaseReady : game.phase === 'exhausted' ? text.gamePackExhausted : game.phase === 'ended' ? text.gameEnded : waiting ? text.gamePassNotice : text.gameSaving;
  if (drawButton) drawButton.hidden = game.phase !== 'ready' || !writerLeaseHeld;
  if (doneButton) doneButton.hidden = !waiting || !writerLeaseHeld;
  if (skipButton) skipButton.hidden = !waiting || !writerLeaseHeld;
  if (pauseButton) pauseButton.hidden = (game.phase !== 'ready' && !waiting) || !writerLeaseHeld;
  if (resumeButton) resumeButton.hidden = !paused || !writerLeaseHeld;
  if (restartButton) restartButton.hidden = game.phase !== 'exhausted' || !writerLeaseHeld;
  if (endButton) endButton.hidden = (game.phase !== 'ready' && game.phase !== 'exhausted') || !writerLeaseHeld;
  if (newButton) newButton.hidden = !['ended', 'exhausted'].includes(game.phase) || !writerLeaseHeld;
  history.replaceChildren();
  const report = buildRoundReport(session, session.rounds.at(-1)!.id);
  for (const event of report?.events ?? []) {
    if (event.kind !== 'card') continue;
    const item = document.createElement('li');
    item.textContent = `${event.label} · ${event.text ?? ''} · ${event.status ?? ''}`;
    history.append(item);
  }
}

async function refreshSessions(): Promise<void> {
  records = await listSessions();
  renderSavedSessions();
}

async function persist(next: SessionEnvelope): Promise<void> {
  if (!session || !writerLeaseHeld) throw new Error(text.gameReadOnly);
  sessionRevision = await updateSession(next, writerId, sessionRevision);
  session = next;
  await refreshSessions();
  render();
}

async function revealCommittedCard(): Promise<void> {
  if (!session?.game || session.game.phase !== 'revealing-card' || !session.game.activeResultId) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) await new Promise((resolve) => window.setTimeout(resolve, 320));
  const next = revealGameTurn(session, session.game.activeResultId);
  const result = next.results.find((item) => item.id === next.game!.activeResultId);
  if (result) result.presentation = 'revealed';
  await persist(next);
  const acknowledged = structuredClone(next);
  const latest = acknowledged.results.find((item) => item.id === acknowledged.game!.activeResultId);
  if (latest) latest.presentation = 'acknowledged';
  await persist(acknowledged);
}

async function useSession(sessionId: string): Promise<void> {
  if (session && writerLeaseHeld) await releaseWriterLease(session.wheelId, writerId);
  writerLeaseHeld = false;
  const stored = await loadSession(sessionId);
  if (!stored?.envelope.game) throw new Error(text.gameNoPack);
  session = stored.envelope;
  sessionRevision = stored.revision;
  writerLeaseHeld = await acquireWriterLease(session.wheelId, writerId);
  render();
  if (writerLeaseHeld && session.game?.phase === 'revealing-card') await revealCommittedCard();
}

async function startNewGame(labels = playersInput!.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean), family = packSelect!.value): Promise<void> {
  const loader = packLoaders[family];
  if (!loader) throw new Error(text.gameNoPack);
  const pack = (await loader()).default as LocalizedPack;
  const next = createLocalGameSession(labels, pack);
  if (!await acquireWriterLease(next.wheelId, writerId)) throw new Error(text.gameStorageError);
  try { await saveInitialSession(next); }
  catch (error) { await releaseWriterLease(next.wheelId, writerId); throw error; }
  writerLeaseHeld = true;
  session = next;
  sessionRevision = 1;
  await refreshSessions();
  render();
  clearError();
}

setup.addEventListener('submit', (event) => {
  event.preventDefault();
  clearError();
  const labels = playersInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (labels.length < 2 || labels.length > 20) { showError(new Error(text.gameInvalidPlayers)); return; }
  startButton.disabled = true;
  void startNewGame(labels).catch(showError).finally(() => { startButton.disabled = false; });
});

drawButton?.addEventListener('click', () => {
  if (!session || !writerLeaseHeld || committing) return;
  committing = true;
  clearError();
  try {
    const next = drawGameTurn(session, crypto.randomUUID().replaceAll('-', ''), new Date().toISOString(), browserRandomSource());
    void (async () => {
      sessionRevision = await commitSelectionResult(next, writerId, sessionRevision);
      session = next;
      await refreshSessions();
      render();
      await revealCommittedCard();
    })().catch(showError).finally(() => { committing = false; render(); });
  } catch (error) { showError(error); committing = false; }
});

for (const [button, state] of [[doneButton, 'completed'], [skipButton, 'skipped']] as const) {
  button?.addEventListener('click', () => {
    if (!session?.game?.activeResultId || !writerLeaseHeld || committing) return;
    committing = true;
    clearError();
    try { void persist(resolveGameTurn(session, session.game.activeResultId, state)).catch(showError).finally(() => { committing = false; render(); }); }
    catch (error) { showError(error); committing = false; }
  });
}

pauseButton?.addEventListener('click', () => {
  if (!session?.game || !writerLeaseHeld) return;
  try { void persist({ ...structuredClone(session), game: pauseGame(session.game) }).catch(showError); } catch (error) { showError(error); }
});
resumeButton?.addEventListener('click', () => {
  if (!session?.game || !writerLeaseHeld) return;
  try {
    const next = { ...structuredClone(session), game: resumeGame(session.game) };
    void persist(next).then(() => { if (session?.game?.phase === 'revealing-card') return revealCommittedCard(); }).catch(showError);
  } catch (error) { showError(error); }
});
endButton?.addEventListener('click', () => {
  if (!session?.game || !writerLeaseHeld) return;
  try { void persist({ ...structuredClone(session), game: endGame(session.game) }).catch(showError); } catch (error) { showError(error); }
});
restartButton?.addEventListener('click', () => { if (session?.game) void startNewGame(session.configRevisions.find((item) => item.id === session!.currentRevisionId)!.wheel.entries.map((entry) => entry.label), session.game.packSnapshot.family).catch(showError); });
newButton?.addEventListener('click', () => { setup.hidden = false; playPanel.hidden = true; playersInput!.focus(); });
savedSelect.addEventListener('change', () => { void useSession(savedSelect.value).catch(showError); });
window.addEventListener('beforeunload', () => { if (session && writerLeaseHeld) void releaseWriterLease(session.wheelId, writerId); });

void refreshSessions().then(async () => {
  const latestGame = records.find((record) => record.envelope.game);
  if (latestGame) await useSession(latestGame.sessionId);
}).catch(showError);
window.setInterval(() => {
  if (!session || !writerLeaseHeld) return;
  void renewWriterLease(session.wheelId, writerId).then((renewed) => {
    if (!renewed) { writerLeaseHeld = false; render(); }
  }).catch(() => { writerLeaseHeld = false; render(); });
}, 3_000);
