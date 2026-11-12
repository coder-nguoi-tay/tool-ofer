import assert from 'node:assert/strict';
import test from 'node:test';
import { isClosedTargetError } from '../src/browser/actions/is-closed-target-error.mjs';

test('isClosedTargetError: tab/context/browser đã đóng là va chạm vô hại', () => {
  assert.equal(isClosedTargetError(new Error('cdpSession.send: Target page, context or browser has been closed')), true);
  assert.equal(isClosedTargetError(new Error('Protocol error (Target.attachToTarget): Target closed')), true);
  assert.equal(isClosedTargetError(new Error('boom'), { isClosed: () => true }), true);
  assert.equal(isClosedTargetError(new Error('Protocol error: Emulation.setUserAgentOverride failed'), { isClosed: () => false }), false);
  assert.equal(isClosedTargetError(null), false);
});
