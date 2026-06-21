// 📄 DÁN CODE NÀY VÀO FILE src/cron/indexer.js
const logger = require('../utils/logger');

class EventIndexer {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    logger.info('📡 Event indexer started (placeholder)');
    return this;
  }
}

module.exports = new EventIndexer();