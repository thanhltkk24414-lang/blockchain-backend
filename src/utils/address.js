const { ethers } = require('ethers');

/**
 * Normalize to lowercase for DB queries / comparisons.
 */
function normalizeAddress(address) {
  if (!address || typeof address !== 'string') return null;
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch {
    return address.toLowerCase();
  }
}

/**
 * EIP-55 checksummed address for API responses and copy-paste hints.
 */
function toChecksumAddress(address) {
  if (!address || typeof address !== 'string') return null;
  return ethers.getAddress(address);
}

function addressesEqual(a, b) {
  if (!a || !b) return false;
  try {
    return ethers.getAddress(a) === ethers.getAddress(b);
  } catch {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }
}

module.exports = {
  normalizeAddress,
  toChecksumAddress,
  addressesEqual,
};
