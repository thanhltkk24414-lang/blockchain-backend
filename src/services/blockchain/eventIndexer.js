// 📄 TOÀN BỘ FILE src/services/blockchain/eventIndexer.js
const cron = require('node-cron');
const Job = require('../../models/Job');
const User = require('../../models/User');
const Dispute = require('../../models/Dispute');
const IndexerState = require('../../models/IndexerState');
const blockchain = require('../../config/blockchain');
const contractService = require('./contractService');
const logger = require('../../utils/logger');

/**
 * 📝 Event Indexer
 * Đồng bộ dữ liệu từ blockchain vào database
 */
class EventIndexer {
  constructor() {
    this.isRunning = false;
    this.lastBlock = 0;
    this.batchSize = 1000;
  }

  async start() {
    await blockchain.initialize();
    const state = await IndexerState.findOne({ id: 'lastBlock' });
    if (state) {
      this.lastBlock = state.blockNumber;
    }

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
    
    setTimeout(() => this.indexEvents(), 5000);
    logger.info('📡 Event indexer started');
  }

  async indexEvents() {
    try {
      const provider = blockchain.getProvider();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = this.lastBlock || Math.max(0, currentBlock - 10000);
      
      if (currentBlock <= fromBlock) return;
      
      const toBlock = Math.min(currentBlock, fromBlock + this.batchSize);
      
      logger.info(`📡 Indexing events from ${fromBlock} to ${toBlock}`);
      
      await this.indexJobCreated(fromBlock, toBlock);
      await this.indexJobStatusUpdated(fromBlock, toBlock);
      await this.indexFreelancerAssigned(fromBlock, toBlock);
      await this.indexEscrowEvents(fromBlock, toBlock);
      await this.indexDisputeEvents(fromBlock, toBlock);
      
      this.lastBlock = toBlock;
      await IndexerState.findOneAndUpdate(
        { id: 'lastBlock' },
        { blockNumber: toBlock, updatedAt: new Date() },
        { upsert: true }
      );
      logger.info(`✅ Indexed up to block ${toBlock}`);
    } catch (error) {
      logger.error('Index events error:', error);
    }
  }

  // =============================================
  // JOB CREATED
  // =============================================
  
  async indexJobCreated(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('JobRegistry');
      const filter = contract.filters.JobCreated();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);

      for (const event of events) {
        const { jobId, client, contractValue } = event.args;
        const jobNumber = Number(jobId);
        
        const existing = await Job.findOne({ onchainJobId: jobNumber });
        if (existing) continue;

        const jobData = await contractService.getJob(jobNumber);
        await this.ensureUser(client);

        const job = new Job({
          onchainJobId: jobNumber,
          clientAddress: client.toLowerCase(),
          contractValue: Number(contractValue),
          status: this.mapStatus(jobData.status),
          deadline: jobData.deadline,
          metadataCID: jobData.metadataCID,
          deliverableCID: jobData.deliverableCID,
          isActive: true,
          lastSyncedBlock: toBlock,
          isSynced: true
        });
        
        await job.save();
        logger.info(`✅ Job ${jobNumber} synced from chain`);
      }
    } catch (error) {
      logger.error('Index JobCreated error:', error);
    }
  }

  // =============================================
  // JOB STATUS UPDATED
  // =============================================
  
  async indexJobStatusUpdated(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('JobRegistry');
      const filter = contract.filters.JobStatusUpdated();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);

      for (const event of events) {
        const { jobId, newStatus } = event.args;
        const jobNumber = Number(jobId);
        
        const job = await Job.findOne({ onchainJobId: jobNumber });
        if (!job) continue;

        const status = this.mapStatus(Number(newStatus));
        job.status = status;
        
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
        
        logger.info(`✅ Job ${jobNumber} status updated to ${status}`);
      }
    } catch (error) {
      logger.error('Index JobStatusUpdated error:', error);
    }
  }

  // =============================================
  // FREELANCER ASSIGNED
  // =============================================
  
  async indexFreelancerAssigned(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('JobRegistry');
      const filter = contract.filters.FreelancerAssigned();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);

      for (const event of events) {
        const { jobId, freelancer } = event.args;
        const jobNumber = Number(jobId);
        
        const job = await Job.findOne({ onchainJobId: jobNumber });
        if (!job) continue;

        job.freelancerAddress = freelancer.toLowerCase();
        await this.ensureUser(freelancer);
        job.lastSyncedBlock = toBlock;
        await job.save();
        
        logger.info(`✅ Freelancer assigned to job ${jobNumber}`);
      }
    } catch (error) {
      logger.error('Index FreelancerAssigned error:', error);
    }
  }

  // =============================================
  // ESCROW EVENTS (EscrowVault)
  // =============================================

  async indexEscrowEvents(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('EscrowVault');

      const depositedFilter = contract.filters.EscrowDeposited();
      const depositedEvents = await contract.queryFilter(depositedFilter, fromBlock, toBlock);
      for (const event of depositedEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne({ onchainJobId: jobId });
        if (!job) continue;
        await job.updateStatus('ASSIGNED', 'EscrowDeposited', event.log?.transactionHash || '');
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`EscrowDeposited synced for job ${jobId}`);
      }

      const releasedFilter = contract.filters.FundsReleased();
      const releasedEvents = await contract.queryFilter(releasedFilter, fromBlock, toBlock);
      for (const event of releasedEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne({ onchainJobId: jobId });
        if (!job) continue;
        await job.updateStatus('COMPLETED', 'FundsReleased', event.log?.transactionHash || '');
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`FundsReleased synced for job ${jobId}`);
      }

      const disputeFilter = contract.filters.DisputeRaised();
      const disputeEvents = await contract.queryFilter(disputeFilter, fromBlock, toBlock);
      for (const event of disputeEvents) {
        const jobId = Number(event.args.jobId);
        const job = await Job.findOne({ onchainJobId: jobId });
        if (!job) continue;
        await job.updateStatus('DISPUTED', 'DisputeRaised', event.log?.transactionHash || '');
        job.isDisputed = true;
        job.lastSyncedBlock = toBlock;
        await job.save();
        logger.info(`DisputeRaised synced for job ${jobId}`);
      }
    } catch (error) {
      logger.error('Index Escrow events error:', error);
    }
  }

  // =============================================
  // DISPUTE EVENTS
  // =============================================
  
  async indexDisputeEvents(fromBlock, toBlock) {
    try {
      const contract = blockchain.getContract('ArbitratorPanel');
      
      // DisputeSetup
      const setupFilter = contract.filters.DisputeSetup();
      const setupEvents = await contract.queryFilter(setupFilter, fromBlock, toBlock);

      for (const event of setupEvents) {
        const { jobId, arbitrators } = event.args;
        const jobNumber = Number(jobId);
        
        const job = await Job.findOne({ onchainJobId: jobNumber });
        if (!job) continue;

        const existing = await Dispute.findOne({ onchainJobId: jobNumber });
        if (existing) continue;

        const dispute = new Dispute({
          jobId: job._id,
          onchainJobId: jobNumber,
          initiatorAddress: job.clientAddress,
          respondentAddress: job.freelancerAddress,
          arbitrators: arbitrators.map(addr => ({
            address: addr.toLowerCase(),
            vote: 'UNDECIDED',
            isRevealed: false
          })),
          status: 'OPEN',
          openedAt: new Date()
        });
        
        await dispute.save();
        job.disputeId = dispute._id;
        job.isDisputed = true;
        await job.save();
        
        logger.info(`✅ Dispute created for job ${jobNumber}`);
      }
      
      // DisputeFinalized
      const finalFilter = contract.filters.DisputeFinalized();
      const finalEvents = await contract.queryFilter(finalFilter, fromBlock, toBlock);

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
        
        const job = await Job.findOne({ onchainJobId: jobNumber });
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
        
        logger.info(`✅ Dispute finalized for job ${jobNumber}: ${dispute.result}`);
      }
    } catch (error) {
      logger.error('Index Dispute events error:', error);
    }
  }

  // =============================================
  // HELPERS
  // =============================================
  
  mapStatus(status) {
    const map = {
      0: 'OPEN',
      1: 'ASSIGNED',
      2: 'IN_PROGRESS',
      3: 'SUBMITTED',
      4: 'DISPUTED',
      5: 'COMPLETED',
      6: 'REFUNDED',
      7: 'CANCELLED'
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
          tier: tierMap[tier] || 'Normal'
        }
      });
      await user.save();
      logger.info(`✅ Created user: ${address}`);
    }
    return existing;
  }
}

module.exports = new EventIndexer();