const express = require('express');
const { param } = require('express-validator');
const { validate } = require('../middleware/validation');
const arbitratorController = require('../controllers/arbitratorController');

const router = express.Router();

router.get(
  '/:address/status',
  [param('address').isEthereumAddress().withMessage('Invalid wallet address')],
  validate,
  arbitratorController.getStakeStatus
);

module.exports = router;
