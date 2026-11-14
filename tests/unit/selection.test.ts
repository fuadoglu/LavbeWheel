import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { balanceTeams, chooseInteger, chooseUniform, chooseWeighted, uniformIndex, type RandomSource } from '../../packages/selection/src/index.ts';
import { beginShuffledCycle, drawShuffledCycle, removeWinner, resetCycle } from '../../packages/selection/src/cycles.ts';

function sequence(...values: number[]): RandomSource {
  let index = 0;
  return { bytes(length) { return Uint8Array.from({ length }, () => values[index++] ?? 0); } };
}

describe('uniform selection primitives', () => {
  it('maps an accepted entropy word into the requested range', () => {
    assert.equal(uniformIndex(8, sequence(7)), 7);
    assert.equal(uniformIndex(3, sequence(2)), 2);
  });

  it('rejects the biased tail before returning a value', () => {
    assert.equal(uniformIndex(3, sequence(255, 254)), 2);
  });

  it('partitions every accepted one-byte entropy value equally for three choices', () => {
    const counts = [0, 0, 0];
    for (let byte = 0; byte < 255; byte += 1) {
      const pick = uniformIndex(3, { bytes: () => Uint8Array.of(byte) });
      counts[pick]! += 1;
    }
    assert.deepEqual(counts, [85, 85, 85]);
  });

  it('keeps rejection limits exact near JavaScript safe integer bounds', () => {
    assert.equal(uniformIndex(Number.MAX_SAFE_INTEGER, sequence(...Array(7).fill(255), ...Array(7).fill(0))), 0);
  });

  it('chooses by distinct positions when labels are duplicated', () => {
    assert.equal(chooseUniform(['same', 'same', 'other'], sequence(1)), 'same');
  });

  it('rejects invalid upper bounds', () => {
    for (const bound of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => uniformIndex(bound, sequence(0)), RangeError);
    }
  });

  it('rejects an empty collection and malformed entropy source', () => {
    assert.throws(() => chooseUniform([], sequence(0)), RangeError);
    assert.throws(() => uniformIndex(4, { bytes: () => new Uint8Array() }), RangeError);
  });

  it('includes both integer range endpoints and enforces range bounds', () => {
    assert.equal(chooseInteger({ min: -1_000_000, max: -999_999 }, sequence(0)), -1_000_000);
    assert.equal(chooseInteger({ min: 1, max: 10_000 }, sequence(39, 15)), 10_000);
    assert.throws(() => chooseInteger({ min: 2, max: 1 }, sequence(0)), RangeError);
    assert.throws(() => chooseInteger({ min: 1, max: 10_001 }, sequence(0)), RangeError);
  });

  it('uses exact cumulative intervals for positive integer weights', () => {
    const entries = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
    assert.equal(chooseWeighted(entries, sequence(0)).id, 'a');
    assert.equal(chooseWeighted(entries, sequence(1)).id, 'b');
    assert.equal(chooseWeighted(entries, sequence(3)).id, 'b');
    assert.throws(() => chooseWeighted([], sequence(0)), RangeError);
    assert.throws(() => chooseWeighted([{ id: 'bad', weight: 0 }], sequence(0)), RangeError);
  });

  it('shuffles all team members exactly once into balanced groups', () => {
    const members = Array.from({ length: 11 }, (_, index) => ({ id: `m${index}`, weight: 1 }));
    const groups = balanceTeams(members, 3, sequence(...Array(40).fill(0)));
    assert.deepEqual(groups.map((group) => group.length).sort(), [3, 4, 4]);
    assert.deepEqual(groups.flatMap((group) => group.map((member) => member.id)).sort(), members.map((member) => member.id).sort());
    assert.throws(() => balanceTeams(members, 12, sequence(0)), RangeError);
  });

  it('consumes a shuffled cycle without rerolling its remaining order', () => {
    const initial = beginShuffledCycle([{ id: 'a' }, { id: 'b' }, { id: 'c' }], sequence(0, 0));
    const first = drawShuffledCycle(initial);
    const second = drawShuffledCycle(first.next);
    const third = drawShuffledCycle(second.next);
    assert.deepEqual([first.entryId, second.entryId, third.entryId].sort(), ['a', 'b', 'c']);
    assert.deepEqual(third.next.remainingEntryIds, []);
    assert.equal(third.next.excludedEntryIds.length, 3);
    assert.throws(() => drawShuffledCycle(third.next), RangeError);
    assert.deepEqual(resetCycle(['a', 'b']).remainingEntryIds, ['a', 'b']);
    assert.equal(removeWinner({ remainingEntryIds: ['a', 'b'], excludedEntryIds: [] }, 'b').remainingEntryIds[0], 'a');
  });
});
