import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelSpinProgress } from '../../apps/web/src/scripts/spin-motion.ts';

test('wheel motion is bounded, monotonic and lands exactly on the committed target', () => {
  assert.equal(wheelSpinProgress(-1), 0);
  assert.equal(wheelSpinProgress(0), 0);
  assert.equal(wheelSpinProgress(1), 1);
  assert.equal(wheelSpinProgress(2), 1);
  let previous = 0;
  for (let step = 1; step <= 1000; step += 1) {
    const value = wheelSpinProgress(step / 1000);
    assert.ok(value > previous, `motion must keep moving at ${step / 1000}`);
    previous = value;
  }
});

test('wheel motion has continuous position and velocity at the acceleration and travel transitions', () => {
  const epsilon = 1e-6;
  for (const boundary of [0.15, 0.65]) {
    const left = wheelSpinProgress(boundary - epsilon);
    const at = wheelSpinProgress(boundary);
    const right = wheelSpinProgress(boundary + epsilon);
    assert.ok(left < at && at < right, `position must be continuous at ${boundary}`);
    const incomingSpeed = (at - left) / epsilon;
    const outgoingSpeed = (right - at) / epsilon;
    assert.ok(Math.abs(incomingSpeed - outgoingSpeed) < 0.00001, `velocity must be continuous at ${boundary}`);
  }
});
