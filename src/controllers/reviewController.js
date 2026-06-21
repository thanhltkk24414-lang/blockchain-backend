// 📄 DÁN TOÀN BỘ CODE NÀY VÀO src/controllers/reviewController.js
const Review = require('../models/Review');
const Job = require('../models/Job');
const User = require('../models/User');
const reputationService = require('../services/reputationService');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');

/**
 * 📝 Review Controller
 * Xử lý các request liên quan đến đánh giá
 */
const reviewController = {
  /**
   * GET /api/reviews/user/:address
   * 📝 Lấy đánh giá của một user
   */
  getReviewsByUser: async (req, res) => {
    try {
      const { address } = req.params;
      const { role } = req.query;

      const query = { targetAddress: address.toLowerCase() };
      if (role) query.role = role;

      const reviews = await Review.find(query)
        .sort({ createdAt: -1 })
        .populate('reviewerAddress', 'walletAddress username profile.fullName')
        .populate('job', 'title status');

      // Calculate average rating
      const total = reviews.length;
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      const average = total > 0 ? sum / total : 0;

      res.json({
        success: true,
        reviews,
        stats: {
          total,
          average: parseFloat(average.toFixed(2)),
          distribution: {
            1: reviews.filter(r => r.rating === 1).length,
            2: reviews.filter(r => r.rating === 2).length,
            3: reviews.filter(r => r.rating === 3).length,
            4: reviews.filter(r => r.rating === 4).length,
            5: reviews.filter(r => r.rating === 5).length
          }
        }
      });
    } catch (error) {
      logger.error('Get reviews by user error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/reviews/job/:jobId
   * 📝 Lấy đánh giá của một job
   */
  getReviewsByJob: async (req, res) => {
    try {
      const { jobId } = req.params;

      const reviews = await Review.find({ jobId })
        .populate('reviewerAddress', 'walletAddress username profile.fullName')
        .populate('targetAddress', 'walletAddress username profile.fullName');

      res.json({
        success: true,
        reviews,
        count: reviews.length
      });
    } catch (error) {
      logger.error('Get reviews by job error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/reviews/:id
   * 📝 Lấy chi tiết đánh giá
   */
  getReviewById: async (req, res) => {
    try {
      const review = await Review.findById(req.params.id)
        .populate('reviewerAddress', 'walletAddress username profile.fullName')
        .populate('targetAddress', 'walletAddress username profile.fullName')
        .populate('job', 'title status contractValue');

      if (!review) {
        return res.status(404).json({ 
          success: false, 
          error: 'Review not found' 
        });
      }

      res.json({
        success: true,
        review
      });
    } catch (error) {
      logger.error('Get review by id error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/reviews
   * 📝 Gửi đánh giá (sau khi job complete)
   */
  submitReview: async (req, res) => {
    try {
      const { jobId, rating, comment, role } = req.body;
      const reviewerAddress = req.user?.walletAddress;

      if (!reviewerAddress) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // 1. Check job exists and completed
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }

      if (job.status !== 'COMPLETED') {
        return res.status(400).json({ 
          success: false, 
          error: 'Job must be completed to submit review' 
        });
      }

      // 2. Check user is party to the job
      const isClient = job.clientAddress === reviewerAddress;
      const isFreelancer = job.freelancerAddress === reviewerAddress;

      if (!isClient && !isFreelancer) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client or freelancer can submit review' 
        });
      }

      // 3. Validate role matches user
      if (role === 'client' && !isClient) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client can submit client review' 
        });
      }
      if (role === 'freelancer' && !isFreelancer) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only freelancer can submit freelancer review' 
        });
      }

      // 4. Check if review already exists
      const existingReview = await Review.findOne({ 
        jobId, 
        reviewerAddress,
        role 
      });
      if (existingReview) {
        return res.status(400).json({ 
          success: false, 
          error: 'You have already submitted a review for this job' 
        });
      }

      // 5. Determine target address
      const targetAddress = role === 'client' 
        ? job.freelancerAddress 
        : job.clientAddress;

      // 6. Create review
      const review = new Review({
        jobId,
        reviewerAddress,
        targetAddress,
        role,
        rating,
        comment: comment || '',
        createdAt: new Date()
      });

      await review.save();

      // 7. Update user's reputation (if rating >= 4, bonus points)
      const targetUser = await User.findOne({ walletAddress: targetAddress });
      if (targetUser) {
        let scoreChange = 0;
        if (rating >= 4) {
          scoreChange = 5;  // Bonus points for good review
        } else if (rating <= 2) {
          scoreChange = -5; // Penalty for bad review
        }

        if (scoreChange !== 0) {
          try {
            // Update on-chain
            await contractService.updateReputation(
              targetAddress,
              scoreChange > 0,
              Math.abs(scoreChange)
            );
            
            // Update database
            const newScore = targetUser.reputation.score + scoreChange;
            await targetUser.updateReputation(newScore);
            
            logger.info(`Updated reputation for ${targetAddress}: ${scoreChange}`);
          } catch (error) {
            logger.warn('Reputation update failed:', error.message);
          }
        }

        // Update average rating
        const allReviews = await Review.find({ targetAddress });
        const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
        targetUser.reputation.averageRating = totalRating / allReviews.length;
        await targetUser.save();
      }

      // 8. Link review to job
      if (role === 'client') {
        job.clientReview = review._id;
      } else {
        job.freelancerReview = review._id;
      }
      await job.save();

      res.status(201).json({
        success: true,
        message: 'Review submitted successfully',
        review
      });

    } catch (error) {
      logger.error('Submit review error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/reviews/check/:jobId/:address
   * 📝 Kiểm tra user đã review job chưa
   */
  checkReviewExists: async (req, res) => {
    try {
      const { jobId, address } = req.params;

      const review = await Review.findOne({
        jobId,
        reviewerAddress: address.toLowerCase()
      });

      res.json({
        success: true,
        hasReviewed: !!review,
        review
      });
    } catch (error) {
      logger.error('Check review exists error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = reviewController;