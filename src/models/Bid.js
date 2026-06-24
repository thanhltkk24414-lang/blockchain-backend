const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  onchainJobId: { type: Number, required: true },
  freelancerAddress: { type: String, required: true, lowercase: true },
  proposalCID: { type: String, required: true },
  bidAmount: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  timeline: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

BidSchema.methods.accept = async function acceptBid() {
  this.status = 'accepted';
  await this.save();
};

BidSchema.methods.reject = async function rejectBid() {
  this.status = 'rejected';
  await this.save();
};

// Populate path `job` maps to the Job ref stored in `jobId`.
BidSchema.virtual('job', {
  ref: 'Job',
  localField: 'jobId',
  foreignField: '_id',
  justOne: true,
});

BidSchema.set('toJSON', { virtuals: true });
BidSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Bid', BidSchema);
