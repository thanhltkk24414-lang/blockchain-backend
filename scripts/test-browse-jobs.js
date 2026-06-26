const assert = require('assert');
const {
  isPendingEscrowJob,
  applyBrowseStatusFilter,
  mapJobForBrowseListing,
} = require('../src/utils/browseJobs');

assert.strictEqual(
  isPendingEscrowJob({ onchainFreelancerAddress: null }),
  true,
);
assert.strictEqual(
  isPendingEscrowJob({ onchainFreelancerAddress: '0x0000000000000000000000000000000000000000' }),
  true,
);
assert.strictEqual(
  isPendingEscrowJob({ onchainFreelancerAddress: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca' }),
  false,
);

const openQuery = applyBrowseStatusFilter({ category: 'dev' }, 'OPEN');
assert.ok(openQuery.$or);
assert.strictEqual(openQuery.category, 'dev');
assert.strictEqual(openQuery.isActive, true);

const mapped = mapJobForBrowseListing(
  {
    status: 'ASSIGNED',
    onchainFreelancerAddress: '',
    title: 't',
  },
  'OPEN',
);
assert.strictEqual(mapped.status, 'OPEN');
assert.strictEqual(mapped.escrowPending, true);

console.log('browseJobs utils: ok');
