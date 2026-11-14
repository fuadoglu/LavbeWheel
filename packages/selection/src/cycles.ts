import { shuffle } from './algorithms.ts';
import type { RandomSource } from './index.ts';
import type { WheelEntry } from '@lavbe/contracts';

export interface CycleState {
  remainingEntryIds: string[];
  excludedEntryIds: string[];
}

export function beginShuffledCycle(entries: readonly Pick<WheelEntry, 'id'>[], random: RandomSource): CycleState {
  const ids = entries.map((entry) => entry.id);
  if (ids.length === 0 || new Set(ids).size !== ids.length) throw new RangeError('A cycle needs unique eligible entries');
  return { remainingEntryIds: shuffle(ids, random), excludedEntryIds: [] };
}

export function drawShuffledCycle(state: CycleState): { entryId: string; next: CycleState } {
  const [entryId, ...remainingEntryIds] = state.remainingEntryIds;
  if (!entryId) throw new RangeError('Shuffled cycle is exhausted');
  return { entryId, next: { remainingEntryIds, excludedEntryIds: [...state.excludedEntryIds, entryId] } };
}

export function removeWinner(state: CycleState, winnerId: string): CycleState {
  if (!state.remainingEntryIds.includes(winnerId)) throw new RangeError('Winner is not currently eligible');
  return {
    remainingEntryIds: state.remainingEntryIds.filter((id) => id !== winnerId),
    excludedEntryIds: [...state.excludedEntryIds, winnerId],
  };
}

export function resetCycle(activeEntryIds: readonly string[]): CycleState {
  if (new Set(activeEntryIds).size !== activeEntryIds.length) throw new RangeError('Active entry IDs must be unique');
  return { remainingEntryIds: [...activeEntryIds], excludedEntryIds: [] };
}
