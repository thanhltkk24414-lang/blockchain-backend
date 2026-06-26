const Job = require('../models/Job');
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
  const db = normalizeAddr(existingJob?.clientAddress);
  if (db === api) return true;
  if (isIndexerStubJob(existingJob)) return true;

  const chain = normalizeAddr(onchainClientAddress || existingJob?.onchainClientAddress);
  if (chain && db === chain) return true;

  return false;
}

async function findJobForCreate(onchainJobId) {
  const scoped = jobLookupFilter(onchainJobId);
  let job = await Job.findOne(scoped);
  if (job) return job;

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
  const mappedStatus =
    onChainJob?.status === 0 || onChainJob?.status === 'OPEN' ? 'OPEN' : undefined;

  return attachJobScope({
    onchainJobId: jobId,
    clientAddress,
    onchainClientAddress,
    metadataCID: metadataResult.cid,
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

async function adoptOrMergeJob(existingJob, fields) {
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
  if (!existingJob.jobRegistryAddress && fields.jobRegistryAddress) {
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

    const raced = await findJobForCreate(jobId);
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
  buildCreateJobFields,
  adoptOrMergeJob,
  reconcileJobAfterOnchainCreate,
};
