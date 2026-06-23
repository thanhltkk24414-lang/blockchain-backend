// 📄 src/config/database.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class Database {
  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  async connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      logger.warn(
        'MONGODB_URI is not defined — server will run without database (auth/jobs/indexer unavailable)'
      );
      return false;
    }

    try {
      await mongoose.connect(uri, {
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      });
      logger.info('✅ MongoDB connected successfully');
      return true;
    } catch (error) {
      logger.warn(
        `MongoDB unavailable (${error.message}). Server will run without DB — ` +
          '/health and /api/arbitrator/* work; auth, jobs, and indexer need MongoDB.'
      );
      return false;
    }
  }
}

module.exports = new Database();
