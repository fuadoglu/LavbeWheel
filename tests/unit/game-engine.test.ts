import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import {
  chooseBottleSeat, createGameState, drawGameCard, drawGameTurn, endGame, pauseGame, resolveGameCard,
  resolveGameTurn, restartGame, resumeGame, revealGameCard, revealGameTurn, shuffledBottleCycle,
  type LocalizedPack, type SessionEnvelope, type WheelConfig,
} from '@lavbe/selection';
import { acquireWriterLease, commitSelectionResult, createLocalBottleSession, createLocalGameSession, loadSession, saveInitialSession, updateSession, validateSessionEnvelope } from '@lavbe/session';

function sequence(...values: number[]) {
  let index = 0;
  return { bytes(length: number) { return Uint8Array.from({ length }, () => values[index++] ?? 0); } };
}

const gameSession = JSON.parse(await readFile(fileURLToPath(new URL('../../contracts/examples/session-game.json', import.meta.url)), 'utf8')) as SessionEnvelope;
const bottleSession = JSON.parse(await readFile(fileURLToPath(new URL('../../contracts/examples/session-bottle.json', import.meta.url)), 'utf8')) as SessionEnvelope;
const pack = gameSession.game!.packSnapshot;
const players = gameSession.configRevisions[0]!.wheel.entries.map(({ id, label }) => ({ id, label }));

function threeCardPack(): LocalizedPack {
  const value = structuredClone(pack);
  value.cards = Array.from({ length: 3 }, (_, index) => ({ ...value.cards[0]!, id: `card_small_${index + 1}`, text: `Prompt ${index + 1}` }));
  return value;
}

test('game card draw rotates players, never repeats a used card, and ends explicitly at exhaustion', () => {
  const state = createGameState(threeCardPack());
  const first = drawGameCard(state, players, 'spin_game001', sequence(0));
  assert.equal(first.game.phase, 'revealing-card');
  assert.equal(first.result.entryId, players[0]!.id);
  assert.equal(first.result.cardId, 'card_small_1');
  assert.equal(first.result.status, 'pending');

  const ready = resolveGameCard(revealGameCard(first.game, first.result.id), first.result.id);
  assert.equal(ready.phase, 'ready');
  const second = drawGameCard(ready, players, 'spin_game002', sequence(0));
  assert.equal(second.result.entryId, players[1]!.id);
  assert.equal(second.result.cardId, 'card_small_2');
  const paused = pauseGame(second.game);
  assert.equal(paused.phase, 'paused');
  const resumed = resumeGame(paused);
  assert.equal(resumed.phase, 'awaiting-complete-or-skip');
  const afterSkip = resolveGameCard(resumed, second.result.id);
  assert.equal(afterSkip.phase, 'ready');
  const third = drawGameCard(afterSkip, players, 'spin_game003', sequence(0));
  const exhausted = resolveGameCard(revealGameCard(third.game, third.result.id), third.result.id);
  assert.equal(exhausted.phase, 'exhausted');
  assert.throws(() => drawGameCard(exhausted, players, 'spin_game004', sequence(0)), /exhausted/);
  assert.equal(restartGame(exhausted).usedCardIds.length, 0);
  assert.equal(endGame(exhausted).phase, 'ended');
});

test('game engine rejects invalid transitions, player counts and unresolved end attempts', () => {
  const state = createGameState(pack);
  assert.throws(() => drawGameCard(state, players.slice(0, 1), 'spin_game001', sequence(0)), /Player count/);
  const pending = drawGameCard(state, players, 'spin_game001', sequence(0));
  assert.throws(() => revealGameCard(state, pending.result.id), /currently committed/);
  assert.throws(() => resolveGameCard(pending.game, pending.result.id), /revealed card/);
  assert.throws(() => endGame(pending.game), /active card/);
  assert.throws(() => endGame(pauseGame(state)), /resume the game/);
  assert.throws(() => resumeGame(state), /not paused/);
  assert.equal(resolveGameCard(revealGameCard(pending.game, pending.result.id), pending.result.id).phase, 'exhausted');
});

test('bottle and game factories create valid, independent session envelopes', () => {
  const bottle = createLocalBottleSession(['Aylin', 'Murad', 'Leyla'], 'shuffled-cycle', new Date('2026-11-14T10:00:00Z'), sequence(0, 0, 0));
  assert.equal(validateSessionEnvelope(bottle).ok, true);
  assert.equal(bottle.configRevisions[0]!.wheel.tool, 'bottle');
  assert.equal(bottle.configRevisions[0]!.wheel.seats?.length, 3);
  assert.deepEqual([...bottle.cycle.remainingEntryIds].sort(), [...bottle.configRevisions[0]!.wheel.seats!].sort());
  const game = createLocalGameSession(['Aylin', 'Murad'], threeCardPack(), new Date('2026-11-14T10:00:00Z'));
  assert.equal(validateSessionEnvelope(game).ok, true);
  assert.equal(game.configRevisions[0]!.wheel.tool, 'game');
  assert.equal(game.game?.phase, 'ready');
  assert.throws(() => createLocalBottleSession(['Only one'], 'independent'), /2\.\.20/);
});

test('bottle outcome uses ordered seat geometry and explicit no-repeat cycles', () => {
  const wheel = bottleSession.configRevisions[0]!.wheel;
  const initial = bottleSession.cycle;
  const single = chooseBottleSeat(wheel, initial, sequence(0));
  assert.equal(single.entryId, wheel.seats![0]);
  assert.equal(single.sectorIndex, 0);
  assert.equal(single.targetRadians, Math.PI / 3);

  const removeWheel = structuredClone(wheel);
  removeWheel.mode = 'remove-winner';
  let removal = structuredClone(initial);
  const removed = new Set<string>();
  for (let index = 0; index < wheel.seats!.length; index += 1) {
    const selected = chooseBottleSeat(removeWheel, removal, sequence(0));
    assert.equal(removed.has(selected.entryId), false);
    removed.add(selected.entryId);
    removal = selected.cycle as typeof removal;
  }
  assert.throws(() => chooseBottleSeat(removeWheel, removal, sequence(0)), /exhausted/);

  const cycleWheel = structuredClone(wheel);
  cycleWheel.mode = 'shuffled-cycle';
  let cycle = shuffledBottleCycle(cycleWheel, sequence(...Array(8).fill(0)));
  const outcomes = new Set<string>();
  for (let index = 0; index < wheel.seats!.length; index += 1) {
    const selected = chooseBottleSeat(cycleWheel, cycle, sequence(0));
    assert.equal(outcomes.has(selected.entryId), false);
    outcomes.add(selected.entryId);
    cycle = selected.cycle as typeof cycle;
  }
  assert.throws(() => chooseBottleSeat(cycleWheel, cycle, sequence(0)), /exhausted/);
  assert.throws(() => chooseBottleSeat({ ...wheel, tool: 'names' } as WheelConfig, initial, sequence(0)), /Bottle wheel/);
});

test('game session commits card completion or skip without permitting history rewrites', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('lavbe-wheel');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('test database deletion blocked'));
  });
  await saveInitialSession(structuredClone(gameSession));
  assert.equal(await acquireWriterLease(gameSession.wheelId, 'game-owner', Date.now()), true);
  const resumed = structuredClone(gameSession);
  resumed.game = resumeGame(resumed.game!);
  let revision = await updateSession(resumed, 'game-owner', 1);
  const resolved = structuredClone(resumed);
  const resultId = resolved.game!.activeResultId!;
  resolved.results.at(-1)!.status = 'skipped';
  resolved.game = resolveGameCard(resolved.game!, resultId);
  revision = await updateSession(resolved, 'game-owner', revision);
  const saved = await loadSession(gameSession.sessionId);
  assert.equal(revision, 3);
  assert.equal(saved?.envelope.results.at(-1)?.kind === 'card' ? saved.envelope.results.at(-1)?.status : null, 'skipped');
  assert.equal(saved?.envelope.game?.phase, 'exhausted');
  const forged = structuredClone(resolved);
  if (forged.results.at(-1)?.kind === 'card') forged.results.at(-1)!.text = 'changed after the draw';
  await assert.rejects(updateSession(forged, 'game-owner', revision), /immutable|invalid session/i);
});

test('game turn is atomically committed, revealed and resolved through allowed session updates', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('lavbe-wheel');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('test database deletion blocked'));
  });
  const session = structuredClone(gameSession);
  const selectedPack = threeCardPack();
  session.results = [];
  session.configRevisions[0]!.wheel.game = { packId: selectedPack.id, packVersion: selectedPack.version };
  session.game = createGameState(selectedPack);
  assert.equal(validateSessionEnvelope(session).ok, true);
  await saveInitialSession(session);
  assert.equal(await acquireWriterLease(session.wheelId, 'turn-owner', Date.now()), true);

  const drawn = drawGameTurn(session, 'spin_game101', new Date().toISOString(), sequence(0));
  assert.equal(validateSessionEnvelope(drawn).ok, true);
  let revision = await commitSelectionResult(drawn, 'turn-owner', 1);
  const revealed = revealGameTurn(structuredClone(drawn), 'spin_game101');
  revealed.results[0]!.presentation = 'revealed';
  revision = await updateSession(revealed, 'turn-owner', revision);
  const resolved = resolveGameTurn(revealed, 'spin_game101', 'completed');
  revision = await updateSession(resolved, 'turn-owner', revision);

  const stored = await loadSession(session.sessionId);
  assert.equal(revision, 4);
  assert.equal(stored?.envelope.game?.phase, 'ready');
  assert.equal(stored?.envelope.results[0]?.kind === 'card' ? stored.envelope.results[0].status : null, 'completed');
  assert.equal(stored?.envelope.results[0]?.presentation, 'revealed');
});
