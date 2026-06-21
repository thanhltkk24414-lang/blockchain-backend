// 📄 KIỂM TRA FILE NÀY
const User = require('../models/User');
const blockchain = require('../config/blockchain');
const logger = require('../utils/logger');

class ReputationService {
  async getOnChainScore(address) {
    try {
      const contract = blockchain.getContract('reputationStore');
      const score = await contract.getScore(address);
      return Number(score);
    } catch (error) {
      logger.error('Get on-chain score error:', error);
      return null;
    }
  }

  async updateUserTier(user) {
    const score = user.reputation.score;
    
    if (score >= 120) {
      user.reputation.tier = 'Trusted';
    } else if (score >= 80) {
      user.reputation.tier = 'Normal';
    } else if (score >= 50) {
      user.reputation.tier = 'Warning';
    } else {
      user.reputation.tier = 'Restricted';
    }
    
    return user;
  }

  async syncReputation(address) {
    const user = await User.findOne({ walletAddress: address.toLowerCase() });
    if (!user) return null;

    const onChainScore = await this.getOnChainScore(address);
    if (onChainScore !== null && user.reputation.score !== onChainScore) {
      user.reputation.score = onChainScore;
      await this.updateUserTier(user);
      await user.save();
      logger.info(`✅ Reputation synced for ${address}: ${onChainScore}`);
    }

    return user;
  }
}

module.exports = new ReputationService();