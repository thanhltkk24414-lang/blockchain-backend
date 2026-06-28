const express = require('express');
const { getStats, getQuorumFailedJobs } = require('../controllers/adminController');

const router = express.Router();

router.get('/stats', getStats);
router.get('/quorum-failed-jobs', getQuorumFailedJobs);

module.exports = router;
