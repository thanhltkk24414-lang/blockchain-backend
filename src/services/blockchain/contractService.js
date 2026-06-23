// 📄 TOÀN BỘ FILE src/services/blockchain/contractService.js
const blockchain = require('../../config/blockchain');
const logger = require('../../utils/logger');

/**
 * 📝 Contract Service
 * Tương tác với các Smart Contract đã deploy
 */
class ContractService {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      await blockchain.initialize();
      this.initialized = true;
    }
    return this;
  }

  // =============================================
  // 1. REPUTATION STORE
  // =============================================

  async getReputation(address) {
    try {
      await this.init();
      const contract = blockchain.getContract('ReputationStore');
      const score = await contract.getScore(address);
      return Number(score);
    } catch (error) {
      logger.error('Get reputation error:', error);
      return null;
    }
  }

  async getTier(address) {
    try {
      await this.init();
      const contract = blockchain.getContract('ReputationStore');
      const tier = await contract.getTier(address);
      return Number(tier);
    } catch (error) {
      logger.error('Get tier error:', error);
      return null;
    }
  }

  async updateReputation(address, isAdd, amount) {
    try {
      await this.init();
      const contract = blockchain.getContract('ReputationStore');
      const tx = await contract.updateScore(address, isAdd, amount);
      await tx.wait();
      logger.info(`✅ Reputation updated for ${address}`);
      return tx;
    } catch (error) {
      logger.error('Update reputation error:', error);
      throw error;
    }
  }

  // =============================================
  // 2. JOB REGISTRY
  // =============================================

  async createJob(client, metadataCID, contractValue, duration) {
    try {
      await this.init();
      const contract = blockchain.getContract('JobRegistry');
      const tx = await contract.createJob(metadataCID, contractValue, duration);
      const receipt = await tx.wait();
      
      const event = receipt.logs
        .map(log => {
          try {
            return contract.interface.parseLog(log);
          } catch { return null; }
        })
        .find(parsed => parsed && parsed.name === 'JobCreated');
      
      const jobId = event?.args?.jobId;
      logger.info(`✅ Job created on-chain: ${jobId}`);
      return Number(jobId);
    } catch (error) {
      logger.error('Create job error:', error);
      throw error;
    }
  }

  async getJob(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('JobRegistry');
      const job = await contract.getJob(jobId);
      
      return {
        client: job.client,
        status: Number(job.status),
        freelancer: job.freelancer,
        contractValue: Number(job.contractValue),
        deadline: Number(job.deadline),
        submittedAt: Number(job.submittedAt),
        assignedAt: Number(job.assignedAt),
        metadataCID: job.jobMetadataCID,
        deliverableCID: job.deliverableCID
      };
    } catch (error) {
      logger.error('Get job error:', error);
      throw error;
    }
  }

  async submitProposal(jobId, bidAmount, proposalCID) {
    try {
      await this.init();
      const contract = blockchain.getContract('JobRegistry');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      
      const tx = await contractWithSigner.submitProposal(jobId, bidAmount, proposalCID);
      await tx.wait();
      logger.info(`✅ Proposal submitted for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Submit proposal error:', error);
      throw error;
    }
  }

  // =============================================
  // 3. ESCROW VAULT
  // =============================================

  async depositEscrow(jobId, freelancer) {
    try {
      await this.init();
      
      const job = await this.getJob(jobId);
      const totalDeposit = Math.floor(job.contractValue * 1.03);
      
      const usdcContract = blockchain.getContract('MockUSDC');
      const signer = blockchain.getSigner();
      const usdcWithSigner = usdcContract.connect(signer);
      
      const approveTx = await usdcWithSigner.approve(
        blockchain.getContractAddress('EscrowVault'),
        totalDeposit
      );
      await approveTx.wait();
      logger.info(`✅ USDC approved: ${totalDeposit}`);
      
      const escrowContract = blockchain.getContract('EscrowVault');
      const escrowWithSigner = escrowContract.connect(signer);
      
      const tx = await escrowWithSigner.depositEscrow(jobId, freelancer);
      await tx.wait();
      logger.info(`✅ Escrow deposited for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Deposit escrow error:', error);
      throw error;
    }
  }

  async startWork(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('EscrowVault');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      
      const tx = await contractWithSigner.startWork(jobId);
      await tx.wait();
      logger.info(`✅ Work started for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Start work error:', error);
      throw error;
    }
  }

  async submitWork(jobId, deliverableCID) {
    try {
      await this.init();
      const contract = blockchain.getContract('EscrowVault');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      
      const tx = await contractWithSigner.submitWork(jobId, deliverableCID);
      await tx.wait();
      logger.info(`✅ Work submitted for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Submit work error:', error);
      throw error;
    }
  }

  async approveAndRelease(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('EscrowVault');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      
      const tx = await contractWithSigner.approveAndRelease(jobId);
      await tx.wait();
      logger.info(`✅ Payment released for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Approve and release error:', error);
      throw error;
    }
  }

  async raiseDispute(jobId) {
    try {
      await this.init();
      
      const job = await this.getJob(jobId);
      const disputeFee = Math.min(job.contractValue * 0.02, 50);
      
      const usdcContract = blockchain.getContract('MockUSDC');
      const signer = blockchain.getSigner();
      const usdcWithSigner = usdcContract.connect(signer);
      
      const approveTx = await usdcWithSigner.approve(
        blockchain.getContractAddress('EscrowVault'),
        disputeFee
      );
      await approveTx.wait();
      logger.info(`✅ USDC approved for dispute fee: ${disputeFee}`);
      
      const escrowContract = blockchain.getContract('EscrowVault');
      const escrowWithSigner = escrowContract.connect(signer);
      
      const tx = await escrowWithSigner.raiseDispute(jobId);
      await tx.wait();
      logger.info(`✅ Dispute raised for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Raise dispute error:', error);
      throw error;
    }
  }

  // =============================================
  // 4. ARBITRATOR PANEL
  // =============================================

  async setupDisputePanel(jobId, initiator) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const tx = await contract.setupDisputePanel(jobId, initiator);
      await tx.wait();
      logger.info(`✅ Dispute panel setup for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Setup dispute panel error:', error);
      throw error;
    }
  }

  async startAppealRound(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const tx = await contract.startAppealRound(jobId);
      await tx.wait();
      logger.info(`✅ Appeal round started for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Start appeal round error:', error);
      throw error;
    }
  }

  async commitVote(jobId, voteHash) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      const tx = await contractWithSigner.commitVote(jobId, voteHash);
      await tx.wait();
      logger.info(`✅ Vote committed for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Commit vote error:', error);
      throw error;
    }
  }

  async revealVote(jobId, choice, salt) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      const tx = await contractWithSigner.revealVote(jobId, choice, salt);
      await tx.wait();
      logger.info(`✅ Vote revealed for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Reveal vote error:', error);
      throw error;
    }
  }

  async submitEvidence(jobId, ipfsHash) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const signer = blockchain.getSigner();
      const contractWithSigner = contract.connect(signer);
      const tx = await contractWithSigner.submitEvidence(jobId, ipfsHash);
      await tx.wait();
      logger.info(`✅ Evidence submitted for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('Submit evidence error:', error);
      throw error;
    }
  }

  async getChosenArbitrators(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const arbitrators = await contract.getChosenArbitrators(jobId);
      return arbitrators.map(a => a.toLowerCase());
    } catch (error) {
      logger.error('Get chosen arbitrators error:', error);
      return [];
    }
  }

  async getVote(jobId, arbitrator) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const vote = await contract.getVote(jobId, arbitrator);
      return Number(vote);
    } catch (error) {
      logger.error('Get vote error:', error);
      return 0;
    }
  }

  async getPendingResult(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const result = await contract.getPendingResult(jobId);
      return Number(result);
    } catch (error) {
      logger.error('Get pending result error:', error);
      return null;
    }
  }

  async isVotingFinalized(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      return await contract.isVotingFinalized(jobId);
    } catch (error) {
      logger.error('Check voting finalized error:', error);
      return false;
    }
  }

  async getDisputeRound(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const round = await contract.getDisputeRound(jobId);
      return Number(round);
    } catch (error) {
      logger.error('Get dispute round error:', error);
      return null;
    }
  }

  async getResultAt(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const resultAt = await contract.getResultAt(jobId);
      return Number(resultAt);
    } catch (error) {
      logger.error('Get result at error:', error);
      return null;
    }
  }

  async finalizeDispute(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('ArbitratorPanel');
      const result = await contract.finalizeDispute(jobId);
      return Number(result);
    } catch (error) {
      logger.error('Finalize dispute error:', error);
      throw error;
    }
  }

  async getArbitratorStake(address) {
    await this.init();
    const treasury = blockchain.getContract('PlatformTreasury');
    return treasury.arbitratorStakes(address);
  }

  async claimTimeoutRelease(jobId) {
    try {
      await this.init();
      const contract = blockchain.getContract('EscrowVault');
      const signer = blockchain.getSigner();
      if (!signer) {
        throw new Error('INDEXER_PRIVATE_KEY required for claimTimeoutRelease');
      }
      const contractWithSigner = contract.connect(signer);
      const tx = await contractWithSigner.claimTimeoutRelease(jobId);
      await tx.wait();
      logger.info(`claimTimeoutRelease confirmed for job ${jobId}`);
      return tx;
    } catch (error) {
      logger.error('claimTimeoutRelease error:', error);
      throw error;
    }
  }
}

module.exports = new ContractService();