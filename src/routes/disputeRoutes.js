// 📄 DÁN CODE NÀY VÀO src/routes/disputeRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// ============================================
// CONTROLLER FUNCTIONS (Placeholder)
// ============================================
const disputeController = {
  getDisputes: async (req, res) => {
    res.json({ message: 'Get disputes - Coming soon' });
  },
  getDisputeById: async (req, res) => {
    res.json({ message: 'Get dispute by ID - Coming soon' });
  },
  raiseDispute: async (req, res) => {
    res.json({ message: 'Raise dispute - Coming soon' });
  },
  addEvidence: async (req, res) => {
    res.json({ message: 'Add evidence - Coming soon' });
  },
  getEvidences: async (req, res) => {
    res.json({ message: 'Get evidences - Coming soon' });
  },
  getDisputeByJob: async (req, res) => {
    res.json({ message: 'Get dispute by job - Coming soon' });
  }
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/disputes
 * 📝 Lấy danh sách disputes
 */
router.get(
  '/',
  [
    query('status').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validate,
  disputeController.getDisputes
);

/**
 * GET /api/disputes/job/:jobId
 * 📝 Lấy dispute theo job ID
 */
router.get(
  '/job/:jobId',
  [
    param('jobId').isMongoId().withMessage('Invalid job ID')
  ],
  validate,
  disputeController.getDisputeByJob
);

/**
 * GET /api/disputes/:id
 * 📝 Lấy chi tiết dispute
 */
router.get(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid dispute ID')
  ],
  validate,
  disputeController.getDisputeById
);

/**
 * GET /api/disputes/:id/evidences
 * 📝 Lấy bằng chứng của dispute
 */
router.get(
  '/:id/evidences',
  [
    param('id').isMongoId()
  ],
  validate,
  disputeController.getEvidences
);

/**
 * POST /api/disputes
 * 📝 Mở tranh chấp mới
 */
router.post(
  '/',
  [
    body('jobId').notEmpty().isMongoId(),
    body('title').notEmpty().isString().isLength({ min: 5 }),
    body('description').notEmpty().isString().isLength({ min: 20 }),
    body('type').optional().isIn(['non_delivery', 'late_delivery', 'quality_issues', 'non_payment', 'scope_creep', 'contract_breach', 'other'])
  ],
  validate,
  disputeController.raiseDispute
);

/**
 * POST /api/disputes/:id/evidence
 * 📝 Nộp bằng chứng cho dispute
 */
router.post(
  '/:id/evidence',
  [
    param('id').isMongoId(),
    body('ipfsHash').notEmpty().isString(),
    body('description').optional().isString()
  ],
  validate,
  disputeController.addEvidence
);

module.exports = router;