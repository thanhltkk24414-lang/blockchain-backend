// 📄 DÁN CODE NÀY VÀO FILE src/routes/userRoutes.js
const express = require('express');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'User routes working' });
});

module.exports = router;