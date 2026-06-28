const Dispute = require('../models/Dispute');
const Job = require('../models/Job');
const contractService = require('../services/blockchain/contractService');
const logger = require('./logger');
const { jobLookupFilter } = require('./jobScope');

const ONCHAIN_DISPUTED = 4;

/**
 * Ensure a MongoDB Dispute exists for an on-chain job.
 * Creates from chain state when indexer missed DisputeSetup or evidence POST arrives first.
 */
async function ensureDisputeForOnchainJob(onchainJobId, { requireDisputed = true } = {}) {
  const jobNumber = Number(onchainJobId);
  if (!Number.isFinite(jobNumber) || jobNumber <= 0) return null;

  let dispute = await Dispute.findOne({ onchainJobId: jobNumber });
  if (dispute) return dispute;

  const job = await Job.findOne(jobLookupFilter(jobNumber));
  if (!job) {
    logger.warn(`ensureDispute: no Job row for on-chain job ${jobNumber}`);
    return null;
  }

  let onchainJob;
  let onchainDispute;
  try {
    [onchainJob, onchainDispute] = await Promise.all([
      contractService.getJob(jobNumber),
      contractService.getOnchainDispute(jobNumber),
    ]);
  } catch (err) {
    logger.warn(`ensureDispute: chain read failed for job ${jobNumber}: ${err.message}`);
    return null;
  }

  const isDisputedOnChain = onchainJob?.status === ONCHAIN_DISPUTED;
  const hasPanelRecord = Boolean(onchainDispute?.createdAt > 0);

  if (requireDisputed && !isDisputedOnChain && !hasPanelRecord) {
    return null;
  }

  const initiator =
    onchainDispute?.initiator?.toLowerCase?.() ||
    job.clientAddress?.toLowerCase?.() ||
    undefined;

  dispute = new Dispute({
    jobId: job._id,
    onchainJobId: jobNumber,
    initiatorAddress: initiator,
    respondentAddress: job.freelancerAddress?.toLowerCase?.(),
    status: 'OPEN',
    openedAt: hasPanelRecord
      ? new Date(onchainDispute.createdAt * 1000)
      : new Date(),
    round: onchainDispute?.round || 1,
  });

  try {
    const chainEvidences = await contractService.getOnChainEvidences(jobNumber);
    for (const ev of chainEvidences) {
      const hashLower = String(ev.ipfsHash).toLowerCase();
      const exists = dispute.evidence.some(
        (entry) => entry.onChainHash && entry.onChainHash === hashLower,
      );
      if (exists) continue;
      dispute.evidence.push({
        submitter: ev.submitter.toLowerCase(),
        onChainHash: hashLower,
        submittedAt: ev.submittedAt ? new Date(ev.submittedAt * 1000) : new Date(),
      });
    }
  } catch (err) {
    logger.warn(`ensureDispute: could not sync on-chain evidence for job ${jobNumber}: ${err.message}`);
  }

  await dispute.save();

  job.disputeId = dispute._id;
  if (isDisputedOnChain || hasPanelRecord) {
    job.isDisputed = true;
    if (job.status !== 'DISPUTED' && isDisputedOnChain) {
      job.status = 'DISPUTED';
    }
    await job.save();
  }

  logger.info(`Dispute upserted for on-chain job ${jobNumber}`);
  return dispute;
}

module.exports = {
  ensureDisputeForOnchainJob,
};
