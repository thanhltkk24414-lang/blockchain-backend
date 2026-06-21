const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  reviewerAddress: { type: String, required: true },
  targetAddress: { type: String, required: true },
  role: { type: String, enum: ['client', 'freelancer'], required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', ReviewSchema);