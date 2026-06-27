const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const disputeController = require('../controllers/disputeController');

router.get(
  '/',
  [
    query('status').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  disputeController.getDisputes,
);

router.get(
  '/onchain/:onchainJobId/evidences',
  [param('onchainJobId').isInt({ min: 1 })],
  validate,
  disputeController.getEvidencesByOnchainJob,
);

router.get(
  '/onchain/:onchainJobId',
  [param('onchainJobId').isInt({ min: 1 })],
  validate,
  disputeController.getDisputeByOnchainJob,
);

router.get(
  '/job/:jobId',
  [param('jobId').isMongoId().withMessage('Invalid job ID')],
  validate,
  disputeController.getDisputeByJob,
);

router.get(
  '/:id/evidences',
  [param('id').isMongoId()],
  validate,
  disputeController.getEvidences,
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid dispute ID')],
  validate,
  disputeController.getDisputeById,
);

router.post(
  '/',
  authenticate,
  [
    body('jobId').notEmpty().isMongoId(),
    body('title').notEmpty().isString().isLength({ min: 5 }),
    body('description').notEmpty().isString().isLength({ min: 20 }),
    body('type').optional().isIn([
      'non_delivery',
      'late_delivery',
      'quality_issues',
      'non_payment',
      'scope_creep',
      'contract_breach',
      'other',
    ]),
  ],
  validate,
  disputeController.raiseDispute,
);

router.post(
  '/onchain/:onchainJobId/evidence',
  authenticate,
  [
    param('onchainJobId').isInt({ min: 1 }),
    body('ipfsHash').notEmpty().isString(),
    body('description').optional().isString(),
    body('onChainHash').optional().isString(),
  ],
  validate,
  disputeController.addEvidenceByOnchainJob,
);

router.post(
  '/:id/evidence',
  authenticate,
  [
    param('id').isMongoId(),
    body('ipfsHash').notEmpty().isString(),
    body('description').optional().isString(),
    body('onChainHash').optional().isString(),
  ],
  validate,
  disputeController.addEvidence,
);

module.exports = router;
