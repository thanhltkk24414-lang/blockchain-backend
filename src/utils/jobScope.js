const blockchain = require('../config/blockchain');

function getChainId() {
  return Number(process.env.CHAIN_ID || 11155111);
}

function normalizeRegistryAddress(address) {
  if (!address || typeof address !== 'string') return null;
  return address.toLowerCase();
}

function getJobRegistryAddress() {
  return normalizeRegistryAddress(blockchain.getContractAddress('JobRegistry'));
}

function getLegacyJobRegistryAddress() {
  return normalizeRegistryAddress(process.env.LEGACY_JOB_REGISTRY_ADDRESS);
}

/** Jobs missing jobRegistryAddress (pre-redeploy rows). */
function buildUnscopedRegistryOrClause(registry) {
  return [
    { jobRegistryAddress: registry },
    { jobRegistryAddress: { $exists: false } },
    { jobRegistryAddress: null },
    { jobRegistryAddress: '' },
  ];
}

function jobLookupFilter(onchainJobId, registryAddress = getJobRegistryAddress()) {
  const filter = { onchainJobId: Number(onchainJobId) };
  if (registryAddress) {
    filter.jobRegistryAddress = registryAddress;
  }
  return filter;
}

function attachJobScope(fields = {}) {
  return {
    ...fields,
    jobRegistryAddress: getJobRegistryAddress(),
    chainId: getChainId(),
  };
}

/** Strict match — create/indexer lookups for the active JobRegistry only. */
function applyCurrentRegistryScope(baseQuery = {}) {
  const registry = getJobRegistryAddress();
  if (!registry) return baseQuery;
  return { ...baseQuery, jobRegistryAddress: registry };
}

/**
 * Public browse: active deployment + unmigrated rows (missing registry field).
 * Rows tagged LEGACY_JOB_REGISTRY_ADDRESS stay hidden from browse.
 */
function applyBrowseRegistryScope(baseQuery = {}) {
  const registry = getJobRegistryAddress();
  if (!registry) return baseQuery;

  const registryClause = { $or: buildUnscopedRegistryOrClause(registry) };
  if (Array.isArray(baseQuery.$and)) {
    return { ...baseQuery, $and: [...baseQuery.$and, registryClause] };
  }
  return { ...baseQuery, $and: [registryClause] };
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.code === 11001;
}

/**
 * Indexer / dispute events: active registry row, or legacy rows missing jobRegistryAddress.
 * Avoids missing DisputeRaised when Mongo predates registry scoping.
 */
function indexerJobLookupFilter(onchainJobId, registryAddress = getJobRegistryAddress()) {
  const filter = { onchainJobId: Number(onchainJobId) };
  if (!registryAddress) return filter;
  return {
    onchainJobId: Number(onchainJobId),
    $or: buildUnscopedRegistryOrClause(registryAddress),
  };
}

module.exports = {
  getChainId,
  getJobRegistryAddress,
  getLegacyJobRegistryAddress,
  buildUnscopedRegistryOrClause,
  jobLookupFilter,
  indexerJobLookupFilter,
  attachJobScope,
  applyCurrentRegistryScope,
  applyBrowseRegistryScope,
  isDuplicateKeyError,
  normalizeRegistryAddress,
};
