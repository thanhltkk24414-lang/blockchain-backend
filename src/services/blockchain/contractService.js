// 📄 TOÀN BỘ FILE src/services/blockchain/contractService.js
const blockchain = require('../../config/blockchain');
const logger = require('../../utils/logger');
const { toUsdcUnits, computeTotalDepositUnits } = require('../../utils/usdc');
const { toChecksumAddress } = require('../../utils/address');

const ONCHAIN_STATUS_LABELS = {
  0: 'OPEN',
  1: 'ASSIGNED',
  2: 'IN_PROGRESS',
  3: 'SUBMITTED',
  5: 'COMPLETED',
  6: 'REFUNDED',
  7: 'CANCELLED',
};

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

  /** JobRegistry IDs are small sequential integers; timestamp fallbacks are ~1e12+. */
  isValidOnchainJobId(jobId) {
    const n = Number(jobId);
    return Number.isFinite(n) && n > 0 && n < 10_000_000;
  }

  formatChainError(error, context) {
    const parts = [error?.shortMessage, error?.reason, error?.message].filter(Boolean);
    const detail = parts[0] || 'Unknown blockchain error';
    return `${context}: ${detail}`;
  }

  async createJob(clientAddress, metadataCID, contractValue, duration) {
    await this.init();

    const signer = blockchain.getSigner();
    if (!signer) {
      throw new Error(
        'INDEXER_PRIVATE_KEY is not set — backend cannot call JobRegistry.createJob. ' +
          'Add a Sepolia wallet private key with ETH for gas (Railway env var INDEXER_PRIVATE_KEY).'
      );
    }

    const contract = blockchain.getContract('JobRegistry');
    const contractWithSigner = contract.connect(signer);
    const signerAddress = await signer.getAddress();

    logger.info(
      `Submitting JobRegistry.createJob (signer=${signerAddress}, apiClient=${clientAddress})`
    );

    try {
      const contractValueUnits = toUsdcUnits(contractValue);
      const tx = await contractWithSigner.createJob(metadataCID, contractValueUnits, duration);
      logger.info(`createJob tx submitted: ${tx.hash}`);
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === 'JobCreated');

      const jobId = event?.args?.jobId;
      if (jobId == null) {
        throw new Error(
          `createJob tx ${receipt.hash} confirmed but JobCreated event was not found in receipt logs`
        );
      }

      const numericJobId = Number(jobId);
      if (!this.isValidOnchainJobId(numericJobId)) {
        throw new Error(`createJob returned invalid jobId ${numericJobId} (expected sequential registry id)`);
      }

      const onChainJob = await this.getJob(numericJobId);
      if (!onChainJob?.client) {
        throw new Error(`Job ${numericJobId} not readable from JobRegistry after createJob`);
      }

      if (clientAddress && onChainJob.client.toLowerCase() !== clientAddress.toLowerCase()) {
        logger.warn(
          `On-chain job client (${onChainJob.client}) differs from API client (${clientAddress}). ` +
            'Escrow/deposit must be sent from the on-chain client wallet or use the same wallet for INDEXER_PRIVATE_KEY in demos.'
        );
      }

      logger.info(
        `Job created on-chain: id=${numericJobId} tx=${receipt.hash} onChainClient=${onChainJob.client}`
      );
      return numericJobId;
    } catch (error) {
      logger.error('Create job on-chain failed', {
        message: error.message,
        code: error.code,
        reason: error.reason,
        apiClient: clientAddress,
        signer: signerAddress,
      });
      throw new Error(this.formatChainError(error, 'JobRegistry.createJob failed'));
    }
  }

  mapOnchainStatus(status) {
    return ONCHAIN_STATUS_LABELS[Number(status)] ?? `UNKNOWN(${status})`;
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

  /**
   * Live JobRegistry read for API enrichment (freelancer + status for UI preflight).
   */
  async getOnchainJobView(jobId) {
    if (!this.isValidOnchainJobId(jobId)) {
      return null;
    }
    const job = await this.getJob(jobId);
    const zero = '0x0000000000000000000000000000000000000000';
    const freelancer = job.freelancer?.toLowerCase?.() === zero ? null : job.freelancer;
    return {
      onchainStatus: this.mapOnchainStatus(job.status),
      onchainStatusCode: job.status,
      onchainFreelancerAddress: freelancer ? toChecksumAddress(freelancer) : null,
      onchainClientAddress: job.client ? toChecksumAddress(job.client) : null,
      deliverableCID: job.deliverableCID || null,
    };
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

  /**
   * JobRegistry.assignFreelancer — only the on-chain job client (msg.sender at createJob) may call.
   * Backend uses INDEXER_PRIVATE_KEY because createJob is relayed from the same wallet.
   */
  async assignFreelancer(jobId, freelancerAddress) {
    await this.init();

    const signer = blockchain.getSigner();
    if (!signer) {
      throw new Error(
        'INDEXER_PRIVATE_KEY is not set — backend cannot call JobRegistry.assignFreelancer.'
      );
    }

    if (!this.isValidOnchainJobId(jobId)) {
      throw new Error(`Invalid on-chain job id: ${jobId}`);
    }

    const contract = blockchain.getContract('JobRegistry');
    const contractWithSigner = contract.connect(signer);
    const signerAddress = await signer.getAddress();

    const onChainJob = await this.getJob(jobId);
    if (!onChainJob?.client) {
      throw new Error(`Job ${jobId} not found on JobRegistry`);
    }
    if (onChainJob.client.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(
        `Indexer wallet (${signerAddress}) is not the on-chain client (${onChainJob.client}) for job ${jobId}`
      );
    }
    if (onChainJob.status !== 0) {
      throw new Error(`Job ${jobId} is not OPEN on-chain (status=${onChainJob.status})`);
    }

    logger.info(
      `Submitting JobRegistry.assignFreelancer (job=${jobId}, freelancer=${freelancerAddress}, signer=${signerAddress})`
    );

    try {
      const tx = await contractWithSigner.assignFreelancer(jobId, freelancerAddress);
      logger.info(`assignFreelancer tx submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      logger.info(`assignFreelancer confirmed for job ${jobId}: ${receipt.hash}`);
      return { hash: receipt.hash, receipt };
    } catch (error) {
      logger.error('assignFreelancer error:', error);
      throw new Error(this.formatChainError(error, 'JobRegistry.assignFreelancer failed'));
    }
  }

  // =============================================
  // 3. ESCROW VAULT
  // =============================================

  async depositEscrow(jobId, freelancer) {
    try {
      await this.init();
      
      const job = await this.getJob(jobId);
      const totalDeposit = Number(computeTotalDepositUnits(job.contractValue));
      
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