const USDC_DECIMALS = 6;
const SCALE = 10 ** USDC_DECIMALS;

/** Whole USDC (API / UI) → on-chain smallest units (6 decimals). */
function toUsdcUnits(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return Math.round(n * SCALE);
}

/** On-chain smallest units → whole USDC for display. */
function fromUsdcUnits(units) {
  return Number(units) / SCALE;
}

/** Matches EscrowVault: contractValue + 3% platform fee (integer BPS on smallest units). */
function computeTotalDepositUnits(contractValueUnits) {
  const cv = BigInt(contractValueUnits);
  return cv + (cv * 3n) / 100n;
}

module.exports = {
  USDC_DECIMALS,
  SCALE,
  toUsdcUnits,
  fromUsdcUnits,
  computeTotalDepositUnits,
};
