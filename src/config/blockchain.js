// 📄 DÁN CODE NÀY VÀO FILE src/config/blockchain.js
const { ethers } = require('ethers');
const logger = require('../utils/logger');

class BlockchainConfig {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contracts = {};
  }

  async initialize() {
    try {
      // Khởi tạo provider
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      logger.info('✅ Blockchain provider initialized');
      
      // Khởi tạo signer cho indexer
      if (process.env.INDEXER_PRIVATE_KEY) {
        this.signer = new ethers.Wallet(process.env.INDEXER_PRIVATE_KEY, this.provider);
        logger.info('✅ Blockchain signer initialized');
      }

      return this.contracts;
    } catch (error) {
      logger.error('❌ Blockchain initialization failed:', error);
      throw error;
    }
  }

  getProvider() {
    return this.provider;
  }

  getSigner() {
    return this.signer;
  }
}

module.exports = new BlockchainConfig();