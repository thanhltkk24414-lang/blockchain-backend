const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const jobController = require('../controllers/jobController');

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isString(),
    query('category').optional().isString(),
    query('search').optional().isString(),
    query('sortBy').optional().isString(),
    query('order').optional().isIn(['1', '-1']),
  ],
  validate,
  jobController.getJobs
);

router.get(
  '/search',
  [
    query('q').notEmpty().isString(),
    query('category').optional().isString(),
    query('minBudget').optional().isNumeric(),
    query('maxBudget').optional().isNumeric(),
  ],
  validate,
  jobController.searchJobs
);

router.get(
  '/client/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('status').optional().isString(),
  ],
  validate,
  jobController.getJobsByClient
);

router.get(
  '/freelancer/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('status').optional().isString(),
  ],
  validate,
  jobController.getJobsByFreelancer
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid job ID')],
  validate,
  jobController.getJobById
);

router.post(
  '/',
  authenticate,
  [
    body('title').notEmpty().isString().isLength({ min: 5, max: 100 }),
    body('description').notEmpty().isString().isLength({ min: 20 }),
    body('category').notEmpty().isString(),
    body('contractValue').notEmpty().isInt({ min: 1 }),
    body('duration').notEmpty().isInt({ min: 3600 }),
    body('skills').optional().isArray(),
    body('deliverables').notEmpty().isString(),
    body('acceptanceCriteria').notEmpty().isString(),
  ],
  validate,
  jobController.createJob
);

router.patch(
  '/:id/status',
  authenticate,
  [
    param('id').isMongoId(),
    body('status').isIn(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED']),
    body('note').optional().isString(),
  ],
  validate,
  jobController.updateJobStatus
);

module.exports = router;
