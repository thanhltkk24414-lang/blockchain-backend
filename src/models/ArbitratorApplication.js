const mongoose = require('mongoose');

const ArbitratorApplicationSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      minlength: 20,
      maxlength: 2000,
      trim: true,
    },
    reputationScore: {
      type: Number,
      default: null,
    },
    stakeVerified: {
      type: Boolean,
      default: false,
    },
    stakedAmount: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);

ArbitratorApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ArbitratorApplication', ArbitratorApplicationSchema);
