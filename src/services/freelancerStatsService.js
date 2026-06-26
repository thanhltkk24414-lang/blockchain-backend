const Job = require('../models/Job');
const Bid = require('../models/Bid');
const contractService = require('./blockchain/contractService');
const { fromUsdcUnits } = require('../utils/usdc');
const logger = require('../utils/logger');

const ONCHAIN_COMPLETED = 5;
const SERVICE_FEE_BPS = 2;

/**
 * Freelancer net payout for a 100% release (approve / timeout / dispute FL win).
 * Matches EscrowVault _splitAndPayout: gross = contractValue, service fee 2%.
 */
function estimateFreelancerNet(contractValueUsdc) {
  const gross = Number(contractValueUsdc) || 0;
  return gross * (1 - SERVICE_FEE_BPS / 100);
}

/**
 * Compute freelancer stats from MongoDB jobs + optional on-chain reconcile.
 */
async function computeFreelancerStats(walletAddress) {
  const address = walletAddress.toLowerCase();

  const completedJobs = await Job.find({
    freelancerAddress: address,
    status: 'COMPLETED',
  }).select('onchainJobId contractValue serviceFee bidAmount');

  const countedOnchainIds = new Set(
    completedJobs.map((j) => j.onchainJobId).filter((id) => id != null),
  );

  let jobsCompleted = completedJobs.length;
  let totalEarned = completedJobs.reduce((sum, job) => {
    if (job.serviceFee != null && job.contractValue != null) {
      return sum + Math.max(0, job.contractValue - job.serviceFee);
    }
    return sum + estimateFreelancerNet(job.contractValue);
  }, 0);

  // Reconcile jobs assigned to this freelancer that may be COMPLETED on-chain but not yet indexed.
  const activeAssignments = await Job.find({
    freelancerAddress: address,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'DISPUTED'] },
    onchainJobId: { $exists: true, $ne: null },
  }).select('onchainJobId contractValue serviceFee status');

  for (const job of activeAssignments) {
    if (countedOnchainIds.has(job.onchainJobId)) continue;
    try {
      const onChain = await contractService.getJob(job.onchainJobId);
      if (onChain?.status !== ONCHAIN_COMPLETED) continue;

      await job.updateStatus('COMPLETED', 'stats_reconcile', '');
      countedOnchainIds.add(job.onchainJobId);
      jobsCompleted += 1;
      totalEarned += estimateFreelancerNet(job.contractValue);
    } catch (err) {
      logger.warn(`Stats reconcile failed for job ${job.onchainJobId}:`, err.message);
    }
  }

  // Fallback: match by accepted bid when freelancerAddress was not synced on Job doc.
  if (jobsCompleted === 0) {
    const acceptedBids = await Bid.find({
      freelancerAddress: address,
      status: 'accepted',
    }).populate('jobId', 'status contractValue serviceFee onchainJobId freelancerAddress');

    for (const bid of acceptedBids) {
      const job = bid.jobId;
      if (!job || job.status !== 'COMPLETED') continue;
      if (job.onchainJobId != null && countedOnchainIds.has(job.onchainJobId)) continue;
      if (job.onchainJobId != null) countedOnchainIds.add(job.onchainJobId);
      jobsCompleted += 1;
      totalEarned += estimateFreelancerNet(job.contractValue ?? bid.bidAmount);
    }
  }

  return {
    jobsCompleted,
    totalEarned: Math.round(totalEarned * 100) / 100,
  };
}

/**
 * Increment cached user stats after FundsReleased (exact on-chain amount).
 */
function freelancerNetFromReleasedEvent(amountUnits) {
  return fromUsdcUnits(amountUnits);
}

module.exports = {
  computeFreelancerStats,
  estimateFreelancerNet,
  freelancerNetFromReleasedEvent,
};
