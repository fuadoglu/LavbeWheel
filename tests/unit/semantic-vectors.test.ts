import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import type { WheelConfig } from '../../packages/contracts/src/index.ts';
import { normalizeWheelForStorage, validateWheelSemantics } from '../../packages/selection/src/semantics.ts';

interface SemanticVector { id: string; expected: string; wheel: WheelConfig }
const vectors = JSON.parse(await readFile(new URL('../../contracts/semantic-vectors.json', import.meta.url), 'utf8')) as SemanticVector[];

describe('shared wheel semantic vectors', () => {
  for (const vector of vectors) {
    it(`${vector.id} -> ${vector.expected}`, () => {
      assert.equal(validateWheelSemantics(vector.wheel), vector.expected);
    });
  }

  it('normalizes labels and titles to NFC without merging entry identities', () => {
    const wheel = structuredClone(vectors[0]!.wheel);
    wheel.title = 'Cafe\u0301';
    wheel.entries[0]!.label = 'A\u030a';
    wheel.entries[1]!.label = 'Å';
    const normalized = normalizeWheelForStorage(wheel);
    assert.equal(normalized.title, 'Café');
    assert.equal(normalized.entries[0]!.label, 'Å');
    assert.equal(normalized.entries[1]!.label, 'Å');
    assert.notEqual(normalized.entries[0]!.id, normalized.entries[1]!.id);
  });
});
