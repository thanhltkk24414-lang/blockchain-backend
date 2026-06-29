const Job = require('../models/Job');
const Bid = require('../models/Bid');
const { jobLookupFilter, attachJobScope, getJobRegistryAddress } = require('./jobScope');
const logger = require('./logger');

function normalizeAddr(addr) {
  return addr ? String(addr).toLowerCase() : '';
}

/** Job created by event indexer before API metadata arrives (INDEXER wallet as chain client). */
function isIndexerStubJob(job) {
  if (!job) return false;
  const hasOffChainMeta = Boolean(job.title?.trim() || job.description?.trim() || job.category);
  if (hasOffChainMeta) return false;

  const chainClient = normalizeAddr(job.onchainClientAddress);
  const dbClient = normalizeAddr(job.clientAddress);
  if (chainClient && dbClient === chainClient) return true;

  return !hasOffChainMeta;
}

function canAdoptJobForClient(existingJob, apiClientAddress, onchainClientAddress) {
  const api = normalizeAddr(apiClientAddress);
  const chain = normalizeAddr(onchainClientAddress || existingJob?.onchainClientAddress);

  // On-chain owner is authoritative when reconciling after createJob.
  if (chain && chain === api) return true;

  const db = normalizeAddr(existingJob?.clientAddress);
  if (db === api) return true;
  if (isIndexerStubJob(existingJob)) return true;

  return false;
}

/**
 * Lookup for create/reconcile/indexer — scoped to the active JobRegistry only.
 * Legacy rows without jobRegistryAddress must not block the same onchainJobId on a redeployed registry.
 */
async function findJobForCreate(onchainJobId) {
  return Job.findOne(jobLookupFilter(onchainJobId));
}

/**
 * Resolve duplicate-key races: scoped row first, then legacy/unscoped rows that
 * still block inserts when jobRegistryAddress was missing or from a prior deployment.
 */
async function findConflictingJobForCreate(onchainJobId) {
  const scoped = await findJobForCreate(onchainJobId);
  if (scoped) return scoped;
  return findLegacyJobForMigration(onchainJobId);
}

/** Migration scripts only — finds pre-scope Mongo rows for a given on-chain id. */
async function findLegacyJobForMigration(onchainJobId) {
  const registry = getJobRegistryAddress();
  return Job.findOne({
    onchainJobId: Number(onchainJobId),
    $or: [
      { jobRegistryAddress: { $exists: false } },
      { jobRegistryAddress: null },
      { jobRegistryAddress: '' },
      ...(registry ? [{ jobRegistryAddress: { $ne: registry } }] : []),
    ],
  });
}

function buildCreateJobFields({
  jobId,
  clientAddress,
  onchainClientAddress,
  metadataResult,
  title,
  description,
  category,
  skills,
  contractValue,
  duration,
  deadline,
  onChainJob,
}) {
  const cid =
    typeof metadataResult?.cid === 'string' ? metadataResult.cid.trim() : metadataResult?.cid;
  if (!cid) {
    throw new Error('metadataCID is required');
  }

  const mappedStatus =
    onChainJob?.status === 0 || onChainJob?.status === 'OPEN' ? 'OPEN' : undefined;

  return attachJobScope({
    onchainJobId: jobId,
    clientAddress,
    onchainClientAddress,
    metadataCID: cid,
    title,
    description,
    category,
    skills,
    contractValue,
    duration,
    deadline: onChainJob?.deadline || deadline,
    status: mappedStatus || 'OPEN',
    totalDeposit: contractValue * 1.03,
    platformFee: contractValue * 0.03,
    isActive: true,
    isSynced: true,
  });
}

function shouldClearAssignmentOnOpenChain(chainStatus, mongoStatus, hasMongoFreelancer) {
  if (String(chainStatus).toUpperCase() !== 'OPEN') return false;
  return mongoStatus !== 'OPEN' || Boolean(hasMongoFreelancer);
}

/** Remove proposals and assignment fields left from a prior MongoDB row reusing this onchainJobId. */
async function clearStaleJobAssociations(jobId) {
  const deleted = await Bid.deleteMany({ jobId });
  if (deleted.deletedCount > 0) {
    logger.info(`Cleared ${deleted.deletedCount} stale bid(s) for job ${jobId}`);
  }
}

async function adoptOrMergeJob(existingJob, fields) {
  if (!existingJob) {
    throw new Error('Cannot adopt job: MongoDB row not found');
  }

  await clearStaleJobAssociations(existingJob._id);

  existingJob.clientAddress = fields.clientAddress;
  existingJob.onchainClientAddress = fields.onchainClientAddress;
  existingJob.metadataCID = fields.metadataCID;
  existingJob.title = fields.title;
  existingJob.description = fields.description;
  existingJob.category = fields.category;
  existingJob.skills = fields.skills;
  existingJob.contractValue = fields.contractValue;
  existingJob.duration = fields.duration;
  existingJob.deadline = fields.deadline;
  existingJob.status = fields.status || 'OPEN';
  existingJob.totalDeposit = fields.totalDeposit;
  existingJob.platformFee = fields.platformFee;
  existingJob.freelancerAddress = undefined;
  existingJob.onchainFreelancerAddress = undefined;
  existingJob.deliverableCID = undefined;
  existingJob.assignedAt = undefined;
  existingJob.submittedAt = undefined;
  existingJob.isDisputed = false;
  existingJob.isActive = true;
  if (fields.jobRegistryAddress) {
    existingJob.jobRegistryAddress = fields.jobRegistryAddress;
  }
  if (!existingJob.chainId && fields.chainId) {
    existingJob.chainId = fields.chainId;
  }
  existingJob.isSynced = true;
  await existingJob.save();
  logger.info(
    `Reconciled job ${existingJob.onchainJobId} for API client ${fields.clientAddress} (was indexer stub or race)`,
  );
  return existingJob;
}

/**
 * Align MongoDB with a live JobRegistry read on job detail / browse.
 * Clears stale assignment when chain reports OPEN; syncs winning bid when assigned on-chain.
 */
async function reconcileJobFromChainRead(job, onchain) {
  if (!job || !onchain?.onchainStatus) {
    return { updated: false, warnings: [] };
  }

  const warnings = [];
  let updated = false;
  const chainClient = normalizeAddr(onchain.onchainClientAddress);
  const dbClient = normalizeAddr(job.clientAddress);

  if (chainClient && normalizeAddr(job.onchainClientAddress) !== chainClient) {
    job.onchainClientAddress = chainClient;
    updated = true;
  }

  if (chainClient && dbClient && chainClient !== dbClient) {
    warnings.push({
      code: 'CLIENT_ADDRESS_DRIFT',
      mongoClientAddress: dbClient,
      onchainClientAddress: chainClient,
      hint:
        'MongoDB clientAddress is the API metadata owner; onchainClientAddress is JobRegistry msg.sender. ' +
        'If both should match, re-sync the job or create a new on-chain job id.',
    });
  }

  const chainStatus = String(onchain.onchainStatus).toUpperCase();

  if (chainStatus === 'OPEN') {
    if (shouldClearAssignmentOnOpenChain(chainStatus, job.status, job.freelancerAddress || job.onchainFreelancerAddress)) {
      if (job.freelancerAddress || job.onchainFreelancerAddress) {
        job.freelancerAddress = undefined;
        job.onchainFreelancerAddress = undefined;
        job.assignedAt = undefined;
        updated = true;
      }
      if (job.status !== 'OPEN') {
        const previousStatus = job.status;
        job.status = 'OPEN';
        job.statusHistory = job.statusHistory || [];
        job.statusHistory.push({
          status: 'OPEN',
          note: 'Reset to OPEN from on-chain reconcile (stale MongoDB assignment)',
        });
        updated = true;
        warnings.push({ code: 'STALE_STATUS_RESET', previousStatus });
      }
    }
    // Accepted bids while chain is OPEN are valid (client accepted, awaiting depositEscrow).
  } else if (onchain.onchainFreelancerAddress) {
    const norm = normalizeAddr(onchain.onchainFreelancerAddress);
    if (job.onchainFreelancerAddress !== onchain.onchainFreelancerAddress) {
      job.onchainFreelancerAddress = onchain.onchainFreelancerAddress;
      updated = true;
    }
    if (norm && job.freelancerAddress !== norm) {
      job.freelancerAddress = norm;
      updated = true;
    }

    const winnerSync = await Bid.updateMany(
      { jobId: job._id, freelancerAddress: norm, status: { $in: ['pending', 'rejected'] } },
      { $set: { status: 'accepted' } },
    );
    if (winnerSync.modifiedCount > 0) {
      updated = true;
      warnings.push({ code: 'WINNING_BID_ACCEPTED_FROM_CHAIN', count: winnerSync.modifiedCount });
    }
    await Bid.updateMany(
      { jobId: job._id, freelancerAddress: { $ne: norm }, status: 'pending' },
      { $set: { status: 'rejected' } },
    );
  }

  if (updated) {
    await job.save();
    logger.info(`Job ${job.onchainJobId} reconciled from chain read (${warnings.length} warning(s))`);
  }

  return { updated, warnings };
}

/**
 * After a successful on-chain createJob, persist or merge MongoDB record.
 * Handles event-indexer race and partial failures from prior attempts.
 */
async function reconcileJobAfterOnchainCreate(jobId, apiClientAddress, fields, onchainClientAddress) {
  const existingJob = await findJobForCreate(jobId);
  if (existingJob) {
    if (canAdoptJobForClient(existingJob, apiClientAddress, onchainClientAddress)) {
      const job = await adoptOrMergeJob(existingJob, fields);
      return { action: 'reconciled', job };
    }
    return { action: 'collision', job: existingJob };
  }

  try {
    const job = new Job(fields);
    await job.save();
    return { action: 'created', job };
  } catch (error) {
    if (error?.code !== 11000 && error?.code !== 11001) {
      throw error;
    }

    const raced = await findConflictingJobForCreate(jobId);
    if (raced && canAdoptJobForClient(raced, apiClientAddress, onchainClientAddress)) {
      const job = await adoptOrMergeJob(raced, fields);
      return { action: 'reconciled', job };
    }
    return { action: 'duplicate', job: raced };
  }
}

module.exports = {
  normalizeAddr,
  isIndexerStubJob,
  canAdoptJobForClient,
  findJobForCreate,
  findConflictingJobForCreate,
  findLegacyJobForMigration,
  buildCreateJobFields,
  clearStaleJobAssociations,
  adoptOrMergeJob,
  reconcileJobAfterOnchainCreate,
  reconcileJobFromChainRead,
  shouldClearAssignmentOnOpenChain,
};
