import type { LocalizedPack, SessionEnvelope, WheelConfig } from '@lavbe/contracts';
import { chooseUniform, type RandomSource } from './index.ts';
import { beginShuffledCycle, drawShuffledCycle, removeWinner } from './cycles.ts';

export type GameState = NonNullable<SessionEnvelope['game']>;
export type GameCardResult = Extract<SessionEnvelope['results'][number], { kind: 'card' }>;
export type BottleCycle = Pick<SessionEnvelope['cycle'], 'remainingEntryIds' | 'excludedEntryIds'>;

export function createGameState(pack: LocalizedPack): GameState {
  if (pack.cards.length === 0 || new Set(pack.cards.map((card) => card.id)).size !== pack.cards.length) {
    throw new RangeError('A game pack must contain cards with unique IDs');
  }
  if (pack.minPlayers > pack.maxPlayers || pack.minPlayers < 2 || pack.maxPlayers > 20) {
    throw new RangeError('A game pack must have a valid 2..20 player range');
  }
  return {
    packId: pack.id,
    packVersion: pack.version,
    locale: pack.locale,
    phase: 'ready',
    usedCardIds: [],
    activeResultId: null,
    nextTurnIndex: 0,
    resumePhase: null,
    packSnapshot: structuredClone(pack),
  };
}

export function drawGameCard(
  state: GameState,
  players: readonly { id: string; label: string }[],
  resultId: string,
  random: RandomSource,
): { game: GameState; result: Omit<GameCardResult, 'roundId' | 'configRevisionId' | 'sequence' | 'committedAt' | 'presentation'> } {
  if (state.phase !== 'ready' && state.phase !== 'selecting-player') throw new Error(`Cannot draw a card while game is ${state.phase}`);
  if (players.length < state.packSnapshot.minPlayers || players.length > state.packSnapshot.maxPlayers) throw new RangeError('Player count is outside this pack\'s limits');
  if (new Set(players.map((player) => player.id)).size !== players.length || players.some((player) => !player.id || !player.label)) throw new RangeError('Game players must have unique IDs and labels');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(resultId)) throw new RangeError('Result ID is invalid');

  const available = state.packSnapshot.cards.filter((card) => !state.usedCardIds.includes(card.id));
  if (!available.length) throw new Error('Game pack is exhausted; restart it explicitly before drawing again');
  const player = players[state.nextTurnIndex % players.length]!;
  const card = chooseUniform(available, random);
  const result: Omit<GameCardResult, 'roundId' | 'configRevisionId' | 'sequence' | 'committedAt' | 'presentation'> = {
    id: resultId,
    kind: 'card',
    entryId: player.id,
    label: player.label.normalize('NFC'),
    cardId: card.id,
    text: card.text.normalize('NFC'),
    status: 'pending',
  };
  const usedCardIds = [...state.usedCardIds, card.id];
  return {
    game: { ...state, phase: 'revealing-card', usedCardIds, activeResultId: resultId, nextTurnIndex: state.nextTurnIndex + 1 },
    result,
  };
}

/** Builds one atomic session mutation: the card and its selected player enter history together. */
export function drawGameTurn(
  session: SessionEnvelope,
  resultId: string,
  committedAt: string,
  random: RandomSource,
): SessionEnvelope {
  const wheel = session.configRevisions.find((item) => item.id === session.currentRevisionId)?.wheel;
  if (!wheel || wheel.tool !== 'game' || !session.game) throw new Error('A configured game session is required');
  const selected = drawGameCard(session.game, wheel.entries.filter((entry) => entry.active), resultId, random);
  const next = structuredClone(session);
  next.game = selected.game;
  next.results.push({
    ...selected.result,
    roundId: next.rounds.at(-1)!.id,
    configRevisionId: next.currentRevisionId,
    sequence: (next.results.at(-1)?.sequence ?? 0) + 1,
    committedAt,
    presentation: 'pending',
  });
  return next;
}

export function revealGameCard(state: GameState, resultId: string): GameState {
  if (state.phase !== 'revealing-card' || state.activeResultId !== resultId) throw new Error('Only the currently committed card can be revealed');
  return { ...state, phase: 'awaiting-complete-or-skip' };
}

export function revealGameTurn(session: SessionEnvelope, resultId: string): SessionEnvelope {
  const next = structuredClone(session);
  const result = next.results.find((item) => item.id === resultId);
  if (!result || result.kind !== 'card' || result.status !== 'pending' || !next.game) throw new Error('The committed game-card result is unavailable');
  next.game = revealGameCard(next.game, resultId);
  return next;
}

export function resolveGameCard(state: GameState, resultId: string): GameState {
  if (state.phase !== 'awaiting-complete-or-skip' || state.activeResultId !== resultId) throw new Error('Only the active revealed card can be completed or skipped');
  const exhausted = state.usedCardIds.length >= state.packSnapshot.cards.length;
  return { ...state, phase: exhausted ? 'exhausted' : 'ready', activeResultId: null, resumePhase: null };
}

export function resolveGameTurn(session: SessionEnvelope, resultId: string, status: 'completed' | 'skipped'): SessionEnvelope {
  const next = structuredClone(session);
  const result = next.results.find((item) => item.id === resultId);
  if (!result || result.kind !== 'card' || result.status !== 'pending' || !next.game) throw new Error('The committed game-card result is unavailable');
  result.status = status;
  next.game = resolveGameCard(next.game, resultId);
  return next;
}

export function pauseGame(state: GameState): GameState {
  if (state.phase === 'paused' || state.phase === 'ended' || state.phase === 'exhausted') throw new Error(`Cannot pause a game while it is ${state.phase}`);
  const resumePhase = state.phase === 'ready' || state.phase === 'selecting-player' ? 'ready' : 'awaiting-complete-or-skip';
  return { ...state, phase: 'paused', resumePhase };
}

export function resumeGame(state: GameState): GameState {
  if (state.phase !== 'paused' || !state.resumePhase) throw new Error('Game is not paused');
  return { ...state, phase: state.resumePhase, resumePhase: null };
}

export function restartGame(state: GameState): GameState {
  if (state.phase !== 'exhausted') throw new Error('Only an exhausted pack can be restarted');
  return { ...state, phase: 'ready', usedCardIds: [], activeResultId: null, resumePhase: null };
}

export function endGame(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  if (state.activeResultId || state.phase !== 'ready' && state.phase !== 'exhausted') {
    throw new Error('Resolve the active card and resume the game before ending it');
  }
  return { ...state, phase: 'ended', activeResultId: null, resumePhase: null };
}

/** Selects uniformly from geometric bottle sectors and returns a target angle for the renderer. */
export function chooseBottleSeat(wheel: WheelConfig, cycle: BottleCycle, random: RandomSource): { entryId: string; sectorIndex: number; targetRadians: number; cycle: BottleCycle } {
  if (wheel.tool !== 'bottle' || !wheel.seats || wheel.seats.length < 2) throw new RangeError('Bottle wheel needs at least two ordered seats');
  const active = wheel.entries.filter((entry) => entry.active);
  const seatIds = wheel.seats.filter((id) => active.some((entry) => entry.id === id));
  if (seatIds.length !== wheel.seats.length || new Set(seatIds).size !== seatIds.length) throw new RangeError('Bottle seats must map to unique active participants');

  let entryId: string;
  let nextCycle = cycle;
  if (wheel.mode === 'independent') {
    entryId = chooseUniform(seatIds, random);
  } else if (wheel.mode === 'remove-winner') {
    if (!cycle.remainingEntryIds.length) throw new Error('Bottle cycle is exhausted; reset it explicitly before spinning');
    entryId = chooseUniform(cycle.remainingEntryIds, random);
    nextCycle = removeWinner(cycle, entryId);
  } else {
    if (!cycle.remainingEntryIds.length) throw new Error('Bottle cycle is exhausted; reset it explicitly before spinning');
    const drawn = drawShuffledCycle(cycle);
    entryId = drawn.entryId;
    nextCycle = drawn.next;
  }
  const sectorIndex = seatIds.indexOf(entryId);
  if (sectorIndex < 0) throw new Error('Selected participant has no bottle seat');
  return { entryId, sectorIndex, targetRadians: (sectorIndex + 0.5) * Math.PI * 2 / seatIds.length, cycle: nextCycle };
}

export function shuffledBottleCycle(wheel: WheelConfig, random: RandomSource): BottleCycle {
  if (wheel.tool !== 'bottle' || !wheel.seats) throw new RangeError('Bottle wheel is required');
  const members = wheel.entries.filter((entry) => entry.active && wheel.seats!.includes(entry.id)).map((entry) => ({ id: entry.id }));
  return beginShuffledCycle(members, random);
}
