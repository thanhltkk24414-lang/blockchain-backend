// 📄 TOÀN BỘ FILE src/config/blockchain.js (THAY MỚI HOÀN TOÀN)
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * 📝 Blockchain Configuration
 * Kết nối với Ethereum và Smart Contracts đã deploy
 */
class BlockchainConfig {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contracts = {};
    this.addresses = {};
  }

  async initialize() {
    try {
      // 1. Đọc địa chỉ từ .env
      this.addresses = {
        usdc: process.env.USDC_ADDRESS,
        reputationStore: process.env.REPUTATION_STORE_ADDRESS,
        platformTreasury: process.env.PLATFORM_TREASURY_ADDRESS,
        jobRegistry: process.env.JOB_REGISTRY_ADDRESS,
        arbitratorPanel: process.env.ARBITRATOR_PANEL_ADDRESS,
        escrowVault: process.env.ESCROW_VAULT_ADDRESS,
      };

      // Kiểm tra địa chỉ
      for (const [name, address] of Object.entries(this.addresses)) {
        if (!address || address === '0x...') {
          throw new Error(`Missing address for ${name}`);
        }
        logger.info(`✅ ${name}: ${address}`);
      }

      // 2. Khởi tạo provider
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      logger.info('✅ Provider initialized');

      // 3. Khởi tạo signer (cho indexer)
      if (process.env.INDEXER_PRIVATE_KEY) {
        this.signer = new ethers.Wallet(process.env.INDEXER_PRIVATE_KEY, this.provider);
        logger.info('✅ Signer initialized');
      }

      // 4. Đọc ABIs từ file (đã copy từ contracts)
      const abiPath = path.join(__dirname, '../abi');
      
      // Danh sách contract cần init
      const contractConfigs = [
        { name: 'usdc', key: 'usdc', file: 'MockUSDC.json' },
        { name: 'reputationStore', key: 'reputationStore', file: 'ReputationStore.json' },
        { name: 'platformTreasury', key: 'platformTreasury', file: 'PlatformTreasury.json' },
        { name: 'jobRegistry', key: 'jobRegistry', file: 'JobRegistry.json' },
        { name: 'arbitratorPanel', key: 'arbitratorPanel', file: 'ArbitratorPanel.json' },
        { name: 'escrowVault', key: 'escrowVault', file: 'EscrowVault.json' },
      ];

      for (const config of contractConfigs) {
        const abiFile = path.join(abiPath, config.file);
        
        if (!fs.existsSync(abiFile)) {
          logger.warn(`⚠️ ABI file not found: ${abiFile}`);
          continue;
        }

        // Đọc ABI
        const artifact = JSON.parse(fs.readFileSync(abiFile, 'utf8'));
        const abi = artifact.abi || artifact;
        
        const address = this.addresses[config.key];
        if (!address) {
          logger.warn(`⚠️ Address not found for ${config.name}`);
          continue;
        }

        // Tạo contract instance
        this.contracts[config.name] = new ethers.Contract(
          address,
          abi,
          this.provider
        );

        // Connect signer nếu có
        if (this.signer) {
          this.contracts[config.name] = this.contracts[config.name].connect(this.signer);
        }

        logger.info(`✅ Contract ${config.name} initialized at ${address}`);
      }

      logger.info('✅ Blockchain configuration complete');
      return this.contracts;

    } catch (error) {
      logger.error('❌ Blockchain initialization failed:', error);
      throw error;
    }
  }

  getContract(name) {
    if (!this.contracts[name]) {
      throw new Error(`Contract ${name} not found`);
    }
    return this.contracts[name];
  }

  getProvider() {
    return this.provider;
  }

  getSigner() {
    return this.signer;
  }

  getAddress(name) {
    return this.addresses[name];
  }
}

module.exports = new BlockchainConfig();