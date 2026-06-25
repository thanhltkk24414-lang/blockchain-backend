const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  onchainJobId: { type: Number, required: true, index: true },
  initiatorAddress: { type: String, lowercase: true },
  respondentAddress: { type: String, lowercase: true },
  title: { type: String },
  description: { type: String },
  type: {
    type: String,
    enum: [
      'non_delivery',
      'late_delivery',
      'quality_issues',
      'non_payment',
      'scope_creep',
      'contract_breach',
      'other',
    ],
    default: 'other',
  },
  evidence: [{
    submitter: { type: String, lowercase: true },
    ipfsHash: String,
    description: String,
    submittedAt: { type: Date, default: Date.now },
  }],
  arbitrators: [{
    address: { type: String, lowercase: true },
    vote: { type: String, default: 'UNDECIDED' },
    isRevealed: { type: Boolean, default: false },
  }],
  result: {
    type: String,
    enum: ['UNDECIDED', 'FREELANCER_WIN', 'CLIENT_WIN', 'SPLIT_50_50'],
    default: 'UNDECIDED',
  },
  status: { type: String, enum: ['OPEN', 'FINALIZED', 'APPEALED'], default: 'OPEN' },
  round: { type: Number, default: 1 },
  isResolved: { type: Boolean, default: false },
  disputeFee: Number,
  totalFees: Number,
  openedAt: Date,
  finalizedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

DisputeSchema.methods.addEvidence = function addEvidence(submitter, ipfsHash, description) {
  this.evidence.push({
    submitter: submitter.toLowerCase(),
    ipfsHash,
    description,
    submittedAt: new Date(),
  });
  return this.save();
};

module.exports = mongoose.model('Dispute', DisputeSchema);
