const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  onchainJobId: { type: Number, required: true },
  freelancerAddress: { type: String, required: true, lowercase: true },
  proposalCID: { type: String, required: true },
  bidAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bid', BidSchema);