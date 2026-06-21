// 📄 KIỂM TRA FILE NÀY
const blockchain = require('../../config/blockchain');
const logger = require('../../utils/logger');

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

  async getContract(name) {
    await this.init();
    return blockchain.getContract(name);
  }

  // ... các hàm khác
}

module.exports = new ContractService();