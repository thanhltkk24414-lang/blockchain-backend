/**
 * Unit tests for job create reconciliation (no MongoDB required).
 *
 * Usage: node scripts/test-job-reconcile.js
 */
const assert = require('assert');
const {
  isIndexerStubJob,
  canAdoptJobForClient,
  normalizeAddr,
} = require('../src/utils/jobReconcile');

function testNormalizeAddr() {
  assert.strictEqual(normalizeAddr('0xAbC'), '0xabc');
  assert.strictEqual(normalizeAddr(null), '');
}

function testIndexerStub() {
  assert.strictEqual(
    isIndexerStubJob({
      clientAddress: '0xindexer',
      onchainClientAddress: '0xindexer',
      title: '',
      description: '',
    }),
    true,
  );
  assert.strictEqual(
    isIndexerStubJob({
      clientAddress: '0xindexer',
      onchainClientAddress: '0xindexer',
      title: 'Audit job',
    }),
    false,
  );
}

function testCanAdopt() {
  const api = '0xuser';
  const indexer = '0xindexer';

  assert.strictEqual(
    canAdoptJobForClient({ clientAddress: api }, api, indexer),
    true,
  );

  assert.strictEqual(
    canAdoptJobForClient(
      { clientAddress: indexer, onchainClientAddress: indexer },
      api,
      indexer,
    ),
    true,
  );

  assert.strictEqual(
    canAdoptJobForClient(
      { clientAddress: '0xother', title: 'Taken job', description: 'x' },
      api,
      indexer,
    ),
    false,
  );
}

function main() {
  testNormalizeAddr();
  testIndexerStub();
  testCanAdopt();
  console.log('✓ job reconcile unit tests passed');
}

main();
