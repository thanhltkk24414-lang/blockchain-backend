const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const CONTRACT_NAMES = [
  'MockUSDC',
  'ReputationStore',
  'PlatformTreasury',
  'JobRegistry',
  'ArbitratorPanel',
  'EscrowVault',
];

const ENV_ADDRESS_KEYS = {
  MockUSDC: 'MOCK_USDC_ADDRESS',
  ReputationStore: 'REPUTATION_STORE_ADDRESS',
  PlatformTreasury: 'PLATFORM_TREASURY_ADDRESS',
  JobRegistry: 'JOB_REGISTRY_ADDRESS',
  ArbitratorPanel: 'ARBITRATOR_PANEL_ADDRESS',
  EscrowVault: 'ESCROW_VAULT_ADDRESS',
};

class BlockchainConfig {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contracts = {};
  }

  loadAbi(contractName) {
    const abiPath = path.join(__dirname, '..', 'abi', `${contractName}.json`);
    if (!fs.existsSync(abiPath)) {
      throw new Error(
        `ABI not found for ${contractName}. Run \`npm run export-abis\` from the monorepo root.`
      );
    }

    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    if (!Array.isArray(abi) || abi.length === 0) {
      throw new Error(`ABI file is empty for ${contractName}: ${abiPath}`);
    }

    return abi;
  }

  getContractAddress(contractName) {
    const envKey = ENV_ADDRESS_KEYS[contractName];
    const address = process.env[envKey];
    if (!address) {
      throw new Error(`${envKey} is not set in backend/.env`);
    }
    return address;
  }

  async initialize() {
    try {
      const rpcUrl = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL;
      if (!rpcUrl) {
        throw new Error('RPC_URL or SEPOLIA_RPC_URL is not defined in backend/.env');
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      logger.info('Blockchain provider initialized');

      if (process.env.INDEXER_PRIVATE_KEY) {
        this.signer = new ethers.Wallet(process.env.INDEXER_PRIVATE_KEY, this.provider);
        logger.info('Blockchain signer initialized');
      }

      for (const name of CONTRACT_NAMES) {
        const address = this.getContractAddress(name);
        const abi = this.loadAbi(name);
        const runner = this.signer || this.provider;
        this.contracts[name] = new ethers.Contract(address, abi, runner);
        logger.info(`Loaded contract ${name} at ${address}`);
      }

      return this.contracts;
    } catch (error) {
      logger.error('Blockchain initialization failed:', error);
      throw error;
    }
  }

  getContract(name) {
    const contract = this.contracts[name];
    if (!contract) {
      throw new Error(`Contract not loaded: ${name}. Call initialize() first.`);
    }
    return contract;
  }

  getProvider() {
    return this.provider;
  }

  getSigner() {
    return this.signer;
  }
}

module.exports = new BlockchainConfig();
