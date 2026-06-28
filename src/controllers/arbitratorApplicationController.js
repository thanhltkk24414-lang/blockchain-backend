const { ethers } = require('ethers');
const ArbitratorApplication = require('../models/ArbitratorApplication');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');

const MIN_STAKE_USDC = 50;

async function readStakeAndReputation(walletAddress) {
  const [stakeWei, reputationScore] = await Promise.all([
    contractService.getArbitratorStake(walletAddress),
    contractService.getReputation(walletAddress),
  ]);
  const stakedAmount = parseFloat(ethers.formatUnits(stakeWei, 6));
  const stakeVerified = stakedAmount >= MIN_STAKE_USDC;
  return { stakedAmount, stakeVerified, reputationScore };
}

/**
 * POST /api/arbitrator/applications — submit pool application (SIWE auth).
 */
async function createApplication(req, res) {
  try {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be at least 20 characters',
      });
    }

    const walletAddress = req.user.walletAddress.toLowerCase();

    const existingPending = await ArbitratorApplication.findOne({
      walletAddress,
      status: 'pending',
    });
    if (existingPending) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending application',
        application: existingPending,
      });
    }

    const { stakedAmount, stakeVerified, reputationScore } = await readStakeAndReputation(walletAddress);
    if (!stakeVerified) {
      return res.status(400).json({
        success: false,
        error: `Stake at least ${MIN_STAKE_USDC} USDC via PlatformTreasury before applying`,
        stakedAmount,
        minStake: MIN_STAKE_USDC,
      });
    }

    const application = await ArbitratorApplication.create({
      walletAddress,
      reason,
      reputationScore,
      stakeVerified,
      stakedAmount,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      application,
    });
  } catch (error) {
    logger.error('Create arbitrator application error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save arbitrator application',
    });
  }
}

/**
 * GET /api/arbitrator/applications/me — current user's latest application (SIWE auth).
 */
async function getMyApplication(req, res) {
  try {
    const walletAddress = req.user.walletAddress.toLowerCase();
    const application = await ArbitratorApplication.findOne({ walletAddress })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      application: application || null,
    });
  } catch (error) {
    logger.error('Get my arbitrator application error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load application',
    });
  }
}

/**
 * GET /api/arbitrator/applications — list applications for admin dashboard.
 */
async function listApplications(req, res) {
  try {
    const status = req.query.status || 'pending';
    const filter = status === 'all' ? {} : { status };

    const applications = await ArbitratorApplication.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      applications,
      count: applications.length,
    });
  } catch (error) {
    logger.error('List arbitrator applications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list applications',
    });
  }
}

/**
 * PATCH /api/arbitrator/applications/:id — update status (reject from admin UI).
 */
async function updateApplicationStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be approved or rejected',
      });
    }

    const application = await ArbitratorApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    if (application.status !== 'pending' && application.status !== status) {
      return res.status(409).json({
        success: false,
        error: `Application already ${application.status}`,
        application,
      });
    }

    application.status = status;
    await application.save();

    return res.json({
      success: true,
      application,
    });
  } catch (error) {
    logger.error('Update arbitrator application error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update application',
    });
  }
}

module.exports = {
  createApplication,
  getMyApplication,
  listApplications,
  updateApplicationStatus,
};
