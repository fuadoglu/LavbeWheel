import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseUniform, uniformIndex, type RandomSource } from '../../packages/selection/src/index.ts';

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

  it('keeps rejection limits exact near JavaScript safe integer bounds', () => {
    assert.equal(uniformIndex(Number.MAX_SAFE_INTEGER, sequence(...Array(7).fill(255), ...Array(7).fill(0))), 0);
  });

  it('chooses values, including duplicate labels, by their distinct positions', () => {
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
});
