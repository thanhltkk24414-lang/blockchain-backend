/**
 * Unit tests for browse registry scoping.
 *
 * Usage: node scripts/test-browse-registry-scope.js
 */
const assert = require('assert');
const { applyCurrentRegistryScope } = require('../src/utils/jobScope');
const { applyBrowseStatusFilter } = require('../src/utils/browseJobs');

const ORIGINAL = process.env.JOB_REGISTRY_ADDRESS;
process.env.JOB_REGISTRY_ADDRESS = '0x302629f82d51b0972ffc3a99cbe355f4acef908d';

try {
  const scoped = applyCurrentRegistryScope({ category: 'design' });
  assert.strictEqual(scoped.jobRegistryAddress, '0x302629f82d51b0972ffc3a99cbe355f4acef908d');
  assert.strictEqual(scoped.category, 'design');

  const browse = applyBrowseStatusFilter(applyCurrentRegistryScope({}), 'OPEN');
  assert.strictEqual(browse.isActive, true);
  assert.strictEqual(browse.jobRegistryAddress, '0x302629f82d51b0972ffc3a99cbe355f4acef908d');
  assert.ok(Array.isArray(browse.$or));

  console.log('test-browse-registry-scope: OK');
} finally {
  if (ORIGINAL === undefined) delete process.env.JOB_REGISTRY_ADDRESS;
  else process.env.JOB_REGISTRY_ADDRESS = ORIGINAL;
}
