// 📄 DÁN VÀO src/controllers/bidController.js
const Bid = require('../models/Bid');
const Job = require('../models/Job');
const User = require('../models/User');
const ipfsService = require('../config/ipfs');
const logger = require('../utils/logger');

/**
 * 📝 Bid Controller
 * Xử lý các request liên quan đến proposal
 */
const bidController = {
  /**
   * GET /api/bids/job/:jobId
   * 📝 Lấy tất cả bids của một job
   */
  getBidsByJob: async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const bids = await Bid.find({ jobId })
        .sort({ bidAmount: 1 });

      res.json({
        success: true,
        bids,
        count: bids.length
      });
    } catch (error) {
      logger.error('Get bids by job error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/bids/my/:address
   * 📝 Lấy bids của freelancer
   */
  getMyBids: async (req, res) => {
    try {
      const { address } = req.params;
      const { status } = req.query;

      const query = { 
        freelancerAddress: address.toLowerCase() 
      };
      if (status) query.status = status;

      const bids = await Bid.find(query)
        .sort({ createdAt: -1 })
        .populate('job', 'title status contractValue');

      res.json({
        success: true,
        bids,
        count: bids.length
      });
    } catch (error) {
      logger.error('Get my bids error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/bids/:id
   * 📝 Lấy chi tiết bid
   */
  getBidById: async (req, res) => {
    try {
      const bid = await Bid.findById(req.params.id)
        .populate('freelancer', 'walletAddress username profile')
        .populate('job');

      if (!bid) {
        return res.status(404).json({ 
          success: false, 
          error: 'Bid not found' 
        });
      }

      res.json({
        success: true,
        bid
      });
    } catch (error) {
      logger.error('Get bid by id error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/bids
   * 📝 Gửi proposal (bid)
   */
  submitBid: async (req, res) => {
    try {
      const { 
        jobId,
        onchainJobId,
        bidAmount, 
        proposalCID,
        title, 
        description, 
        timeline 
      } = req.body;
      
      const freelancerAddress = req.user?.walletAddress?.toLowerCase();

      if (!freelancerAddress) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      if (req.user.role !== 'freelancer') {
        return res.status(403).json({
          success: false,
          error: 'Only freelancers can submit bids',
        });
      }

      // 1. Check job exists and is open
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }
      if (job.status !== 'OPEN') {
        return res.status(400).json({ 
          success: false, 
          error: 'Job is not open for bids' 
        });
      }

      // 2. Check user tier (Warning+ can't bid)
      const user = await User.findOne({ walletAddress: freelancerAddress });
      if (!user || user.reputation.tier === 'Restricted' || user.reputation.tier === 'Warning') {
        return res.status(403).json({ 
          success: false, 
          error: 'Low reputation tier cannot submit bids' 
        });
      }

      // 3. Check if already bid
      const existingBid = await Bid.findOne({ 
        jobId, 
        freelancerAddress 
      });
      if (existingBid) {
        return res.status(400).json({ 
          success: false, 
          error: 'You have already submitted a bid for this job' 
        });
      }

      // 4. Upload proposal to IPFS nếu chưa có CID
      let proposalCIDToUse = proposalCID;
      if (!proposalCIDToUse) {
        const proposalData = {
          title,
          description,
          timeline,
          bidAmount,
          freelancerAddress,
          submittedAt: new Date().toISOString()
        };
        const ipfsResult = await ipfsService.uploadJSON(proposalData);
        proposalCIDToUse = ipfsResult.cid;
      }

      const resolvedOnchainJobId = Number(
        onchainJobId ?? job.onchainJobId ?? job.onchainId
      );
      if (!Number.isFinite(resolvedOnchainJobId) || resolvedOnchainJobId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Job has no on-chain ID; bids cannot be submitted until the job is registered',
        });
      }

      // 5. Create bid
      const bid = new Bid({
        jobId,
        onchainJobId: resolvedOnchainJobId,
        freelancerAddress,
        proposalCID: proposalCIDToUse,
        bidAmount,
        title,
        description,
        timeline,
        status: 'pending'
      });

      await bid.save();

      res.status(201).json({
        success: true,
        message: 'Bid submitted successfully',
        bid
      });

    } catch (error) {
      logger.error('Submit bid error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * PATCH /api/bids/:id/accept
   * 📝 Chấp nhận bid (client action)
   */
  acceptBid: async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const bid = await Bid.findById(id).populate('job');
      if (!bid) {
        return res.status(404).json({ 
          success: false, 
          error: 'Bid not found' 
        });
      }

      // Check client is owner of job
      if (bid.job.clientAddress !== user.walletAddress) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client can accept bids' 
        });
      }

      // Check job is open
      if (bid.job.status !== 'OPEN') {
        return res.status(400).json({ 
          success: false, 
          error: 'Job is not open' 
        });
      }

      await bid.accept();

      bid.job.freelancerAddress = bid.freelancerAddress;
      await bid.job.save();
      await bid.job.updateStatus('ASSIGNED', `Freelancer ${bid.freelancerAddress} assigned`);

      res.json({
        success: true,
        message: 'Bid accepted',
        bid
      });

    } catch (error) {
      logger.error('Accept bid error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * PATCH /api/bids/:id/reject
   * 📝 Từ chối bid (client action)
   */
  rejectBid: async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const bid = await Bid.findById(id).populate('job');
      if (!bid) {
        return res.status(404).json({ 
          success: false, 
          error: 'Bid not found' 
        });
      }

      // Check client is owner of job
      if (bid.job.clientAddress !== user.walletAddress) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client can reject bids' 
        });
      }

      await bid.reject();

      res.json({
        success: true,
        message: 'Bid rejected',
        bid
      });

    } catch (error) {
      logger.error('Reject bid error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = bidController;