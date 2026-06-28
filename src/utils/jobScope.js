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

/** Public browse lists only jobs for the deployed JobRegistry (avoids stale pre-redeploy rows). */
function applyCurrentRegistryScope(baseQuery = {}) {
  const registry = getJobRegistryAddress();
  if (!registry) return baseQuery;
  return { ...baseQuery, jobRegistryAddress: registry };
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.code === 11001;
}

module.exports = {
  getChainId,
  getJobRegistryAddress,
  jobLookupFilter,
  attachJobScope,
  applyCurrentRegistryScope,
  isDuplicateKeyError,
  normalizeRegistryAddress,
};
