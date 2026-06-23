const { ethers } = require('ethers');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');

const MIN_STAKE_USDC = 50;

const arbitratorController = {
  /**
   * GET /api/arbitrator/:address/status
   * Kiểm tra cọc trọng tài trước khi vote (PlatformTreasury.arbitratorStakes).
   */
  getStakeStatus: async (req, res) => {
    try {
      const walletAddress = req.params.address;
      const stakedAmountWei = await contractService.getArbitratorStake(walletAddress);
      const stakedUSDC = parseFloat(ethers.formatUnits(stakedAmountWei, 6));
      const isValid = stakedUSDC >= MIN_STAKE_USDC;

      res.status(200).json({
        success: true,
        address: walletAddress,
        stakedAmount: stakedUSDC,
        minStake: MIN_STAKE_USDC,
        isValid,
        message: isValid
          ? 'Đủ điều kiện tham gia phân xử'
          : 'Số dư cọc không đủ hạn mức tối thiểu',
      });
    } catch (error) {
      logger.error('Arbitrator stake check error:', error);
      res.status(500).json({
        success: false,
        error: 'Lỗi hệ thống khi kết nối dữ liệu Blockchain.',
      });
    }
  },
};

module.exports = arbitratorController;
