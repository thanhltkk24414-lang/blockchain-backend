// 📄 DÁN CODE NÀY VÀO src/routes/bidRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// ============================================
// CONTROLLER FUNCTIONS (Placeholder)
// ============================================
const bidController = {
  getBidsByJob: async (req, res) => {
    res.json({ message: 'Get bids by job - Coming soon' });
  },
  getBidById: async (req, res) => {
    res.json({ message: 'Get bid by ID - Coming soon' });
  },
  submitBid: async (req, res) => {
    res.json({ message: 'Submit bid - Coming soon' });
  },
  acceptBid: async (req, res) => {
    res.json({ message: 'Accept bid - Coming soon' });
  },
  rejectBid: async (req, res) => {
    res.json({ message: 'Reject bid - Coming soon' });
  },
  getMyBids: async (req, res) => {
    res.json({ message: 'Get my bids - Coming soon' });
  }
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/bids/job/:jobId
 * 📝 Lấy tất cả bids của một job
 */
router.get(
  '/job/:jobId',
  [
    param('jobId').isMongoId().withMessage('Invalid job ID')
  ],
  validate,
  bidController.getBidsByJob
);

/**
 * GET /api/bids/my/:address
 * 📝 Lấy bids của freelancer
 */
router.get(
  '/my/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('status').optional().isString()
  ],
  validate,
  bidController.getMyBids
);

/**
 * GET /api/bids/:id
 * 📝 Lấy chi tiết bid
 */
router.get(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid bid ID')
  ],
  validate,
  bidController.getBidById
);

/**
 * POST /api/bids
 * 📝 Gửi proposal (bid)
 */
router.post(
  '/',
  [
    body('jobId').notEmpty().isMongoId(),
    body('bidAmount').notEmpty().isInt({ min: 1 }),
    body('proposalCID').notEmpty().isString(),
    body('title').notEmpty().isString().isLength({ min: 5, max: 100 }),
    body('description').notEmpty().isString().isLength({ min: 20 }),
    body('timeline').notEmpty().isInt({ min: 1 })
  ],
  validate,
  bidController.submitBid
);

/**
 * PATCH /api/bids/:id/accept
 * 📝 Chấp nhận bid (client action)
 */
router.patch(
  '/:id/accept',
  [
    param('id').isMongoId()
  ],
  validate,
  bidController.acceptBid
);

/**
 * PATCH /api/bids/:id/reject
 * 📝 Từ chối bid (client action)
 */
router.patch(
  '/:id/reject',
  [
    param('id').isMongoId()
  ],
  validate,
  bidController.rejectBid
);

module.exports = router;