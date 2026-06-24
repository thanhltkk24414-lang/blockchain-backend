const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const bidController = require('../controllers/bidController');

router.get(
  '/job/:jobId',
  [param('jobId').isMongoId().withMessage('Invalid job ID')],
  validate,
  bidController.getBidsByJob
);

router.get(
  '/my/:address',
  [
    param('address').isEthereumAddress().withMessage('Invalid wallet address'),
    query('status').optional().isString(),
  ],
  validate,
  bidController.getMyBids
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid bid ID')],
  validate,
  bidController.getBidById
);

router.post(
  '/',
  authenticate,
  [
    body('jobId').notEmpty().isMongoId(),
    body('bidAmount').notEmpty().isInt({ min: 1 }),
    body('proposalCID').optional().isString(),
    body('title').notEmpty().isString().isLength({ min: 5, max: 100 }),
    body('description').notEmpty().isString().isLength({ min: 20 }),
    body('timeline').notEmpty().isInt({ min: 1 }),
  ],
  validate,
  bidController.submitBid
);

router.patch(
  '/:id/accept',
  authenticate,
  [param('id').isMongoId()],
  validate,
  bidController.acceptBid
);

router.patch(
  '/:id/reject',
  authenticate,
  [param('id').isMongoId()],
  validate,
  bidController.rejectBid
);

module.exports = router;
