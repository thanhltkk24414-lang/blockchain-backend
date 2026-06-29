const express = require('express');
const { body, param } = require('express-validator');
const { getStats, getQuorumFailedJobs } = require('../controllers/adminController');
const roleApplicationController = require('../controllers/roleApplicationController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = express.Router();

router.get('/stats', getStats);
router.get('/quorum-failed-jobs', getQuorumFailedJobs);

router.post(
  '/role-applications',
  authenticate,
  [
    body('desiredRole')
      .isIn(['pauser', 'force_resolver', 'arbitrator_manager'])
      .withMessage('desiredRole must be pauser, force_resolver, or arbitrator_manager'),
    body('reason').isString().trim().isLength({ min: 20, max: 2000 }),
  ],
  validate,
  roleApplicationController.createApplication,
);

router.get('/role-applications/me', authenticate, roleApplicationController.getMyApplications);

router.get('/role-applications', roleApplicationController.listApplications);

router.patch(
  '/role-applications/:id',
  [param('id').isMongoId().withMessage('Invalid application id')],
  validate,
  roleApplicationController.updateApplicationStatus,
);

module.exports = router;
