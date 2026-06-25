// 📄 DÁN TOÀN BỘ CODE NÀY VÀO src/models/Job.js
const mongoose = require('mongoose');

/**
 * 📝 Job Model
 * Lưu thông tin công việc, đồng bộ từ on-chain và off-chain
 */
const JobSchema = new mongoose.Schema(
  {
    // =============================================
    // 🔗 ON-CHAIN DATA (Đồng bộ từ blockchain)
    // =============================================
    onchainJobId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
      description: 'Job ID trên blockchain'
    },
    
    clientAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
      description: 'Địa chỉ ví Client'
    },

    onchainClientAddress: {
      type: String,
      lowercase: true,
      description: 'Địa chỉ ví Client trên JobRegistry (msg.sender lúc createJob — thường là INDEXER wallet)'
    },
    
    freelancerAddress: {
      type: String,
      lowercase: true,
      index: true,
      description: 'Địa chỉ ví Freelancer'
    },
    
    status: {
      type: String,
      enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'DISPUTED', 'COMPLETED', 'REFUNDED', 'CANCELLED'],
      default: 'OPEN',
      index: true,
      description: 'Trạng thái job (đồng bộ từ chain)'
    },
    
    contractValue: {
      type: Number,
      required: true,
      min: 0,
      description: 'Giá trị hợp đồng (USDC)'
    },
    
    deadline: {
      type: Number,
      required: true,
      description: 'Deadline timestamp'
    },
    
    assignedAt: {
      type: Number,
      description: 'Thời điểm assigned (timestamp)'
    },
    
    submittedAt: {
      type: Number,
      description: 'Thời điểm submit (timestamp)'
    },

    // =============================================
    // 📦 OFF-CHAIN DATA (Cache từ IPFS)
    // =============================================
    metadataCID: {
      type: String,
      required: true,
      description: 'IPFS CID của metadata job'
    },
    
    deliverableCID: {
      type: String,
      description: 'IPFS CID của deliverable'
    },
    
    title: {
      type: String,
      trim: true,
      description: 'Tiêu đề (cache từ metadata)'
    },
    
    description: {
      type: String,
      description: 'Mô tả (cache từ metadata)'
    },
    
    category: {
      type: String,
      index: true,
      description: 'Danh mục (cache từ metadata)'
    },
    
    subCategory: {
      type: String,
      description: 'Danh mục con'
    },
    
    skills: [{
      type: String,
      description: 'Kỹ năng (cache từ metadata)'
    }],
    
    deliverables: {
      type: String,
      description: 'Sản phẩm bàn giao (cache từ metadata)'
    },
    
    acceptanceCriteria: {
      type: String,
      description: 'Tiêu chí nghiệm thu (cache từ metadata)'
    },

    // =============================================
    // 💰 FINANCIAL (Tính toán)
    // =============================================
    totalDeposit: {
      type: Number,
      description: 'Tổng tiền Client nạp (USDC)'
    },
    
    platformFee: {
      type: Number,
      description: 'Phí nền tảng (USDC)'
    },
    
    serviceFee: {
      type: Number,
      description: 'Phí dịch vụ Freelancer (USDC)'
    },

    // =============================================
    // 📊 SYNC TRACKING
    // =============================================
    lastSyncedBlock: {
      type: Number,
      description: 'Block cuối cùng đã sync'
    },
    
    isSynced: {
      type: Boolean,
      default: true,
      description: 'Đã đồng bộ với chain chưa'
    },

    // =============================================
    // ⚖️ DISPUTE
    // =============================================
    isDisputed: {
      type: Boolean,
      default: false
    },
    
    disputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dispute'
    },

    // =============================================
    // ⭐ REVIEWS
    // =============================================
    clientReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    },
    
    freelancerReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    },

    // =============================================
    // 📎 ATTACHMENTS
    // =============================================
    attachments: [{
      name: String,
      cid: String,
      url: String,
      type: String
    }],

    // =============================================
    // 📜 HISTORY
    // =============================================
    statusHistory: [{
      status: String,
      timestamp: { type: Date, default: Date.now },
      note: String,
      transactionHash: String
    }],

    // =============================================
    // 🏷️ METADATA
    // =============================================
    tags: [{
      type: String
    }],
    
    isUrgent: {
      type: Boolean,
      default: false
    },
    
    budgetRange: {
      min: { type: Number },
      max: { type: Number }
    },

    // =============================================
    // 🔗 BLOCKCHAIN INFO
    // =============================================
    blockNumber: {
      type: Number,
      description: 'Block number khi tạo job'
    },
    
    transactionHash: {
      type: String,
      description: 'Transaction hash'
    },

    // =============================================
    // 📌 STATUS
    // =============================================
    isActive: {
      type: Boolean,
      default: true
    },
    
    completedAt: {
      type: Number,
      description: 'Thời điểm hoàn thành'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// =============================================
// 📊 INDEXES
// =============================================
JobSchema.index({ title: 'text', description: 'text' });
JobSchema.index({ clientAddress: 1, status: 1 });
JobSchema.index({ freelancerAddress: 1, status: 1 });
JobSchema.index({ category: 1, status: 1 });
JobSchema.index({ contractValue: -1 });
JobSchema.index({ createdAt: -1 });
JobSchema.index({ skills: 1 });

// =============================================
// 🔗 VIRTUALS
// =============================================
JobSchema.virtual('bids', {
  ref: 'Bid',
  localField: '_id',
  foreignField: 'jobId'
});

JobSchema.virtual('client', {
  ref: 'User',
  localField: 'clientAddress',
  foreignField: 'walletAddress',
  justOne: true
});

JobSchema.virtual('freelancer', {
  ref: 'User',
  localField: 'freelancerAddress',
  foreignField: 'walletAddress',
  justOne: true
});

JobSchema.virtual('isExpired').get(function () {
  if (this.status !== 'OPEN') return false;
  const createdAt = this.createdAt;
  if (!createdAt) return false;
  const createdMs =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === 'number'
        ? createdAt
        : new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() > createdMs + 30 * 24 * 60 * 60 * 1000;
});

// =============================================
// 📝 METHODS
// =============================================

/**
 * Cập nhật trạng thái job
 */
JobSchema.methods.updateStatus = async function (newStatus, note = '', txHash = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note,
    transactionHash: txHash
  });
  this.updatedAt = new Date();
  
  // Cập nhật thời gian đặc biệt
  if (newStatus === 'ASSIGNED') {
    this.assignedAt = Math.floor(Date.now() / 1000);
  } else if (newStatus === 'SUBMITTED') {
    this.submittedAt = Math.floor(Date.now() / 1000);
  } else if (newStatus === 'COMPLETED' || newStatus === 'REFUNDED') {
    this.completedAt = Math.floor(Date.now() / 1000);
    this.isActive = false;
  } else if (newStatus === 'CANCELLED') {
    this.isActive = false;
  }
  
  await this.save();
  return this;
};

/**
 * Lấy metadata từ IPFS
 */
JobSchema.methods.getMetadata = async function () {
  const ipfsService = require('../config/ipfs');
  try {
    return await ipfsService.getJSON(this.metadataCID);
  } catch (error) {
    return null;
  }
};

/**
 * Lấy deliverable từ IPFS
 */
JobSchema.methods.getDeliverable = async function () {
  if (!this.deliverableCID) return null;
  const ipfsService = require('../config/ipfs');
  try {
    return await ipfsService.getFile(this.deliverableCID);
  } catch (error) {
    return null;
  }
};

/**
 * Đồng bộ với blockchain
 */
JobSchema.methods.syncFromChain = async function (jobData) {
  this.status = jobData.status;
  this.freelancerAddress = jobData.freelancer || this.freelancerAddress;
  this.deadline = jobData.deadline || this.deadline;
  this.assignedAt = jobData.assignedAt || this.assignedAt;
  this.submittedAt = jobData.submittedAt || this.submittedAt;
  this.deliverableCID = jobData.deliverableCID || this.deliverableCID;
  this.lastSyncedBlock = jobData.blockNumber || this.lastSyncedBlock;
  this.isSynced = true;
  await this.save();
  return this;
};

// =============================================
// 🔍 STATICS
// =============================================

/**
 * Tìm jobs theo trạng thái
 */
JobSchema.statics.findByStatus = function (status, limit = 20, offset = 0) {
  return this.find({ status, isActive: true })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('client');
};

/**
 * Tìm kiếm jobs
 */
JobSchema.statics.search = function (query, filters = {}) {
  const searchQuery = {
    isActive: true,
    ...filters
  };
  
  if (query) {
    searchQuery.$text = { $search: query };
  }
  
  const sort = query ? { score: { $meta: 'textScore' } } : { createdAt: -1 };
  
  return this.find(searchQuery)
    .sort(sort)
    .populate('client');
};

/**
 * Lọc jobs theo kỹ năng
 */
JobSchema.statics.filterBySkills = function (skills, limit = 20) {
  return this.find({
    isActive: true,
    status: 'OPEN',
    skills: { $in: skills }
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate('client');
};

/**
 * Lấy jobs cần sync từ blockchain
 */
JobSchema.statics.getUnsyncedJobs = function (limit = 100) {
  return this.find({
    isSynced: false,
    isActive: true
  })
  .limit(limit)
  .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Job', JobSchema);