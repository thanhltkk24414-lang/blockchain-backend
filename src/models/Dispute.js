const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  onchainJobId: { type: Number, required: true },
  initiatorAddress: { type: String, required: true },
  respondentAddress: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  evidence: [{
    submitter: String,
    ipfsHash: String,
    submittedAt: { type: Date, default: Date.now }
  }],
  result: { type: String, enum: ['UNDECIDED', 'FREELANCER_WIN', 'CLIENT_WIN', 'SPLIT_50_50'], default: 'UNDECIDED' },
  isResolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Dispute', DisputeSchema);