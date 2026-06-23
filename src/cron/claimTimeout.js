const cron = require('node-cron');
const Job = require('../models/Job');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');

const REVIEW_PERIOD_SECONDS = 7 * 24 * 60 * 60;

/**
 * Hourly cron: call EscrowVault.claimTimeoutRelease for jobs past review period.
 */
class ClaimTimeoutCron {
  start() {
    if (!process.env.INDEXER_PRIVATE_KEY) {
      logger.info('Claim timeout cron skipped (INDEXER_PRIVATE_KEY not set)');
      return;
    }

    cron.schedule('0 * * * *', async () => {
      await this.processTimedOutJobs();
    });

    logger.info('Claim timeout cron scheduled (hourly)');
  }

  async processTimedOutJobs() {
    try {
      const cutoff = Math.floor(Date.now() / 1000) - REVIEW_PERIOD_SECONDS;
      const jobs = await Job.find({
        status: 'SUBMITTED',
        submittedAt: { $lte: cutoff },
        isActive: true,
      }).limit(50);

      for (const job of jobs) {
        try {
          await contractService.claimTimeoutRelease(job.onchainJobId);
          logger.info(`claimTimeoutRelease submitted for job ${job.onchainJobId}`);
        } catch (error) {
          logger.error(`claimTimeoutRelease failed for job ${job.onchainJobId}:`, error.message);
        }
      }
    } catch (error) {
      logger.error('Claim timeout cron error:', error);
    }
  }
}

module.exports = new ClaimTimeoutCron();
