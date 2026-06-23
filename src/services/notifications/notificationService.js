const socketService = require('./socketService');

function buildPayload(job, eventType, extra = {}) {
  return {
    eventType,
    onchainJobId: job.onchainJobId,
    status: job.status,
    clientAddress: job.clientAddress,
    freelancerAddress: job.freelancerAddress || null,
    isDisputed: Boolean(job.isDisputed),
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Publish job/escrow notifications to connected clients.
 * Called from event indexer and realtime EscrowVault listener.
 */
function notifyJobChange(job, eventType, extra = {}) {
  if (!socketService.isReady() || !job) return;

  const payload = buildPayload(job, eventType, extra);
  socketService.emitToJobParticipants('job:updated', payload);
  socketService.emitToJobParticipants(eventType, payload);
}

function notifyDispute(dispute, job, eventType, extra = {}) {
  if (!socketService.isReady()) return;

  const payload = {
    eventType,
    onchainJobId: dispute.onchainJobId,
    disputeId: dispute._id?.toString(),
    status: dispute.status,
    result: dispute.result || null,
    clientAddress: job?.clientAddress || dispute.initiatorAddress,
    freelancerAddress: job?.freelancerAddress || dispute.respondentAddress,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  socketService.emitToJobParticipants('dispute:updated', payload);
  socketService.emitToJobParticipants(eventType, payload);
}

module.exports = {
  notifyJobChange,
  notifyDispute,
};
