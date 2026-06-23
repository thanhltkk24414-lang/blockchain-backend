const crypto = require('crypto');
const { getAddress } = require('ethers');
const { SiweMessage } = require('siwe');
const User = require('../models/User');
const logger = require('../utils/logger');
const { generateToken } = require('../middleware/auth');

function normalizeAddress(address) {
  return getAddress(address).toLowerCase();
}

function getSiweDomain() {
  return process.env.SIWE_DOMAIN || 'localhost';
}

function getAppUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

/**
 * EIP-4361 line 2 is the wallet address. Normalize to EIP-55 before SiweMessage parse.
 * Note: if the client signed a lowercase address, normalizing here will not fix signature mismatch.
 */
function normalizeSiweMessageForParse(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('SIWE message is required');
  }

  const lines = message.split('\n');
  if (lines.length < 2) {
    throw new Error('Invalid SIWE message format (expected EIP-4361)');
  }

  const rawAddress = lines[1].trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(rawAddress)) {
    throw new Error(`Invalid address on line 2 of SIWE message: ${rawAddress}`);
  }

  const checksummed = getAddress(rawAddress);
  const addressNormalized = checksummed !== rawAddress;

  if (addressNormalized) {
    lines[1] = checksummed;
  }

  return {
    message: addressNormalized ? lines.join('\n') : message,
    addressNormalized,
    checksummedAddress: checksummed,
  };
}

function isEip55ParseError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('EIP-55') || msg.includes('invalid address');
}

function formatSiweVerifyError(err, context = {}) {
  if (!err) return 'SIWE verification failed';
  if (typeof err === 'string') return err;

  const inner = err.error || err;
  if (inner && inner.type) {
    const parts = [inner.type];
    if (inner.expected) parts.push(`expected: ${inner.expected}`);
    if (inner.received) parts.push(`received: ${inner.received}`);

    if (inner.type === 'Signature does not match address of the message.') {
      parts.push(
        'The signature was not created for this exact message. Fetch a new nonce, sign again on siwe-sign.html, and paste the copied JSON without edits.'
      );
      if (context.addressNormalized) {
        parts.push(
          'If the signed message had a lowercase address, re-sign after hard-refreshing siwe-sign.html — SIWE requires EIP-55 in the signed text.'
        );
      }
    }
    if (inner.type === 'Nonce does not match') {
      parts.push('Request POST /api/auth/nonce again and sign immediately — each nonce is single-use.');
    }
    if (inner.type === 'Domain does not match') {
      parts.push(`SIWE_DOMAIN in backend .env must be "${getSiweDomain()}" (hostname only, not APP_URL).`);
    }

    return parts.join(' — ');
  }
  if (inner && inner.message) return inner.message;
  return 'SIWE verification failed';
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
        walletAddress: getAddress(walletAddress),
        domain: getSiweDomain(),
        appUrl: getAppUrl(),
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
    let parseMeta = null;

    try {
      const { message, signature } = req.body;

      if (!signature || typeof signature !== 'string') {
        return res.status(401).json({
          success: false,
          error: 'Signature is required',
        });
      }

      try {
        parseMeta = normalizeSiweMessageForParse(message);
      } catch (parseError) {
        return res.status(401).json({
          success: false,
          error: parseError.message,
          hint: 'Use http://127.0.0.1:5000/siwe-sign.html → fetch nonce → sign → Copy JSON. Example EIP-55: 0x523eBd853a1638065f148A05c0Ca423E490D92f7',
        });
      }

      let siweMessage;
      try {
        siweMessage = new SiweMessage(parseMeta.message);
      } catch (parseError) {
        const detail = isEip55ParseError(parseError)
          ? `${parseError.message} Re-fetch nonce and sign again with EIP-55 checksum (siwe-sign.html).`
          : parseError.message;
        return res.status(401).json({
          success: false,
          error: detail,
          hint: 'Correct EIP-55 for 0x523ebd853a1638065f148a05c0ca423e490d92f7 is 0x523eBd853a1638065f148A05c0Ca423E490D92f7',
        });
      }

      const address = normalizeAddress(siweMessage.address);

      const user = await User.findOne({ walletAddress: address });
      if (!user || !user.nonce) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired nonce. Request POST /api/auth/nonce and sign again before verifying.',
        });
      }

      if (siweMessage.nonce !== user.nonce) {
        return res.status(401).json({
          success: false,
          error: `Nonce in message does not match server. Message nonce: ${siweMessage.nonce || '(missing)'} — fetch a fresh nonce and re-sign.`,
        });
      }

      const expectedChainId = getChainId();
      const expectedDomain = getSiweDomain();

      const verifyResult = await siweMessage.verify(
        {
          signature,
          nonce: user.nonce,
          domain: expectedDomain,
          time: new Date(),
        },
        { suppressExceptions: true }
      );

      if (!verifyResult.success) {
        const detail = formatSiweVerifyError(verifyResult, parseMeta);
        logger.error('SIWE verify failed:', verifyResult.error || verifyResult);
        return res.status(401).json({
          success: false,
          error: detail,
        });
      }

      const { data } = verifyResult;

      if (Number(data.chainId) !== expectedChainId) {
        return res.status(401).json({
          success: false,
          error: `Invalid chain ID in message (${data.chainId}). Expected ${expectedChainId} — match CHAIN_ID in backend .env.`,
        });
      }

      if (data.domain !== expectedDomain) {
        return res.status(401).json({
          success: false,
          error: `Domain mismatch: message has "${data.domain}", server expects "${expectedDomain}" (SIWE_DOMAIN).`,
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
        error: formatSiweVerifyError(error, parseMeta || {}),
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
