// THÊM DÒNG NÀY VÀO ĐẦU FILE
const contractService = require('../services/blockchain/contractService');
// 📄 DÁN VÀO src/controllers/userController.js
const User = require('../models/User');
const logger = require('../utils/logger');
const reputationService = require('../services/reputationService');

/**
 * 📝 User Controller
 * Xử lý các request liên quan đến người dùng
 */
const userController = {
  /**
   * GET /api/users/profile/:address
   * 📝 Lấy thông tin profile của user theo địa chỉ ví
   */
  getProfile: async (req, res) => {
    try {
      const { address } = req.params;
      
      const user = await User.findOne({ walletAddress: address.toLowerCase() });
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      res.json({
        success: true,
        user: {
          walletAddress: user.walletAddress,
          username: user.username,
          role: user.role,
          profile: user.profile,
          reputation: user.reputation,
          stats: user.stats,
          isActive: user.isActive,
        },
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * PUT /api/users/profile
   * 📝 Cập nhật profile của user (yêu cầu auth)
   */
  updateProfile: async (req, res) => {
    try {
      const { fullName, bio, skills, hourlyRate, location, avatar, role } = req.body;
      const user = req.user; // Từ middleware auth

      if (role !== undefined) {
        if (!['client', 'freelancer'].includes(role)) {
          return res.status(400).json({
            success: false,
            error: 'Role must be client or freelancer',
          });
        }
        user.role = role;
      }

      // Cập nhật từng trường
      if (fullName) user.profile.fullName = fullName;
      if (bio) user.profile.bio = bio;
      if (skills) user.profile.skills = skills;
      if (hourlyRate !== undefined) user.profile.hourlyRate = hourlyRate;
      if (location) user.profile.location = location;
      if (avatar) user.profile.avatar = avatar;

      user.updatedAt = new Date();
      await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: user.toJSON()
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/users/reputation/:address
   * 📝 Lấy điểm uy tín của user
   */
  getReputation: async (req, res) => {
    try {
      const { address } = req.params;
      
      const user = await User.findOne({ walletAddress: address.toLowerCase() });
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      // Đồng bộ reputation từ on-chain nếu cần
      const onChainScore = await reputationService.getOnChainScore(address);
      if (onChainScore !== null && user.reputation.score !== onChainScore) {
        user.reputation.score = onChainScore;
        await reputationService.updateUserTier(user);
        await user.save();
      }

      res.json({
        success: true,
        reputation: user.reputation
      });
    } catch (error) {
      logger.error('Get reputation error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/users/stats/:address
   * 📝 Lấy thống kê của user
   */
  getStats: async (req, res) => {
    try {
      const { address } = req.params;
      
      const user = await User.findOne({ walletAddress: address.toLowerCase() });
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      res.json({
        success: true,
        stats: user.stats,
        reputation: {
          score: user.reputation.score,
          tier: user.reputation.tier,
          successRate: user.reputation.successRate
        }
      });
    } catch (error) {
      logger.error('Get stats error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/users/register
   * 📝 Đăng ký user mới (tạo username)
   */
  register: async (req, res) => {
    try {
      const { walletAddress, username, email } = req.body;

      // Kiểm tra user đã tồn tại
      const existingUser = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User already registered'
        });
      }

      // Kiểm tra username đã tồn tại
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          error: 'Username already taken'
        });
      }

      // Tạo user mới
      const user = new User({
        walletAddress: walletAddress.toLowerCase(),
        username,
        email,
        reputation: {
          score: 100,
          tier: 'Normal'
        }
      });

      await user.save();

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: user.toJSON()
      });
    } catch (error) {
      logger.error('Register error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/users/sync/:address
   * Đồng bộ reputation từ blockchain
   */
  syncReputation: async (req, res) => {
    try {
      const { address } = req.params;
      
      const user = await User.findOne({ walletAddress: address.toLowerCase() });
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      const onChainScore = await contractService.getReputation(address);
      const onChainTier = await contractService.getTier(address);
      const tierMap = ['Restricted', 'Warning', 'Normal', 'Trusted'];
      
      if (onChainScore !== null && onChainScore !== user.reputation.score) {
        user.reputation.score = onChainScore;
        user.reputation.tier = tierMap[onChainTier] || 'Normal';
        await user.save();
        logger.info(`Reputation synced for ${address}: ${onChainScore}`);
      }

      res.json({
        success: true,
        message: 'Reputation synced from blockchain',
        reputation: user.reputation
      });
    } catch (error) {
      logger.error('Sync reputation error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = userController;