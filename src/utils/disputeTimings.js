/** Demo Sepolia dispute windows — keep in sync with frontend disputeTimings.ts */
const DISPUTE_PHASES_DEMO = {
  evidenceRebuttalEndMin: 10,
  commitEndMin: 13,
  revealEndMin: 16,
  appealWindowMin: 30,
};

const DISPUTE_QUORUM = 3;

function revealEndSec(createdAtSec) {
  return createdAtSec + DISPUTE_PHASES_DEMO.revealEndMin * 60;
}

module.exports = {
  DISPUTE_PHASES_DEMO,
  DISPUTE_QUORUM,
  revealEndSec,
};
