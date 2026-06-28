/**
 * Unit tests for browse registry scoping.
 *
 * Usage: node scripts/test-browse-registry-scope.js
 */
const assert = require('assert');
const {
  applyBrowseRegistryScope,
  applyCurrentRegistryScope,
  getLegacyJobRegistryAddress,
} = require('../src/utils/jobScope');
const { applyBrowseStatusFilter } = require('../src/utils/browseJobs');

const ORIGINAL_REGISTRY = process.env.JOB_REGISTRY_ADDRESS;
const ORIGINAL_LEGACY = process.env.LEGACY_JOB_REGISTRY_ADDRESS;

process.env.JOB_REGISTRY_ADDRESS = '0x302629f82d51b0972ffc3a99cbe355f4acef908d';
process.env.LEGACY_JOB_REGISTRY_ADDRESS = '0xe5425cfe21bae73d54138bb290b671bf4c55fbc9';

try {
  const strict = applyCurrentRegistryScope({ category: 'design' });
  assert.strictEqual(strict.jobRegistryAddress, '0x302629f82d51b0972ffc3a99cbe355f4acef908d');
  assert.strictEqual(strict.category, 'design');

  const browseScoped = applyBrowseRegistryScope({ category: 'design' });
  assert.ok(Array.isArray(browseScoped.$and));
  assert.strictEqual(browseScoped.$and.length, 1);
  assert.ok(Array.isArray(browseScoped.$and[0].$or));
  assert.strictEqual(browseScoped.$and[0].$or[0].jobRegistryAddress, '0x302629f82d51b0972ffc3a99cbe355f4acef908d');
  assert.ok(browseScoped.$and[0].$or.some((clause) => clause.jobRegistryAddress === null));

  const browse = applyBrowseStatusFilter(applyBrowseRegistryScope({}), 'OPEN');
  assert.strictEqual(browse.isActive, true);
  assert.ok(Array.isArray(browse.$and));
  assert.ok(Array.isArray(browse.$or));

  assert.strictEqual(
    getLegacyJobRegistryAddress(),
    '0xe5425cfe21bae73d54138bb290b671bf4c55fbc9',
  );

  console.log('test-browse-registry-scope: OK');
} finally {
  if (ORIGINAL_REGISTRY === undefined) delete process.env.JOB_REGISTRY_ADDRESS;
  else process.env.JOB_REGISTRY_ADDRESS = ORIGINAL_REGISTRY;
  if (ORIGINAL_LEGACY === undefined) delete process.env.LEGACY_JOB_REGISTRY_ADDRESS;
  else process.env.LEGACY_JOB_REGISTRY_ADDRESS = ORIGINAL_LEGACY;
}
