// 📄 src/server.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const app = require('./app');
const connectDB = require('./config/database');
const eventIndexer = require('./services/blockchain/eventIndexer');
const realtimeListener = require('./services/blockchain/realtimeListener');
const claimTimeoutCron = require('./cron/claimTimeout');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

async function startServer() {
  const mongoConnected = await connectDB.connect();

  app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    if (!mongoConnected) {
      logger.warn(
        'Background services skipped (event indexer, realtime listener, claim-timeout cron) — MongoDB not connected'
      );
      return;
    }

    try {
      await eventIndexer.start();
      await realtimeListener.start();
      claimTimeoutCron.start();
    } catch (bgError) {
      logger.error('Background services failed to start:', bgError);
    }
  });
}

startServer();
