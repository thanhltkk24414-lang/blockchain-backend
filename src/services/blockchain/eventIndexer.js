// 📄 KIỂM TRA FILE NÀY
const cron = require('node-cron');
const blockchain = require('../../config/blockchain');
const logger = require('../../utils/logger');

class EventIndexer {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    // Chạy mỗi 30 giây
    cron.schedule('*/30 * * * * *', async () => {
      if (this.isRunning) return;
      this.isRunning = true;
      
      try {
        await this.indexEvents();
      } catch (error) {
        logger.error('Event indexing error:', error);
      } finally {
        this.isRunning = false;
      }
    });
    
    logger.info('📡 Event indexer started');
  }

  async indexEvents() {
    // TODO: Implement event indexing
    logger.debug('Indexing events...');
  }
}

module.exports = new EventIndexer();