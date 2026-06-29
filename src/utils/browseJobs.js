const ZERO_ADDRESS_RE = /^0x0{40}$/i;

/** Job accepted off-chain but depositEscrow not yet confirmed on-chain. */
function isPendingEscrowJob(job) {
  const onchainFreelancer = job?.onchainFreelancerAddress;
  if (onchainFreelancer == null || onchainFreelancer === '') return true;
  const normalized = String(onchainFreelancer).trim().toLowerCase();
  return !normalized || normalized === '0x0' || ZERO_ADDRESS_RE.test(normalized);
}

/**
 * Mongo filter for public browse: OPEN jobs plus legacy rows marked ASSIGNED
 * while on-chain freelancer is still unset (escrow not deposited).
 */
function buildPublicOpenJobsOrClause() {
  return [
    { status: 'OPEN' },
    {
      status: 'ASSIGNED',
      $or: [
        { onchainFreelancerAddress: { $exists: false } },
        { onchainFreelancerAddress: null },
        { onchainFreelancerAddress: '' },
        { onchainFreelancerAddress: ZERO_ADDRESS_RE },
      ],
    },
  ];
}

/** Terminal statuses set isActive=false in Job.updateStatus — browse must still list them. */
const TERMINAL_BROWSE_STATUSES = new Set(['COMPLETED', 'REFUNDED', 'CANCELLED']);

/** Mongo filter for disputed jobs (status drift or indexer-only isDisputed flag). */
function buildDisputedJobsMongoFilter() {
  return {
    onchainJobId: { $exists: true, $ne: null },
    $or: [{ status: 'DISPUTED' }, { isDisputed: true }],
  };
}

function applyBrowseStatusFilter(baseQuery = {}, status) {
  const query = { ...baseQuery };
  if (!status) {
    query.isActive = true;
    return query;
  }

  const normalized = String(status).toUpperCase();
  if (normalized === 'OPEN') {
    query.isActive = true;
    delete query.status;
    query.$or = buildPublicOpenJobsOrClause();
    return query;
  }

  if (normalized === 'DISPUTED') {
    delete query.isActive;
    query.$or = [{ status: 'DISPUTED' }, { isDisputed: true }];
    return query;
  }

  if (TERMINAL_BROWSE_STATUSES.has(normalized)) {
    query.status = normalized;
    return query;
  }

  query.isActive = true;
  query.status = normalized;
  return query;
}

function mapJobForBrowseListing(job, requestedStatus) {
  const json = typeof job.toObject === 'function' ? job.toObject({ virtuals: true }) : { ...job };
  if (requestedStatus && String(requestedStatus).toUpperCase() === 'OPEN') {
    if (json.status === 'ASSIGNED' && isPendingEscrowJob(json)) {
      return { ...json, status: 'OPEN', escrowPending: true };
    }
  }
  return json;
}

/**
 * Drop ASSIGNED+pending rows that are no longer OPEN on-chain (indexer lag on onchainFreelancerAddress).
 */
async function finalizeBrowseOpenListings(jobs, requestedStatus, contractService) {
  const normalized = requestedStatus ? String(requestedStatus).toUpperCase() : '';
  if (normalized !== 'OPEN') {
    return jobs.map((job) => mapJobForBrowseListing(job, requestedStatus));
  }

  const listings = [];
  for (const job of jobs) {
    const json = mapJobForBrowseListing(job, requestedStatus);
    if (
      json.escrowPending &&
      contractService?.isValidOnchainJobId?.(json.onchainJobId)
    ) {
      try {
        const view = await contractService.getOnchainJobView(json.onchainJobId);
        if (view.onchainStatus && view.onchainStatus !== 'OPEN') {
          continue;
        }
      } catch {
        // RPC read failed — keep listing rather than hide jobs.
      }
    }
    listings.push(json);
  }
  return listings;
}

/**
 * Reconcile DISPUTED browse rows with JobRegistry and hide stale isDisputed flags.
 */
async function finalizeBrowseDisputedListings(jobs, requestedStatus, contractService) {
  const normalized = requestedStatus ? String(requestedStatus).toUpperCase() : '';
  if (normalized !== 'DISPUTED' || !contractService?.getOnchainJobView) {
    return jobs.map((job) => mapJobForBrowseListing(job, requestedStatus));
  }

  const { reconcileJobFromChainRead } = require('./jobReconcile');
  const listings = [];

  for (const job of jobs) {
    const json = mapJobForBrowseListing(job, requestedStatus);
    if (!contractService.isValidOnchainJobId?.(json.onchainJobId)) {
      listings.push(json);
      continue;
    }

    try {
      const view = await contractService.getOnchainJobView(json.onchainJobId);
      if (view?.onchainStatus === 'DISPUTED') {
        if (typeof job.save === 'function') {
          await reconcileJobFromChainRead(job, view);
          listings.push(mapJobForBrowseListing(job, requestedStatus));
        } else {
          listings.push({ ...json, status: 'DISPUTED', isDisputed: true });
        }
      } else if (view?.onchainStatus && view.onchainStatus !== 'DISPUTED') {
        continue;
      } else {
        listings.push(json);
      }
    } catch {
      listings.push(json);
    }
  }

  return listings;
}

module.exports = {
  isPendingEscrowJob,
  buildPublicOpenJobsOrClause,
  buildDisputedJobsMongoFilter,
  applyBrowseStatusFilter,
  mapJobForBrowseListing,
  finalizeBrowseOpenListings,
  finalizeBrowseDisputedListings,
};
