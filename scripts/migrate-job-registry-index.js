/**
 * One-time migration: tag pre-redeploy MongoDB jobs with LEGACY_JOB_REGISTRY_ADDRESS
 * so they no longer collide with onchainJobIds on the redeployed JobRegistry.
 *
 * Usage (from backend/):
 *   LEGACY_JOB_REGISTRY_ADDRESS=0xE5425cFE21BAe73d54138Bb290B671bF4c55FBC9 \
 *   JOB_REGISTRY_ADDRESS=0x302629f82d51b0972ffc3A99cbE355F4acEf908d \
 *   node scripts/migrate-job-registry-index.js
 *
 * Add --dry-run to preview counts without writing.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('../src/models/Job');
const {
  getJobRegistryAddress,
  getLegacyJobRegistryAddress,
  normalizeRegistryAddress,
} = require('../src/utils/jobScope');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const current = getJobRegistryAddress();
  const legacy =
    getLegacyJobRegistryAddress() ||
    normalizeRegistryAddress('0xE5425cFE21BAe73d54138Bb290B671bF4c55FBC9');

  if (!current) {
    throw new Error('JOB_REGISTRY_ADDRESS must be set');
  }
  if (!legacy) {
    throw new Error('LEGACY_JOB_REGISTRY_ADDRESS must be set');
  }
  if (current === legacy) {
    throw new Error('LEGACY_JOB_REGISTRY_ADDRESS must differ from JOB_REGISTRY_ADDRESS');
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected. current=${current} legacy=${legacy} dryRun=${dryRun}`);

  const filter = {
    onchainJobId: { $exists: true },
    $or: [
      { jobRegistryAddress: { $exists: false } },
      { jobRegistryAddress: null },
      { jobRegistryAddress: '' },
      { jobRegistryAddress: { $ne: current } },
    ],
  };

  const toMigrate = await Job.find(filter).select('onchainJobId jobRegistryAddress clientAddress');
  console.log(`Found ${toMigrate.length} job(s) to tag as legacy`);

  for (const job of toMigrate.slice(0, 20)) {
    console.log(
      `  id=${job.onchainJobId} registry=${job.jobRegistryAddress || '(none)'} client=${job.clientAddress}`,
    );
  }
  if (toMigrate.length > 20) {
    console.log(`  ... and ${toMigrate.length - 20} more`);
  }

  if (!dryRun && toMigrate.length > 0) {
    const result = await Job.updateMany(filter, {
      $set: { jobRegistryAddress: legacy, chainId: Number(process.env.CHAIN_ID || 11155111) },
    });
    console.log(`Updated ${result.modifiedCount} document(s)`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
