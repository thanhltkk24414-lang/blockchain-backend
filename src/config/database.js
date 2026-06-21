// 📄 src/config/database.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class Database {
  async connect() {
    try {
      // PHẢI có MONGODB_URI từ .env
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI is not defined in .env');
      }
      await mongoose.connect(uri, {
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      });
      logger.info('✅ MongoDB connected successfully');
    } catch (error) {
      logger.error('❌ MongoDB connection error:', error);
      // Không exit, vẫn chạy server
      console.error('MongoDB error:', error.message);
    }
  }
}

module.exports = new Database();