// 📄 DÁN TOÀN BỘ CODE NÀY VÀO src/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// ============================================
// CONTROLLER FUNCTIONS (Placeholder)
// ============================================
const jobController = {
  getJobs: async (req, res) => {
    res.json({ message: 'Get jobs - Coming soon' });
  },
  getJobById: async (req, res) => {
    res.json({ message: 'Get job by ID - Coming soon' });
  },
  createJob: async (req, res) => {
    res.json({ message: 'Create job - Coming soon' });
  },
  updateJobStatus: async (req, res) => {
    res.json({ message: 'Update job status - Coming soon' });
  },
  searchJobs: async (req, res) => {
    res.json({ message: 'Search jobs - Coming soon' });
  },
  getJobsByClient: async (req, res) => {
    res.json({ message: 'Get jobs by client - Coming soon' });
  },
  getJobsByFreelancer: async (req, res) => {
    res.json({ message: 'Get jobs by freelancer - Coming soon' });
  }
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/jobs
 * 📝 Lấy danh sách jobs với filter
 * Query params: page, limit, status, category, search, sortBy, order
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isString(),
    query('category').optional().isString(),
    query('search').optional().isString(),
    query('sortBy').optional().isString(),
    query('order').optional().isIn(['1', '-1'])
  ],
  validate,
  jobController.getJobs
);

/**
 * GET /api/jobs/search
 * 📝 Tìm kiếm jobs theo từ khóa
 */
router.get(
  '/search',
  [
    query('q').notEmpty().isString(),
    query('category').optional().isString(),
    query('minBudget').optional().isNumeric(),
    query('maxBudget').optional().isNumeric()
  ],
  validate,
  jobController.searchJobs
);

/**
 * GET /api/jobs/client/:address
 * 📝 Lấy jobs của một client
 */
router.get(
  '/client/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('status').optional().isString()
  ],
  validate,
  jobController.getJobsByClient
);

/**
 * GET /api/jobs/freelancer/:address
 * 📝 Lấy jobs của một freelancer
 */
router.get(
  '/freelancer/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('status').optional().isString()
  ],
  validate,
  jobController.getJobsByFreelancer
);

/**
 * GET /api/jobs/:id
 * 📝 Lấy chi tiết job theo ID
 */
router.get(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid job ID')
  ],
  validate,
  jobController.getJobById
);

/**
 * POST /api/jobs
 * 📝 Tạo job mới
 */
router.post(
  '/',
  [
    body('title').notEmpty().isString().isLength({ min: 5, max: 100 }),
    body('description').notEmpty().isString().isLength({ min: 20 }),
    body('category').notEmpty().isString(),
    body('contractValue').notEmpty().isInt({ min: 1 }),
    body('duration').notEmpty().isInt({ min: 3600 }),
    body('skills').optional().isArray(),
    body('deliverables').notEmpty().isString(),
    body('acceptanceCriteria').notEmpty().isString()
  ],
  validate,
  jobController.createJob
);

/**
 * PATCH /api/jobs/:id/status
 * 📝 Cập nhật trạng thái job
 */
router.patch(
  '/:id/status',
  [
    param('id').isMongoId(),
    body('status').isIn(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED']),
    body('note').optional().isString()
  ],
  validate,
  jobController.updateJobStatus
);

module.exports = router;