export interface RandomSource {
  bytes(length: number): Uint8Array;
}

/** Rejection sampling avoids modulo bias for any positive integer upper bound. */
export function uniformIndex(upperExclusive: number, random: RandomSource): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
    throw new RangeError('upperExclusive must be a positive safe integer');
  }
  const bound = BigInt(upperExclusive);
  const byteCount = Math.max(1, Math.ceil(bound.toString(2).length / 8));
  const space = 1n << BigInt(byteCount * 8);
  const limit = space - (space % bound);
  for (;;) {
    const bytes = random.bytes(byteCount);
    if (bytes.length !== byteCount) throw new RangeError('random source returned an unexpected byte count');
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value < limit) return Number(value % bound);
  }
}

export function chooseUniform<T>(items: readonly T[], random: RandomSource): T {
  if (items.length === 0) throw new RangeError('cannot select from an empty collection');
  return items[uniformIndex(items.length, random)]!;
}

export function browserRandomSource(): RandomSource {
  return { bytes(length) { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return bytes; } };
}

export { balanceTeams, chooseInteger, chooseWeighted, shuffle } from './algorithms.ts';
export { beginShuffledCycle, drawShuffledCycle, removeWinner, resetCycle } from './cycles.ts';
export { normalizeWheelForStorage, validateWheelSemantics } from './semantics.ts';
