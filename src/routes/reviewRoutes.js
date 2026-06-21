// 📄 DÁN CODE NÀY VÀO src/routes/reviewRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// ============================================
// CONTROLLER FUNCTIONS (Placeholder)
// ============================================
const reviewController = {
  getReviewsByUser: async (req, res) => {
    res.json({ message: 'Get reviews by user - Coming soon' });
  },
  getReviewsByJob: async (req, res) => {
    res.json({ message: 'Get reviews by job - Coming soon' });
  },
  submitReview: async (req, res) => {
    res.json({ message: 'Submit review - Coming soon' });
  },
  getReviewById: async (req, res) => {
    res.json({ message: 'Get review by ID - Coming soon' });
  }
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/reviews/user/:address
 * 📝 Lấy đánh giá của một user
 */
router.get(
  '/user/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('role').optional().isIn(['client', 'freelancer'])
  ],
  validate,
  reviewController.getReviewsByUser
);

/**
 * GET /api/reviews/job/:jobId
 * 📝 Lấy đánh giá của một job
 */
router.get(
  '/job/:jobId',
  [
    param('jobId').isMongoId().withMessage('Invalid job ID')
  ],
  validate,
  reviewController.getReviewsByJob
);

/**
 * GET /api/reviews/:id
 * 📝 Lấy chi tiết đánh giá
 */
router.get(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid review ID')
  ],
  validate,
  reviewController.getReviewById
);

/**
 * POST /api/reviews
 * 📝 Gửi đánh giá (sau khi job complete)
 */
router.post(
  '/',
  [
    body('jobId').notEmpty().isMongoId(),
    body('rating').notEmpty().isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().isLength({ max: 500 }),
    body('role').isIn(['client', 'freelancer'])
  ],
  validate,
  reviewController.submitReview
);

module.exports = router;