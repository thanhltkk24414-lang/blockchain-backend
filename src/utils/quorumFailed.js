const { DISPUTE_QUORUM, revealEndSec } = require('./disputeTimings');

/**
 * On-chain dispute is quorum-failed when reveal window ended, valid reveals < quorum,
 * and voting is not finalized with a pending result (force-resolve still needed).
 */
function isQuorumFailedOnChainDispute(dispute, nowSec = Math.floor(Date.now() / 1000)) {
  if (!dispute?.createdAt) return false;

  const revealEnded = nowSec > revealEndSec(dispute.createdAt);
  if (!revealEnded) return false;

  const revealCount = Number(dispute.revealCount ?? 0);
  if (revealCount >= DISPUTE_QUORUM) return false;

  if (dispute.isResolved && Number(dispute.pendingResult ?? 0) > 0) return false;

  return true;
}

module.exports = {
  isQuorumFailedOnChainDispute,
};
