const express = require('express');
const { getStats } = require('../controllers/adminController');

const router = express.Router();

router.get('/stats', getStats);

module.exports = router;
