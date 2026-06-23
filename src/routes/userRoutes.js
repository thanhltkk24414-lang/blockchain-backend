// 📄 DÁN TOÀN BỘ CODE NÀY VÀO src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

// Import controllers
const userController = require('../controllers/userController');

// =============================================
// 📌 ROUTES
// =============================================

/**
 * GET /api/users/profile/:address
 * 📝 Lấy thông tin profile của user theo địa chỉ ví
 */
router.get(
  '/profile/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid wallet address')
  ],
  validate,
  userController.getProfile
);

/**
 * PUT /api/users/profile
 * 📝 Cập nhật profile của user (yêu cầu auth)
 */
router.put(
  '/profile',
  authenticate,
  [
    body('fullName').optional().isString().trim(),
    body('bio').optional().isString().isLength({ max: 500 }),
    body('skills').optional().isArray(),
    body('hourlyRate').optional().isNumeric().isInt({ min: 0 }),
    body('location').optional().isString(),
    body('avatar').optional().isString()
  ],
  validate,
  userController.updateProfile
);

/**
 * GET /api/users/reputation/:address
 * 📝 Lấy điểm uy tín của user
 */
router.get(
  '/reputation/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid wallet address')
  ],
  validate,
  userController.getReputation
);

/**
 * GET /api/users/stats/:address
 * 📝 Lấy thống kê của user
 */
router.get(
  '/stats/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid wallet address')
  ],
  validate,
  userController.getStats
);

/**
 * POST /api/users/register
 * 📝 Đăng ký user mới (tạo username)
 */
router.post(
  '/register',
  [
    body('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid wallet address'),
    body('username')
      .notEmpty()
      .isString()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Invalid email')
  ],
  validate,
  userController.register
);

/**
 * GET /api/users/sync/:address
 * 📝 Đồng bộ reputation từ blockchain
 */
router.get(
  '/sync/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid wallet address')
  ],
  validate,
  userController.syncReputation
);

/**
 * GET /api/users/me
 * 📝 Lấy thông tin user hiện tại (từ token)
 */
router.get(
  '/me',
  authenticate,
  async (req, res) => {
    try {
      const user = req.user;
      res.json({
        success: true,
        user: {
          walletAddress: user.walletAddress,
          username: user.username,
          profile: user.profile,
          reputation: user.reputation,
          stats: user.stats
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/users/check/:address
 * 📝 Kiểm tra user đã tồn tại chưa
 */
router.get(
  '/check/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid wallet address')
  ],
  validate,
  async (req, res) => {
    try {
      const { address } = req.params;
      const User = require('../models/User');
      const user = await User.findOne({ walletAddress: address.toLowerCase() });
      
      res.json({
        success: true,
        exists: !!user,
        user: user ? {
          walletAddress: user.walletAddress,
          username: user.username,
          reputation: user.reputation
        } : null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;