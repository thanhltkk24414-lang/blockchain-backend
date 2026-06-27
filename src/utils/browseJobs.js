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

function applyBrowseStatusFilter(baseQuery = {}, status) {
  const query = { isActive: true, ...baseQuery };
  if (!status) return query;

  const normalized = String(status).toUpperCase();
  if (normalized === 'OPEN') {
    delete query.status;
    query.$or = buildPublicOpenJobsOrClause();
    return query;
  }

  if (normalized === 'DISPUTED') {
    query.$or = [{ status: 'DISPUTED' }, { isDisputed: true }];
    return query;
  }

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

module.exports = {
  isPendingEscrowJob,
  buildPublicOpenJobsOrClause,
  applyBrowseStatusFilter,
  mapJobForBrowseListing,
  finalizeBrowseOpenListings,
};
