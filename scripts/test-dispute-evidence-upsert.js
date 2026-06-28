/**
 * Unit tests for dispute upsert helpers and evidence CID resolution (no MongoDB).
 *
 * Usage: node scripts/test-dispute-evidence-upsert.js
 */
const assert = require('assert');
const { keccak256, toUtf8Bytes } = require('ethers');
const { resolveEvidenceCids, cidToEvidenceHash } = require('../src/utils/evidenceHydrate');

function testCidToEvidenceHash() {
  const cid = 'QmTestDeliverable123';
  const hash = cidToEvidenceHash(cid);
  const expected = keccak256(toUtf8Bytes(cid)).toLowerCase();
  assert.strictEqual(hash, expected);
}

function testResolveEvidenceCidsMergesOnChainHash() {
  const cid = 'bafybeigdyrzt5sfp7udm17hu76uh7yhl2lektxcatyqdkv32uuq5ach4u3';
  const onChainHash = cidToEvidenceHash(cid);
  const list = resolveEvidenceCids([
    { submitter: '0xabc', onChainHash, submittedAt: new Date() },
    { submitter: '0xabc', ipfsHash: cid, description: 'merged' },
  ]);
  assert.strictEqual(list.length, 2);
  const withCid = list.find((e) => e.onChainHash === onChainHash);
  assert.ok(withCid?.ipfsHash === cid, 'onChainHash row should gain ipfsHash from sibling');
}

function testResolveEvidenceCidsBackfillFromHashMap() {
  const cid = 'QmOnlyCidRow';
  const onChainHash = cidToEvidenceHash(cid);
  const list = resolveEvidenceCids([
    { submitter: '0xdef', ipfsHash: cid },
    { submitter: '0xdef', onChainHash },
  ]);
  const orphan = list.find((e) => e.onChainHash && !e.ipfsHash);
  assert.strictEqual(orphan, undefined, 'orphan onChainHash should be backfilled');
  assert.strictEqual(list.find((e) => e.onChainHash === onChainHash)?.ipfsHash, cid);
}

testCidToEvidenceHash();
testResolveEvidenceCidsMergesOnChainHash();
testResolveEvidenceCidsBackfillFromHashMap();
console.log('test-dispute-evidence-upsert: OK');
