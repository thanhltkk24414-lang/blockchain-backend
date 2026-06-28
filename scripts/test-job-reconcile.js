/**
 * Unit tests for registry-scoped job lookup (no MongoDB required).
 *
 * Usage: node scripts/test-job-reconcile.js
 */
const assert = require('assert');
const { canAdoptJobForClient } = require('../src/utils/jobReconcile');

function testAdoptWhenOnchainClientMatchesApi() {
  const existing = {
    clientAddress: '0x523ebd853a1638065f148a05c0ca423e490d92f7',
    onchainClientAddress: '0x523ebd853a1638065f148a05c0ca423e490d92f7',
    title: 'Legacy demo job',
    category: 'marketing',
  };
  const apiClient = '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b';
  const onchainClient = '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b';
  assert.strictEqual(canAdoptJobForClient(existing, apiClient, onchainClient), true);
}

function testRejectUnrelatedOwner() {
  const existing = {
    clientAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    onchainClientAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Someone else',
    category: 'design',
  };
  const apiClient = '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b';
  const onchainClient = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.strictEqual(canAdoptJobForClient(existing, apiClient, onchainClient), false);
}

function testIndexerStubAdopt() {
  const existing = {
    clientAddress: '0x523ebd853a1638065f148a05c0ca423e490d92f7',
    onchainClientAddress: '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b',
    metadataCID: 'QmTest',
  };
  const apiClient = '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b';
  assert.strictEqual(canAdoptJobForClient(existing, apiClient, apiClient), true);
}

testAdoptWhenOnchainClientMatchesApi();
testRejectUnrelatedOwner();
testIndexerStubAdopt();
console.log('test-job-reconcile: OK');
