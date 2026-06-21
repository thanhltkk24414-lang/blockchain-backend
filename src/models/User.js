const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  reputation: {
    score: { type: Number, default: 100 },
    tier: {
      type: String,
      enum: ['Restricted', 'Warning', 'Normal', 'Trusted'],
      default: 'Normal'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);