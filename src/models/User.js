const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    lowercase: true,
    sparse: true,
  },
  nonce: {
    type: String,
    default: null,
    select: true,
  },
  role: {
    type: String,
    enum: ['client', 'freelancer', 'admin'],
  },
  profile: {
    fullName: { type: String, default: '' },
    bio: { type: String, default: '' },
    skills: { type: [String], default: [] },
    hourlyRate: { type: Number, default: 0 },
    location: { type: String, default: '' },
    avatar: { type: String, default: '' },
  },
  reputation: {
    score: { type: Number, default: 100 },
    tier: {
      type: String,
      enum: ['Restricted', 'Warning', 'Normal', 'Trusted'],
      default: 'Normal',
    },
    successRate: { type: Number, default: 0 },
  },
  stats: {
    jobsPosted: { type: Number, default: 0 },
    jobsCompleted: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLoginAt: {
    type: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
