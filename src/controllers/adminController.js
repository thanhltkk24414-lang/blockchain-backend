const mongoose = require('mongoose');
const Job = require('../models/Job');
const IndexerState = require('../models/IndexerState');

function contractEnvFromProcess() {
  return {
    MockUSDC: process.env.MOCK_USDC_ADDRESS || null,
    ReputationStore: process.env.REPUTATION_STORE_ADDRESS || null,
    PlatformTreasury: process.env.PLATFORM_TREASURY_ADDRESS || null,
    JobRegistry: process.env.JOB_REGISTRY_ADDRESS || null,
    ArbitratorPanel: process.env.ARBITRATOR_PANEL_ADDRESS || null,
    EscrowVault: process.env.ESCROW_VAULT_ADDRESS || null,
  };
}

/**
 * GET /api/admin/stats — read-only platform stats for demo admin dashboard.
 * Public endpoint; no wallet auth (on-chain admin actions are still wallet-gated).
 */
async function getStats(req, res) {
  const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const mongodb = mongoStates[mongoose.connection.readyState] || 'unknown';

  const indexerEnabled = !['false', '0', 'no', 'off'].includes(
    String(process.env.ENABLE_EVENT_INDEXER ?? 'true').toLowerCase(),
  );

  const payload = {
    success: true,
    timestamp: new Date().toISOString(),
    mongodb,
    chainId: Number(process.env.CHAIN_ID || 11155111),
    contracts: contractEnvFromProcess(),
    jobs: {
      total: 0,
      disputed: 0,
      byStatus: {},
    },
    indexer: {
      enabled: indexerEnabled,
      lastBlock: null,
    },
  };

  if (mongoose.connection.readyState !== 1) {
    return res.json(payload);
  }

  try {
    const [total, disputed, byStatusAgg, indexerDoc] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: 'DISPUTED' }),
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      IndexerState.findOne({ id: 'lastBlock' }).lean(),
    ]);

    const byStatus = {};
    for (const row of byStatusAgg) {
      if (row._id) byStatus[row._id] = row.count;
    }

    payload.jobs = { total, disputed, byStatus };
    payload.indexer.lastBlock = indexerDoc?.blockNumber ?? null;
  } catch (err) {
    payload.success = false;
    payload.error = err.message;
    return res.status(500).json(payload);
  }

  return res.json(payload);
}

module.exports = { getStats };
