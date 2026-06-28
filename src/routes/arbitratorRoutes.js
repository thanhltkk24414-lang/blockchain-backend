const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const arbitratorController = require('../controllers/arbitratorController');
const arbitratorApplicationController = require('../controllers/arbitratorApplicationController');

const router = express.Router();

router.post(
  '/applications',
  authenticate,
  [body('reason').isString().trim().isLength({ min: 20, max: 2000 })],
  validate,
  arbitratorApplicationController.createApplication,
);

router.get('/applications/me', authenticate, arbitratorApplicationController.getMyApplication);

router.get('/applications', arbitratorApplicationController.listApplications);

router.patch(
  '/applications/:id',
  [param('id').isMongoId().withMessage('Invalid application id')],
  validate,
  arbitratorApplicationController.updateApplicationStatus,
);

router.get(
  '/:address/status',
  [param('address').isEthereumAddress().withMessage('Invalid wallet address')],
  validate,
  arbitratorController.getStakeStatus,
);

module.exports = router;
