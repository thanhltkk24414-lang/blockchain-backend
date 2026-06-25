// 📄 DÁN VÀO src/controllers/disputeController.js
const Dispute = require('../models/Dispute');
const Job = require('../models/Job');
const User = require('../models/User');
const ipfsService = require('../config/ipfs');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');

/**
 * 📝 Dispute Controller
 * Xử lý các request liên quan đến tranh chấp
 */
const disputeController = {
  /**
   * GET /api/disputes
   * 📝 Lấy danh sách disputes
   */
  getDisputes: async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      const query = {};
      if (status) query.status = status;

      const disputes = await Dispute.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('jobId', 'title status contractValue onchainJobId');

      const total = await Dispute.countDocuments(query);

      res.json({
        success: true,
        disputes,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get disputes error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/disputes/job/:jobId
   * 📝 Lấy dispute theo job ID
   */
  getDisputeByJob: async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const dispute = await Dispute.findOne({ jobId })
        .populate('jobId', 'title status contractValue onchainJobId clientAddress freelancerAddress');

      if (!dispute) {
        return res.status(404).json({ 
          success: false, 
          error: 'No dispute found for this job' 
        });
      }

      res.json({
        success: true,
        dispute
      });
    } catch (error) {
      logger.error('Get dispute by job error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/disputes/:id
   * 📝 Lấy chi tiết dispute
   */
  getDisputeByOnchainJob: async (req, res) => {
    try {
      const onchainJobId = Number(req.params.onchainJobId);
      const dispute = await Dispute.findOne({ onchainJobId })
        .populate('jobId', 'title status contractValue onchainJobId clientAddress freelancerAddress');

      if (!dispute) {
        return res.status(404).json({
          success: false,
          error: 'No dispute found for this on-chain job',
        });
      }

      res.json({ success: true, dispute });
    } catch (error) {
      logger.error('Get dispute by onchain job error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getDisputeById: async (req, res) => {
    try {
      const dispute = await Dispute.findById(req.params.id)
        .populate('jobId', 'title status contractValue onchainJobId clientAddress freelancerAddress');

      if (!dispute) {
        return res.status(404).json({ 
          success: false, 
          error: 'Dispute not found' 
        });
      }

      res.json({
        success: true,
        dispute
      });
    } catch (error) {
      logger.error('Get dispute by id error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/disputes
   * 📝 Mở tranh chấp mới
   */
  raiseDispute: async (req, res) => {
    try {
      const { jobId, title, description, type } = req.body;
      const initiatorAddress = req.user?.walletAddress?.toLowerCase();

      if (!initiatorAddress) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // 1. Check job exists
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }

      // 2. Check user is party to the job
      if (job.clientAddress !== initiatorAddress && job.freelancerAddress !== initiatorAddress) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client or freelancer can raise dispute' 
        });
      }

      // 3. Check job status
      if (job.status !== 'SUBMITTED' && job.status !== 'IN_PROGRESS') {
        return res.status(400).json({ 
          success: false, 
          error: 'Dispute can only be raised for submitted or in-progress jobs' 
        });
      }

      // 4. Check if dispute already exists
      const existingDispute = await Dispute.findOne({ jobId, isResolved: false });
      if (existingDispute) {
        return res.status(400).json({ 
          success: false, 
          error: 'A dispute already exists for this job' 
        });
      }

      // 5. Check user tier (Warning+ can't raise dispute)
      const user = await User.findOne({ walletAddress: initiatorAddress });
      if (!user || user.reputation.tier === 'Restricted' || user.reputation.tier === 'Warning') {
        return res.status(403).json({ 
          success: false, 
          error: 'Low reputation tier cannot raise disputes' 
        });
      }

      // 6. Create dispute
      const dispute = new Dispute({
        jobId,
        onchainJobId: job.onchainJobId,
        initiatorAddress,
        respondentAddress: initiatorAddress === job.clientAddress
          ? job.freelancerAddress
          : job.clientAddress,
        title,
        description,
        type: type || 'other',
        disputeFee: Math.min(job.contractValue * 0.02, 50),
        totalFees: Math.min(job.contractValue * 0.02, 50),
        status: 'OPEN',
        openedAt: new Date(),
      });

      await dispute.save();

      await job.updateStatus('DISPUTED', `Dispute raised: ${title}`, '');

      try {
        await contractService.raiseDispute(job.onchainJobId);
      } catch (contractError) {
        logger.warn('Contract raiseDispute failed (client may raise on-chain via UI):', contractError.message);
      }

      res.status(201).json({
        success: true,
        message: 'Dispute raised successfully',
        dispute
      });

    } catch (error) {
      logger.error('Raise dispute error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/disputes/:id/evidence
   * 📝 Nộp bằng chứng cho dispute
   */
  addEvidence: async (req, res) => {
    try {
      const { id } = req.params;
      const { ipfsHash, description } = req.body;
      const submitterAddress = req.user?.walletAddress?.toLowerCase();

      if (!submitterAddress) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const dispute = await Dispute.findById(id).populate('jobId');
      if (!dispute) {
        return res.status(404).json({ 
          success: false, 
          error: 'Dispute not found' 
        });
      }

      // Check user is party to dispute
      if (dispute.initiatorAddress !== submitterAddress && 
          dispute.respondentAddress !== submitterAddress) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only parties to the dispute can submit evidence' 
        });
      }

      // Add evidence
      await dispute.addEvidence(submitterAddress, ipfsHash, description);

      res.json({
        success: true,
        message: 'Evidence submitted successfully',
        evidence: dispute.evidence[dispute.evidence.length - 1]
      });

    } catch (error) {
      logger.error('Add evidence error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/disputes/:id/evidences
   * 📝 Lấy bằng chứng của dispute
   */
  getEvidences: async (req, res) => {
    try {
      const dispute = await Dispute.findById(req.params.id);
      if (!dispute) {
        return res.status(404).json({ 
          success: false, 
          error: 'Dispute not found' 
        });
      }

      // Fetch evidence content from IPFS
      const evidencesWithContent = await Promise.all(
        dispute.evidence.map(async (evidence) => {
          let content = null;
          try {
            content = await ipfsService.getJSON(evidence.ipfsHash);
          } catch (error) {
            // If not JSON, try as file
            try {
              content = await ipfsService.getFile(evidence.ipfsHash);
            } catch (e) {
              // Ignore
            }
          }
          return {
            ...evidence.toObject(),
            content
          };
        })
      );

      res.json({
        success: true,
        evidence: evidencesWithContent
      });
    } catch (error) {
      logger.error('Get evidences error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = disputeController;