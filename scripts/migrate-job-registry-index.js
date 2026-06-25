#!/usr/bin/env node
/**
 * Backfill jobRegistryAddress / chainId and replace global onchainJobId unique index
 * with compound (onchainJobId + jobRegistryAddress).
 *
 * Usage:
 *   LEGACY_JOB_REGISTRY_ADDRESS=0xOldRegistry... node scripts/migrate-job-registry-index.js
 *   node scripts/migrate-job-registry-index.js   # uses JOB_REGISTRY_ADDRESS for all missing rows
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Job = require('../src/models/Job');
const { normalizeRegistryAddress } = require('../src/utils/jobScope');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const currentRegistry = normalizeRegistryAddress(process.env.JOB_REGISTRY_ADDRESS);
  const legacyRegistry = normalizeRegistryAddress(process.env.LEGACY_JOB_REGISTRY_ADDRESS);
  const chainId = Number(process.env.CHAIN_ID || 11155111);

  if (!currentRegistry) {
    console.error('JOB_REGISTRY_ADDRESS is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const collection = Job.collection;

  const missing = await Job.find({
    $or: [{ jobRegistryAddress: { $exists: false } }, { jobRegistryAddress: null }, { jobRegistryAddress: '' }],
  });

  console.log(`Jobs missing jobRegistryAddress: ${missing.length}`);
  for (const job of missing) {
    const registry = legacyRegistry || currentRegistry;
    job.jobRegistryAddress = registry;
    if (!job.chainId) job.chainId = chainId;
    await job.save();
    console.log(`  backfilled job ${job.onchainJobId} → ${registry}`);
  }

  const indexes = await collection.indexes();
  for (const idx of indexes) {
    const keys = Object.keys(idx.key || {});
    if (keys.length === 1 && keys[0] === 'onchainJobId' && idx.unique) {
      console.log(`Dropping legacy index ${idx.name}`);
      await collection.dropIndex(idx.name);
    }
  }

  await Job.syncIndexes();
  console.log('Indexes synced:', (await collection.indexes()).map((i) => i.name).join(', '));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
