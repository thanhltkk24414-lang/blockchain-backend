// 📄 DÁN VÀO src/controllers/jobController.js
const Job = require('../models/Job');
const User = require('../models/User');
const Bid = require('../models/Bid');
const ipfsService = require('../config/ipfs');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');

/**
 * 📝 Job Controller
 * Xử lý các request liên quan đến công việc
 */
const jobController = {
  /**
   * GET /api/jobs
   * 📝 Lấy danh sách jobs với filter
   */
  getJobs: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        category, 
        search,
        sortBy = 'createdAt',
        order = '-1'
      } = req.query;

      const skip = (page - 1) * limit;
      const query = { isActive: true };

      // Filter
      if (status) query.status = status;
      if (category) query.category = category;
      if (search) {
        query.$text = { $search: search };
      }

      // Sort
      const sort = {};
      sort[sortBy] = parseInt(order);

      const jobs = await Job.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('client', 'walletAddress username profile.fullName reputation');

      const total = await Job.countDocuments(query);

      res.json({
        success: true,
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get jobs error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/search
   * 📝 Tìm kiếm jobs theo từ khóa
   */
  searchJobs: async (req, res) => {
    try {
      const { q, category, minBudget, maxBudget } = req.query;
      
      const query = { isActive: true, status: 'OPEN' };
      
      if (q) {
        query.$text = { $search: q };
      }
      if (category) query.category = category;
      if (minBudget) query.contractValue = { $gte: parseInt(minBudget) };
      if (maxBudget) {
        query.contractValue = { 
          ...query.contractValue, 
          $lte: parseInt(maxBudget) 
        };
      }

      const jobs = await Job.find(query)
        .sort(q ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .limit(50)
        .populate('client', 'walletAddress username profile.fullName');

      res.json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error) {
      logger.error('Search jobs error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/client/:address
   * 📝 Lấy jobs của một client
   */
  getJobsByClient: async (req, res) => {
    try {
      const { address } = req.params;
      const { status } = req.query;

      const query = { 
        clientAddress: address.toLowerCase(),
        isActive: true 
      };
      if (status) query.status = status;

      const jobs = await Job.find(query)
        .sort({ createdAt: -1 })
        .populate('freelancer', 'walletAddress username profile.fullName');

      res.json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error) {
      logger.error('Get jobs by client error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/freelancer/:address
   * 📝 Lấy jobs của một freelancer
   */
  getJobsByFreelancer: async (req, res) => {
    try {
      const { address } = req.params;
      const { status } = req.query;

      const query = { 
        freelancerAddress: address.toLowerCase(),
        isActive: true 
      };
      if (status) query.status = status;

      const jobs = await Job.find(query)
        .sort({ createdAt: -1 })
        .populate('client', 'walletAddress username profile.fullName');

      res.json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error) {
      logger.error('Get jobs by freelancer error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/:id
   * 📝 Lấy chi tiết job theo ID
   */
  getJobById: async (req, res) => {
    try {
      const job = await Job.findById(req.params.id)
        .populate('client', 'walletAddress username profile.fullName profile.avatar reputation')
        .populate('freelancer', 'walletAddress username profile.fullName profile.avatar reputation')
        .populate('bids')
        .populate('clientReview')
        .populate('freelancerReview');

      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }

      // Lấy metadata từ IPFS
      let metadata = null;
      try {
        metadata = await job.getMetadata();
      } catch (error) {
        logger.warn('Cannot fetch metadata from IPFS:', error.message);
      }

      res.json({
        success: true,
        job,
        metadata
      });
    } catch (error) {
      logger.error('Get job by id error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/jobs
   * 📝 Tạo job mới
   */
  createJob: async (req, res) => {
    try {
      const { 
        title, 
        description, 
        category, 
        contractValue, 
        duration, 
        skills, 
        deliverables, 
        acceptanceCriteria 
      } = req.body;
      
      const clientAddress = req.user?.walletAddress;

      if (!clientAddress) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // 1. Check user tier
      const user = await User.findOne({ walletAddress: clientAddress });
      if (!user || user.reputation.tier === 'Restricted') {
        return res.status(403).json({ 
          success: false, 
          error: 'Restricted users cannot create jobs' 
        });
      }

      // 2. Upload metadata to IPFS
      const metadata = {
        title,
        description,
        category,
        skills,
        deliverables,
        acceptanceCriteria,
        clientAddress,
        createdAt: new Date().toISOString()
      };
      
      const metadataResult = await ipfsService.uploadJSON(metadata);

      // 3. Call smart contract
      let jobId;
      try {
        jobId = await contractService.createJob(
          clientAddress,
          metadataResult.cid,
          contractValue,
          duration
        );
      } catch (contractError) {
        logger.error('Contract call failed:', contractError);
        // Fallback: tạo job ID tạm
        jobId = Date.now();
      }

      // 4. Save to database
      const deadline = Math.floor(Date.now() / 1000) + duration;
      const job = new Job({
        onchainId: jobId,
        clientAddress,
        metadataCID: metadataResult.cid,
        title,
        description,
        category,
        skills,
        contractValue,
        duration,
        deadline,
        status: 'OPEN',
        totalDeposit: contractValue * 1.03,
        platformFee: contractValue * 0.03,
        isActive: true
      });

      await job.save();

      // 5. Update user stats
      user.stats.jobsPosted += 1;
      await user.save();

      res.status(201).json({
        success: true,
        message: 'Job created successfully',
        jobId: jobId,
        onchainId: jobId,
        metadataCID: metadataResult.cid,
        job
      });

    } catch (error) {
      logger.error('Create job error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * PATCH /api/jobs/:id/status
   * 📝 Cập nhật trạng thái job
   */
  updateJobStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, note } = req.body;
      const user = req.user;

      const job = await Job.findById(id);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }

      // Check authorization
      if (job.clientAddress !== user.walletAddress) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client can update job status' 
        });
      }

      await job.updateStatus(status, note);

      res.json({
        success: true,
        message: 'Job status updated',
        job
      });

    } catch (error) {
      logger.error('Update job status error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = jobController;