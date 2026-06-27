#!/usr/bin/env node
/** Query Mongo job by _id or onchainJobId */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Job = require('../src/models/Job');

const id = process.argv[2] || '6a3cd6d25b8814fb0d405dcd';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGODB_URI in backend/.env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  let job = await Job.findById(id);
  if (!job && /^\d+$/.test(id)) {
    job = await Job.findOne({ onchainJobId: Number(id) });
  }
  if (!job) {
    console.log('Job not found:', id);
    process.exit(1);
  }
  console.log(JSON.stringify({
    _id: job._id.toString(),
    onchainJobId: job.onchainJobId,
    status: job.status,
    deliverableCID: job.deliverableCID,
    freelancerAddress: job.freelancerAddress,
    clientAddress: job.clientAddress,
    submittedAt: job.submittedAt,
    assignedAt: job.assignedAt,
    lastSyncedBlock: job.lastSyncedBlock,
    statusHistory: job.statusHistory?.slice(-5),
  }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
