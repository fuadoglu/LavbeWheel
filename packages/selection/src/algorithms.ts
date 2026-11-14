import { uniformIndex, type RandomSource } from './index.ts';
import type { WheelEntry } from '@lavbe/contracts';

export interface IntegerRange { min: number; max: number }

export function chooseInteger(range: IntegerRange, random: RandomSource): number {
  const { min, max } = range;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) throw new RangeError('Integer range must be ordered safe integers');
  const width = max - min + 1;
  if (!Number.isSafeInteger(width) || width > 10_000 || min < -1_000_000 || max > 1_000_000) throw new RangeError('Integer range exceeds configured limits');
  return min + uniformIndex(width, random);
}

export function chooseWeighted<T extends Pick<WheelEntry, 'weight'>>(entries: readonly T[], random: RandomSource): T {
  if (entries.length === 0) throw new RangeError('Cannot choose from an empty collection');
  let total = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.weight) || entry.weight < 1 || entry.weight > 1_000) throw new RangeError('Weights must be integers from 1 through 1000');
    total += entry.weight;
  }
  if (total > 1_000_000) throw new RangeError('Total weight exceeds configured limit');
  let roll = uniformIndex(total, random);
  for (const entry of entries) {
    if (roll < entry.weight) return entry;
    roll -= entry.weight;
  }
  throw new Error('Weighted selection invariant failed');
}

export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = uniformIndex(index + 1, random);
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function balanceTeams<T extends Pick<WheelEntry, 'id' | 'weight'>>(entries: readonly T[], teamCount: number, random: RandomSource): T[][] {
  if (!Number.isSafeInteger(teamCount) || teamCount < 2 || teamCount > 50 || teamCount > entries.length) throw new RangeError('Team count must be 2..50 and no greater than the member count');
  if (entries.some((entry) => entry.weight !== 1)) throw new RangeError('Team entries must have equal weight');
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new RangeError('Team member IDs must be unique');
  const shuffled = shuffle(entries, random);
  const groups = Array.from({ length: teamCount }, () => [] as T[]);
  shuffled.forEach((entry, index) => groups[index % teamCount]!.push(entry));
  return groups;
}
