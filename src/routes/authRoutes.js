/**
 * Auth routes — SIWE + JWT
 *
 * POST /api/auth/nonce   { walletAddress }           → { nonce, domain, appUrl, chainId, walletAddress }
 * POST /api/auth/verify  { message, signature }      → { token, user }
 * GET  /api/auth/me      Authorization: Bearer JWT  → { user }
 */
const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post(
  '/nonce',
  [
    body('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid wallet address'),
  ],
  validate,
  authController.getNonce
);

router.post(
  '/verify',
  [
    body('message').notEmpty().withMessage('SIWE message is required'),
    body('signature').notEmpty().withMessage('Signature is required'),
  ],
  validate,
  authController.verifySiwe
);

router.get('/me', authenticate, authController.getMe);

module.exports = router;
