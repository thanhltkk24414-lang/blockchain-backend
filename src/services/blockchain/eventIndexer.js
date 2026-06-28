const cron = require('node-cron');
const Job = require('../../models/Job');
const User = require('../../models/User');
const Dispute = require('../../models/Dispute');
const IndexerState = require('../../models/IndexerState');
const blockchain = require('../../config/blockchain');
const contractService = require('./contractService');
const { toChecksumAddress, normalizeAddress } = require('../../utils/address');
const { notifyJobChange, notifyDispute } = require('../notifications/notificationService');
const logger = require('../../utils/logger');
const { attachJobScope, jobLookupFilter } = require('../../utils/jobScope');
const { findJobForCreate } = require('../../utils/jobReconcile');
const { freelancerNetFromReleasedEvent } = require('../freelancerStatsService');

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_POLL_CRON = '0 */2 * * * *'; // every 2 minutes
const RPC_DELAY_MS = 500;
const MAX_BACKOFF_MS = 60_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
  const code = error?.code ?? error?.error?.code;
  const message = String(error?.message || error?.shortMessage || error || '');
  return code === -32005 || /too many requests/i.test(message);
}

/**
 * Event Indexer — sync on-chain events into MongoDB.
 * Set ENABLE_EVENT_INDEXER=false in .env for local Postman testing (skips RPC polling).
 */
class EventIndexer {
  constructor() {
    this.isRunning = false;
    this.lastBlock = 0;
    this.batchSize = Number(process.env.INDEXER_BATCH_SIZE) || DEFAULT_BATCH_SIZE;
    this.pollCron = process.env.INDEXER_POLL_CRON || DEFAULT_POLL_CRON;
    this.rpcDelayMs = Number(process.env.INDEXER_RPC_DELAY_MS) || RPC_DELAY_MS;
    this.backoffMs = 0;
  }

  isEnabled() {
    const flag = process.env.ENABLE_EVENT_INDEXER;
    if (flag === undefined || flag === '') return true;
    return !['false', '0', 'no', 'off'].includes(String(flag).toLowerCase());
  }

  async start() {
    if (!this.isEnabled()) {
      logger.info('Event indexer disabled (ENABLE_EVENT_INDEXER=false)');
      return;
    }

    await blockchain.initialize();
    const state = await IndexerState.findOne({ id: 'lastBlock' });
    if (state) {
      this.lastBlock = state.blockNumber;
    }

    cron.schedule(this.pollCron, async () => {
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

    setTimeout(() => this.indexEvents(), 10_000);
    logger.info(
      `Event indexer started (batch=${this.batchSize}, cron="${this.pollCron}", rpcDelay=${this.rpcDelayMs}ms)`
    );
  }

  async queryFilterWithBackoff(contract, filter, fromBlock, toBlock) {
    let attempt = 0;
    const maxAttempts = 5;

    while (attempt < maxAttempts) {
      try {
        if (this.backoffMs > 0) {
          await delay(this.backoffMs);
        }
        const events = await contract.queryFilter(filter, fromBlock, toBlock);
        this.backoffMs = 0;
        return events;
      } catch (error) {
        if (!isRateLimitError(error)) {
          throw error;
        }

        attempt += 1;
        const waitMs = Math.min(
          MAX_BACKOFF_MS,
          this.rpcDelayMs * 2 ** attempt
        );
        this.backoffMs = waitMs;
        logger.warn(
          `RPC rate limit (eth_getLogs), backing off ${waitMs}ms (attempt ${attempt}/${maxAttempts})`
        );
        await delay(waitMs);
      }
    }

    throw new Error('RPC rate limit exceeded after retries');
  }

  async indexEvents() {
    try {
      const provider = blockchain.getProvider();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = this.lastBlock || Math.max(0, currentBlock - 5000);

      if (currentBlock <= fromBlock) return;

      const toBlock = Math.min(currentBlock, fromBlock + this.batchSize);

      logger.info(`Indexing events from ${fromBlock} to ${toBlock}`);

      await this.indexJobCreated(fromBlock, toBlock);
      await delay(this.rpcDelayMs);
      await this.indexJobStatusUpdated(fromBlock, toBlock);
      await delay(this.rpcDelayMs);
      await this.indexFreelancerAssigned(fromBlock, toBlock);
      await delay(this.rpcDelayMs);
      await this.indexEscrowEvents(fromBlock, toBlock);
      await delay(this.rpcDelayMs);
      await this.indexWorkEvents(fromBlock, toBlock);
      await delay(this.rpcDelayMs);
      await this.indexDisputeEvents(fromBlock, toBlock);

      this.lastBlock = toBlock;
      await IndexerState.findOneAndUpdate(
        { id: 'lastBlock' },
        { blockNumber: toBlock, updatedAt: new Date() },
        { upsert: true }
      );
      logger.info(`Indexed up to block ${toBlock}`);
    } catch (error) {
      if (isRateLimitError(error)) {
        logger.warn('Index events paused due to RPC rate limit; will retry on next poll');
        return;
      }
      logger.error('Index events error:', error);
    }
  }

  async indexJobCreated(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('JobRegistry');
      const filter = contract.filters.JobCreated();
      const events = await this.queryFilterWithBackoff(contract, filter, fromBlock, toBlock);

      for (const event of events) {
        const { jobId, client, contractValue } = event.args;
        const jobNumber = Number(jobId);

        const existing = await findJobForCreate(jobNumber);
        if (existing) continue;

        const jobData = await contractService.getJob(jobNumber);
        if (!jobData?.client) {
          logger.warn(`Job ${jobNumber} not readable from JobRegistry — skipping indexer insert`);
          continue;
        }
        const chainClient = client.toLowerCase();
        await this.ensureUser(client);

        const metadataCID = jobData.metadataCID || jobData.jobMetadataCID;
        if (!metadataCID) {
          logger.warn(`Job ${jobNumber} has no metadataCID on chain — skipping indexer insert`);
          continue;
        }

        const job = new Job(attachJobScope({
          onchainJobId: jobNumber,
          clientAddress: chainClient,
          onchainClientAddress: chainClient,
          contractValue: Number(contractValue),
          status: this.mapStatus(jobData.status),
          deadline: jobData.deadline,
          metadataCID,
          deliverableCID: jobData.deliverableCID,
          isActive: true,
          lastSyncedBlock: toBlock,
          isSynced: true,
        }));

        try {
          await job.save();
        } catch (saveErr) {
          if (saveErr?.code === 11000 || saveErr?.code === 11001) {
            logger.info(`Job ${jobNumber} already in DB (create race) — skipping indexer insert`);
            continue;
          }
          throw saveErr;
        }
        logger.info(`Job ${jobNumber} synced from chain`);
        notifyJobChange(job, 'job:created', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      logger.error('Index JobCreated error:', error);
    }
  }

  async indexJobStatusUpdated(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('JobRegistry');
      const filter = contract.filters.JobStatusUpdated();
      const events = await this.queryFilterWithBackoff(contract, filter, fromBlock, toBlock);

      for (const event of events) {
        const { jobId, newStatus } = event.args;
        const jobNumber = Number(jobId);

        const job = await Job.findOne(jobLookupFilter(jobNumber));
        if (!job) continue;

        const status = this.mapStatus(Number(newStatus));
        job.status = status;

        try {
          const onChainJob = await contractService.getJob(jobNumber);
          if (onChainJob.deliverableCID) {
            job.deliverableCID = onChainJob.deliverableCID;
          }
          if (onChainJob.submittedAt > 0) {
            job.submittedAt = onChainJob.submittedAt;
          }
          if (onChainJob.assignedAt > 0 && !job.assignedAt) {
            job.assignedAt = onChainJob.assignedAt;
          }
        } catch (syncErr) {
          logger.warn(`JobStatusUpdated: could not enrich job ${jobNumber}`, syncErr.message);
        }

        if (status === 'ASSIGNED') {
          job.assignedAt = Math.floor(Date.now() / 1000);
        } else if (status === 'SUBMITTED') {
          job.submittedAt = Math.floor(Date.now() / 1000);
        } else if (status === 'COMPLETED' || status === 'REFUNDED') {
          job.isActive = false;
          job.completedAt = Math.floor(Date.now() / 1000);
        }

        job.lastSyncedBlock = toBlock;
        await job.save();

        logger.info(`Job ${jobNumber} status updated to ${status}`);
        notifyJobChange(job, 'job:status_updated', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      logger.error('Index JobStatusUpdated error:', error);
    }
  }

  async indexFreelancerAssigned(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('JobRegistry');
      const filter = contract.filters.FreelancerAssigned();
      const events = await this.queryFilterWithBackoff(contract, filter, fromBlock, toBlock);

      for (const event of events) {
        const { jobId, freelancer } = event.args;
        const jobNumber = Number(jobId);

        const job = await Job.findOne(jobLookupFilter(jobNumber));
        if (!job) continue;

        job.freelancerAddress = freelancer.toLowerCase();
        try {
          job.onchainFreelancerAddress = toChecksumAddress(freelancer);
        } catch {
          job.onchainFreelancerAddress = freelancer;
        }
        await this.ensureUser(freelancer);
        job.lastSyncedBlock = toBlock;
        await job.save();

        logger.info(`Freelancer assigned to job ${jobNumber}`);
        notifyJobChange(job, 'job:freelancer_assigned', {
          source: 'event_indexer',
          freelancerAddress: freelancer.toLowerCase(),
          transactionHash: event.log?.transactionHash || null,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      logger.error('Index FreelancerAssigned error:', error);
    }
  }

  async indexEscrowEvents(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('EscrowVault');

      const depositedFilter = contract.filters.EscrowDeposited();
      const depositedEvents = await this.queryFilterWithBackoff(
        contract,
        depositedFilter,
        fromBlock,
        toBlock
      );
      for (const event of depositedEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne(jobLookupFilter(jobId));
        if (!job) continue;

        try {
          const onChainJob = await contractService.getJob(jobId);
          const zero = '0x0000000000000000000000000000000000000000';
          if (onChainJob.freelancer && onChainJob.freelancer.toLowerCase() !== zero) {
            job.freelancerAddress = normalizeAddress(onChainJob.freelancer);
            job.onchainFreelancerAddress = toChecksumAddress(onChainJob.freelancer);
          }
        } catch (syncErr) {
          logger.warn(`EscrowDeposited: could not sync freelancer for job ${jobId}`, syncErr.message);
        }

        await job.updateStatus('ASSIGNED', 'EscrowDeposited', event.log?.transactionHash || '');
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`EscrowDeposited synced for job ${jobId}`);
        notifyJobChange(job, 'escrow:deposited', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }

      await delay(this.rpcDelayMs);

      const releasedFilter = contract.filters.FundsReleased();
      const releasedEvents = await this.queryFilterWithBackoff(
        contract,
        releasedFilter,
        fromBlock,
        toBlock
      );
      for (const event of releasedEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne(jobLookupFilter(jobId));
        if (!job) continue;
        await job.updateStatus('COMPLETED', 'FundsReleased', event.log?.transactionHash || '');
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`FundsReleased synced for job ${jobId}`);

        const freelancerWallet = (
          event.args.freelancer ||
          job.freelancerAddress ||
          job.onchainFreelancerAddress ||
          ''
        ).toLowerCase();
        if (freelancerWallet) {
          const earned = freelancerNetFromReleasedEvent(event.args.amount);
          await User.findOneAndUpdate(
            { walletAddress: freelancerWallet },
            {
              $inc: {
                'stats.jobsCompleted': 1,
                'stats.totalEarned': earned,
              },
            },
          );
        }

        notifyJobChange(job, 'escrow:released', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }

      await delay(this.rpcDelayMs);

      const disputeFilter = contract.filters.DisputeRaised();
      const disputeEvents = await this.queryFilterWithBackoff(
        contract,
        disputeFilter,
        fromBlock,
        toBlock
      );
      for (const event of disputeEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne(jobLookupFilter(jobId));
        if (!job) continue;
        await job.updateStatus('DISPUTED', 'DisputeRaised', event.log?.transactionHash || '');
        job.isDisputed = true;
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`DisputeRaised synced for job ${jobId}`);
        notifyJobChange(job, 'escrow:dispute_raised', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      logger.error('Index Escrow events error:', error);
    }
  }

  async indexWorkEvents(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('EscrowVault');

      const startedFilter = contract.filters.WorkStarted();
      const startedEvents = await this.queryFilterWithBackoff(
        contract,
        startedFilter,
        fromBlock,
        toBlock,
      );
      for (const event of startedEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne(jobLookupFilter(jobId));
        if (!job) continue;

        await job.updateStatus('IN_PROGRESS', 'WorkStarted', event.log?.transactionHash || '');
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`WorkStarted synced for job ${jobId}`);
        notifyJobChange(job, 'job:work_started', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }

      await delay(this.rpcDelayMs);

      const submittedFilter = contract.filters.WorkSubmitted();
      const submittedEvents = await this.queryFilterWithBackoff(
        contract,
        submittedFilter,
        fromBlock,
        toBlock,
      );
      for (const event of submittedEvents) {
        const jobId = Number(event.args.jobId);
        const deliverableCID = event.args.deliverableCID;
        const job = await Job.findOne(jobLookupFilter(jobId));
        if (!job) continue;

        if (deliverableCID) {
          job.deliverableCID = deliverableCID;
        }
        await job.updateStatus('SUBMITTED', 'WorkSubmitted', event.log?.transactionHash || '');
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`WorkSubmitted synced for job ${jobId}`);
        notifyJobChange(job, 'job:work_submitted', {
          source: 'event_indexer',
          deliverableCID: deliverableCID || null,
          transactionHash: event.log?.transactionHash || null,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      logger.error('Index Work events error:', error);
    }
  }

  async indexDisputeEvents(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('ArbitratorPanel');

      const setupFilter = contract.filters.DisputeSetup();
      const setupEvents = await this.queryFilterWithBackoff(
        contract,
        setupFilter,
        fromBlock,
        toBlock
      );

      for (const event of setupEvents) {
        const { jobId, arbitrators } = event.args;
        const jobNumber = Number(jobId);

        const job = await Job.findOne(jobLookupFilter(jobNumber));
        if (!job) continue;

        const existing = await Dispute.findOne({ onchainJobId: jobNumber });
        if (existing) continue;

        const dispute = new Dispute({
          jobId: job._id,
          onchainJobId: jobNumber,
          initiatorAddress: job.clientAddress,
          respondentAddress: job.freelancerAddress,
          arbitrators: arbitrators.map((addr) => ({
            address: addr.toLowerCase(),
            vote: 'UNDECIDED',
            isRevealed: false,
          })),
          status: 'OPEN',
          openedAt: new Date(),
        });

        await dispute.save();
        job.disputeId = dispute._id;
        job.isDisputed = true;
        if (job.status !== 'DISPUTED') {
          await job.updateStatus('DISPUTED', 'DisputeSetup', event.log?.transactionHash || '');
        } else {
          await job.save();
        }

        logger.info(`Dispute created for job ${jobNumber}`);
        notifyDispute(dispute, job, 'dispute:opened', {
          source: 'event_indexer',
          transactionHash: event.log?.transactionHash || null,
        });
      }

      await delay(this.rpcDelayMs);

      const evidenceFilter = contract.filters.EvidenceSubmitted();
      const evidenceEvents = await this.queryFilterWithBackoff(
        contract,
        evidenceFilter,
        fromBlock,
        toBlock,
      );

      for (const event of evidenceEvents) {
        const { jobId, submitter, ipfsHash } = event.args;
        const jobNumber = Number(jobId);
        const submitterLower = submitter.toLowerCase();
        const hashLower = String(ipfsHash).toLowerCase();

        let dispute = await Dispute.findOne({ onchainJobId: jobNumber });
        if (!dispute) {
          const job = await Job.findOne(jobLookupFilter(jobNumber));
          if (!job) continue;
          dispute = new Dispute({
            jobId: job._id,
            onchainJobId: jobNumber,
            initiatorAddress: job.clientAddress,
            respondentAddress: job.freelancerAddress,
            status: 'OPEN',
            openedAt: new Date(),
          });
        }

        const existing = dispute.evidence.find(
          (entry) =>
            (entry.onChainHash && entry.onChainHash === hashLower) ||
            (entry.submitter === submitterLower &&
              entry.ipfsHash &&
              !entry.onChainHash),
        );

        if (existing) {
          if (!existing.onChainHash) existing.onChainHash = hashLower;
        } else {
          dispute.evidence.push({
            submitter: submitterLower,
            onChainHash: hashLower,
            submittedAt: new Date(),
          });
        }

        await dispute.save();
        logger.info(`EvidenceSubmitted synced for job ${jobNumber} (${hashLower.slice(0, 10)}…)`);
      }

      await delay(this.rpcDelayMs);

      const finalFilter = contract.filters.DisputeFinalized();
      const finalEvents = await this.queryFilterWithBackoff(
        contract,
        finalFilter,
        fromBlock,
        toBlock
      );

      for (const event of finalEvents) {
        const { jobId, result, round } = event.args;
        const jobNumber = Number(jobId);

        const dispute = await Dispute.findOne({ onchainJobId: jobNumber });
        if (!dispute) continue;

        const resultMap = ['UNDECIDED', 'FREELANCER_WIN', 'CLIENT_WIN', 'SPLIT_50_50'];
        dispute.result = resultMap[Number(result)];
        dispute.isResolved = true;
        dispute.finalizedAt = new Date();
        dispute.status = 'FINALIZED';
        dispute.round = Number(round);
        await dispute.save();

        const job = await Job.findOne(jobLookupFilter(jobNumber));
        if (job) {
          if (Number(result) === 1) {
            job.status = 'COMPLETED';
          } else if (Number(result) === 2) {
            job.status = 'REFUNDED';
          } else if (Number(result) === 3) {
            job.status = 'COMPLETED';
          }
          await job.save();
        }

        logger.info(`Dispute finalized for job ${jobNumber}: ${dispute.result}`);
        notifyDispute(dispute, job, 'dispute:finalized', {
          source: 'event_indexer',
          jobStatus: job?.status || null,
          transactionHash: event.log?.transactionHash || null,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      logger.error('Index Dispute events error:', error);
    }
  }

  mapStatus(status) {
    const map = {
      0: 'OPEN',
      1: 'ASSIGNED',
      2: 'IN_PROGRESS',
      3: 'SUBMITTED',
      4: 'DISPUTED',
      5: 'COMPLETED',
      6: 'REFUNDED',
      7: 'CANCELLED',
    };
    return map[status] || 'OPEN';
  }

  async ensureUser(address) {
    const existing = await User.findOne({ walletAddress: address.toLowerCase() });
    if (!existing) {
      const score = await contractService.getReputation(address);
      const tier = await contractService.getTier(address);
      const tierMap = ['Restricted', 'Warning', 'Normal', 'Trusted'];

      const user = new User({
        walletAddress: address.toLowerCase(),
        username: `user_${address.slice(0, 8)}`,
        reputation: {
          score: score || 100,
          tier: tierMap[tier] || 'Normal',
        },
      });
      await user.save();
      logger.info(`Created user: ${address}`);
    }
    return existing;
  }
}

module.exports = new EventIndexer();
