const { ethers } = require('ethers');
const Job = require('../../models/Job');
const blockchain = require('../../config/blockchain');
const { notifyJobChange } = require('../notifications/notificationService');
const logger = require('../../utils/logger');
const { jobLookupFilter } = require('../../utils/jobScope');

const ESCROW_EVENTS = ['EscrowDeposited', 'FundsReleased', 'DisputeRaised'];

const STATUS_BY_EVENT = {
  EscrowDeposited: 'ASSIGNED',
  FundsReleased: 'COMPLETED',
  DisputeRaised: 'DISPUTED',
};

/**
 * WebSocket listener for EscrowVault events (Contributor 1 scope).
 * Optional — only starts when SEPOLIA_WSS_URL is set.
 */
class RealtimeListener {
  constructor() {
    this.provider = null;
    this.contract = null;
  }

  async start() {
    const wssUrl = process.env.SEPOLIA_WSS_URL;
    if (!wssUrl) {
      logger.info('Realtime listener skipped (SEPOLIA_WSS_URL not set)');
      return;
    }

    try {
      await blockchain.initialize();
      this.provider = new ethers.WebSocketProvider(wssUrl);
      const abi = blockchain.loadAbi('EscrowVault');
      const address = blockchain.getContractAddress('EscrowVault');
      this.contract = new ethers.Contract(address, abi, this.provider);

      for (const eventName of ESCROW_EVENTS) {
        this.contract.on(eventName, async (...args) => {
          const event = args[args.length - 1];
          const jobId = args[0];
          await this.syncJobStatus(eventName, jobId, event?.log?.transactionHash);
        });
      }

      this.provider.on('error', (error) => {
        logger.error('WebSocket provider error:', error);
      });

      logger.info('Realtime EscrowVault listener started');
    } catch (error) {
      logger.error('Realtime listener setup failed:', error);
    }
  }

  async syncJobStatus(eventName, jobId, txHash) {
    const onchainJobId = Number(jobId);
    const status = STATUS_BY_EVENT[eventName];
    if (!status) return;

    try {
      const job = await Job.findOne(jobLookupFilter(onchainJobId));
      if (!job) {
        logger.warn(`Realtime sync: job ${onchainJobId} not found in DB (${eventName})`);
        return;
      }

      await job.updateStatus(status, `Synced from ${eventName}`, txHash || '');
      if (status === 'DISPUTED') {
        job.isDisputed = true;
        await job.save();
      }

      const eventTypeMap = {
        EscrowDeposited: 'escrow:deposited',
        FundsReleased: 'escrow:released',
        DisputeRaised: 'escrow:dispute_raised',
      };
      notifyJobChange(job, eventTypeMap[eventName] || 'job:status_updated', {
        source: 'realtime_listener',
        transactionHash: txHash || null,
      });

      logger.info(`Realtime sync: job ${onchainJobId} → ${status}`);
    } catch (error) {
      logger.error(`Realtime sync error (${eventName}):`, error);
    }
  }
}

module.exports = new RealtimeListener();
