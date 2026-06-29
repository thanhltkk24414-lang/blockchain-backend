/**
 * Unit tests for quorum-failed on-chain assessment (no RPC required).
 *
 * Usage: node scripts/test-quorum-failed.js
 */
const assert = require('assert');
const { isQuorumFailedOnChainDispute } = require('../src/utils/quorumFailed');
const { revealEndSec } = require('../src/utils/disputeTimings');

const createdAt = 1_700_000_000;
const afterReveal = revealEndSec(createdAt) + 1;
const duringReveal = revealEndSec(createdAt) - 60;

function testQuorumFailedAfterRevealWindow() {
  assert.strictEqual(
    isQuorumFailedOnChainDispute(
      { createdAt, revealCount: 2, isResolved: false, pendingResult: 0 },
      afterReveal,
    ),
    true,
  );
}

function testZeroRevealsAfterRevealWindow() {
  assert.strictEqual(
    isQuorumFailedOnChainDispute(
      { createdAt, revealCount: 0, isResolved: false, pendingResult: 0 },
      afterReveal,
    ),
    true,
  );
}

function testHiddenDuringRevealWindow() {
  assert.strictEqual(
    isQuorumFailedOnChainDispute(
      { createdAt, revealCount: 1, isResolved: false, pendingResult: 0 },
      duringReveal,
    ),
    false,
  );
}

function testHiddenWhenQuorumMet() {
  assert.strictEqual(
    isQuorumFailedOnChainDispute(
      { createdAt, revealCount: 3, isResolved: false, pendingResult: 0 },
      afterReveal,
    ),
    false,
  );
}

function testHiddenWhenFinalizedWithResult() {
  assert.strictEqual(
    isQuorumFailedOnChainDispute(
      { createdAt, revealCount: 2, isResolved: true, pendingResult: 1 },
      afterReveal,
    ),
    false,
  );
}

testQuorumFailedAfterRevealWindow();
testZeroRevealsAfterRevealWindow();
testHiddenDuringRevealWindow();
testHiddenWhenQuorumMet();
testHiddenWhenFinalizedWithResult();
console.log('test-quorum-failed: OK');
