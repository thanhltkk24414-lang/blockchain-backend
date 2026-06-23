const crypto = require('crypto');
const { SiweMessage } = require('siwe');
const User = require('../models/User');
const logger = require('../utils/logger');
const { generateToken } = require('../middleware/auth');

function normalizeAddress(address) {
  return address.toLowerCase();
}

function getSiweDomain() {
  return process.env.SIWE_DOMAIN || process.env.APP_URL || 'localhost';
}

function getChainId() {
  const chainId = Number(process.env.CHAIN_ID || 11155111);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('Invalid CHAIN_ID');
  }
  return chainId;
}

function defaultUsername(walletAddress) {
  return `user_${walletAddress.slice(2, 10)}`;
}

const authController = {
  /**
   * POST /api/auth/nonce
   * Issue a one-time nonce for SIWE sign-in.
   */
  getNonce: async (req, res) => {
    try {
      const { walletAddress } = req.body;
      const address = normalizeAddress(walletAddress);
      const nonce = crypto.randomBytes(16).toString('hex');

      const user = await User.findOneAndUpdate(
        { walletAddress: address },
        {
          $set: { nonce },
          $setOnInsert: {
            walletAddress: address,
            username: defaultUsername(address),
          },
        },
        { upsert: true, new: true, runValidators: true }
      );

      res.json({
        success: true,
        nonce: user.nonce,
        walletAddress: user.walletAddress,
        domain: getSiweDomain(),
        chainId: getChainId(),
      });
    } catch (error) {
      logger.error('Get nonce error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * POST /api/auth/verify
   * Verify SIWE message + signature and issue JWT.
   */
  verifySiwe: async (req, res) => {
    try {
      const { message, signature } = req.body;

      const siweMessage = new SiweMessage(message);
      const address = normalizeAddress(siweMessage.address);

      const user = await User.findOne({ walletAddress: address });
      if (!user || !user.nonce) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired nonce. Request a new nonce first.',
        });
      }

      const expectedChainId = getChainId();
      const expectedDomain = getSiweDomain();

      const { success, data } = await siweMessage.verify({
        signature,
        nonce: user.nonce,
        domain: expectedDomain,
        time: new Date(),
      });

      if (!success) {
        return res.status(401).json({
          success: false,
          error: 'SIWE verification failed',
        });
      }

      if (Number(data.chainId) !== expectedChainId) {
        return res.status(401).json({
          success: false,
          error: `Invalid chain ID. Expected ${expectedChainId}`,
        });
      }

      user.nonce = null;
      user.lastLoginAt = new Date();
      await user.save();

      const token = generateToken(user.walletAddress);

      res.json({
        success: true,
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        user: {
          walletAddress: user.walletAddress,
          username: user.username,
          role: user.role,
          reputation: user.reputation,
        },
      });
    } catch (error) {
      logger.error('SIWE verify error:', error);
      res.status(401).json({
        success: false,
        error: error.message || 'SIWE verification failed',
      });
    }
  },

  /**
   * GET /api/auth/me
   * Return authenticated user from JWT.
   */
  getMe: async (req, res) => {
    try {
      const user = req.user;

      res.json({
        success: true,
        user: {
          walletAddress: user.walletAddress,
          username: user.username,
          role: user.role,
          profile: user.profile,
          reputation: user.reputation,
          stats: user.stats,
          lastLoginAt: user.lastLoginAt,
        },
      });
    } catch (error) {
      logger.error('Get auth me error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
};

module.exports = authController;
