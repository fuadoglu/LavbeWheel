import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.ts';

interface VectorFile { vectors: Array<{ name: string; input: string; canonical: string }> }
const vectors = JSON.parse(readFileSync('contracts/canonical-json-vectors.json', 'utf8')) as VectorFile;

describe('shared canonical JSON vectors', () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      assert.equal(canonicalJson(JSON.parse(vector.input)), vector.canonical);
    });
  }

  it('rejects non-finite values and malformed Unicode', () => {
    assert.throws(() => canonicalJson(Number.NaN), RangeError);
    assert.throws(() => canonicalJson('\ud800'), TypeError);
  });
});
