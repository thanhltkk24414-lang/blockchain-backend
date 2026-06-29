/**
 * Unit tests for registry-scoped job lookup (no MongoDB required).
 *
 * Usage: node scripts/test-job-reconcile.js
 */
const assert = require('assert');
const {
  canAdoptJobForClient,
  shouldClearAssignmentOnOpenChain,
  reconcileJobFromChainRead,
} = require('../src/utils/jobReconcile');

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

function testChainOwnerOverridesStaleDbClient() {
  const existing = {
    clientAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    onchainClientAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Stale owner row',
    category: 'design',
  };
  const apiClient = '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b';
  const onchainClient = '0xbd2975d8b1a923f1ad80046791bf4cc5570d616b';
  assert.strictEqual(canAdoptJobForClient(existing, apiClient, onchainClient), true);
}

function testClearAssignmentWhenChainOpenButMongoAssigned() {
  assert.strictEqual(
    shouldClearAssignmentOnOpenChain('OPEN', 'ASSIGNED', true),
    true,
  );
  assert.strictEqual(
    shouldClearAssignmentOnOpenChain('OPEN', 'OPEN', false),
    false,
  );
  assert.strictEqual(
    shouldClearAssignmentOnOpenChain('ASSIGNED', 'ASSIGNED', true),
    false,
  );
}

async function testReconcileDisputedFromChain() {
  const job = {
    status: 'SUBMITTED',
    isDisputed: false,
    statusHistory: [],
    onchainJobId: 17,
    save: async function save() {
      this.saved = true;
    },
  };
  const result = await reconcileJobFromChainRead(job, { onchainStatus: 'DISPUTED' });
  assert.strictEqual(result.updated, true);
  assert.strictEqual(job.status, 'DISPUTED');
  assert.strictEqual(job.isDisputed, true);
  assert.ok(job.statusHistory.some((row) => row.status === 'DISPUTED'));
}

testAdoptWhenOnchainClientMatchesApi();
testRejectUnrelatedOwner();
testIndexerStubAdopt();
testChainOwnerOverridesStaleDbClient();
testClearAssignmentWhenChainOpenButMongoAssigned();
void testReconcileDisputedFromChain().then(() => {
  const contractService = require('../src/services/blockchain/contractService');
  assert.strictEqual(contractService.isChainStatusAhead('DISPUTED', 'SUBMITTED'), true);
  assert.strictEqual(contractService.isChainStatusAhead('SUBMITTED', 'DISPUTED'), false);
  console.log('test-job-reconcile: OK');
});
