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

function freelancerNetForJob(job, bidAmount) {
  if (job.serviceFee != null && job.contractValue != null) {
    return Math.max(0, job.contractValue - job.serviceFee);
  }
  return estimateFreelancerNet(job.contractValue ?? bidAmount);
}

function completionDateForJob(job) {
  if (job.completedAt) return new Date(job.completedAt * 1000);
  const fromHistory = [...(job.statusHistory || [])]
    .reverse()
    .find((entry) => entry.status === 'COMPLETED');
  if (fromHistory?.timestamp) return new Date(fromHistory.timestamp);
  if (job.updatedAt) return new Date(job.updatedAt);
  if (job.createdAt) return new Date(job.createdAt);
  return null;
}

function buildEarningsByMonth(completedEntries) {
  const buckets = new Map();

  for (const { job, net } of completedEntries) {
    const date = completionDateForJob(job);
    if (!date || Number.isNaN(date.getTime())) continue;
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    buckets.set(label, (buckets.get(label) ?? 0) + net);
  }

  return [...buckets.entries()]
    .map(([label, earned]) => ({ label, earned: Math.round(earned * 100) / 100 }))
    .slice(-6);
}

/**
 * Compute freelancer stats from MongoDB jobs + optional on-chain reconcile.
 */
async function computeFreelancerStats(walletAddress) {
  const address = walletAddress.toLowerCase();
  const completedEntries = [];

  const completedJobs = await Job.find({
    freelancerAddress: address,
    status: 'COMPLETED',
  }).select('onchainJobId contractValue serviceFee bidAmount completedAt statusHistory updatedAt createdAt');

  const countedOnchainIds = new Set(
    completedJobs.map((j) => j.onchainJobId).filter((id) => id != null),
  );

  for (const job of completedJobs) {
    completedEntries.push({ job, net: freelancerNetForJob(job) });
  }

  let jobsCompleted = completedJobs.length;
  let totalEarned = completedEntries.reduce((sum, entry) => sum + entry.net, 0);

  // Reconcile jobs assigned to this freelancer that may be COMPLETED on-chain but not yet indexed.
  const activeAssignments = await Job.find({
    freelancerAddress: address,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'DISPUTED'] },
    onchainJobId: { $exists: true, $ne: null },
  }).select('onchainJobId contractValue serviceFee status completedAt statusHistory updatedAt createdAt');

  for (const job of activeAssignments) {
    if (countedOnchainIds.has(job.onchainJobId)) continue;
    try {
      const onChain = await contractService.getJob(job.onchainJobId);
      if (onChain?.status !== ONCHAIN_COMPLETED) continue;

      await job.updateStatus('COMPLETED', 'stats_reconcile', '');
      countedOnchainIds.add(job.onchainJobId);
      jobsCompleted += 1;
      const net = freelancerNetForJob(job);
      totalEarned += net;
      completedEntries.push({ job, net });
    } catch (err) {
      logger.warn(`Stats reconcile failed for job ${job.onchainJobId}:`, err.message);
    }
  }

  // Fallback: match by accepted bid when freelancerAddress was not synced on Job doc.
  if (jobsCompleted === 0) {
    const acceptedBids = await Bid.find({
      freelancerAddress: address,
      status: 'accepted',
    }).populate('jobId', 'status contractValue serviceFee onchainJobId freelancerAddress completedAt statusHistory updatedAt createdAt');

    for (const bid of acceptedBids) {
      const job = bid.jobId;
      if (!job || job.status !== 'COMPLETED') continue;
      if (job.onchainJobId != null && countedOnchainIds.has(job.onchainJobId)) continue;
      if (job.onchainJobId != null) countedOnchainIds.add(job.onchainJobId);
      jobsCompleted += 1;
      const net = freelancerNetForJob(job, bid.bidAmount);
      totalEarned += net;
      completedEntries.push({ job, net });
    }
  }

  return {
    jobsCompleted,
    totalEarned: Math.round(totalEarned * 100) / 100,
    earningsByMonth: buildEarningsByMonth(completedEntries),
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
