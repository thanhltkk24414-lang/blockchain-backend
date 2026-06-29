/**
 * Unit tests for browse status filters (no MongoDB required).
 *
 * Usage: node scripts/test-browse-jobs.js
 */
const assert = require('assert');
const {
  applyBrowseStatusFilter,
  buildPublicOpenJobsOrClause,
} = require('../src/utils/browseJobs');

function testOpenFilter() {
  const q = applyBrowseStatusFilter({}, 'OPEN');
  assert.strictEqual(q.isActive, true);
  assert.ok(Array.isArray(q.$or));
  assert.strictEqual(q.status, undefined);
}

function testCompletedFilter() {
  const q = applyBrowseStatusFilter({}, 'COMPLETED');
  assert.strictEqual(q.status, 'COMPLETED');
  assert.strictEqual(q.isActive, undefined);
}

function testDisputedFilter() {
  const q = applyBrowseStatusFilter({}, 'DISPUTED');
  assert.strictEqual(q.isActive, undefined);
  assert.ok(q.$or.some((c) => c.status === 'DISPUTED'));
  assert.ok(q.$or.some((c) => c.isDisputed === true));
}

function testDisputedJobsMongoFilter() {
  const { buildDisputedJobsMongoFilter } = require('../src/utils/browseJobs');
  const q = buildDisputedJobsMongoFilter();
  assert.ok(q.onchainJobId);
  assert.ok(q.$or.some((c) => c.status === 'DISPUTED'));
  assert.ok(q.$or.some((c) => c.isDisputed === true));
}

function testPublicOpenClause() {
  const clause = buildPublicOpenJobsOrClause();
  assert.ok(clause.some((c) => c.status === 'OPEN'));
  assert.ok(clause.some((c) => c.status === 'ASSIGNED'));
}

testOpenFilter();
testCompletedFilter();
testDisputedFilter();
testDisputedJobsMongoFilter();
testPublicOpenClause();
console.log('test-browse-jobs: OK');
