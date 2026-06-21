// 📄 KIỂM TRA FILE NÀY ĐÃ CÓ CHƯA
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = {
  // Xác thực JWT từ header
  authenticate: async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'No token provided'
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findOne({ walletAddress: decoded.walletAddress });
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
  },

  // Kiểm tra user có phải là client không
  isClient: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    // Client là người tạo job
    next();
  },

  // Kiểm tra user có phải là freelancer không
  isFreelancer: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    next();
  },

  // Tạo JWT token
  generateToken: (walletAddress) => {
    return jwt.sign(
      { walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }
};

module.exports = auth;