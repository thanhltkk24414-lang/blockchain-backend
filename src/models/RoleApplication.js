const mongoose = require('mongoose');

const DESIRED_ROLES = ['pauser', 'force_resolver', 'arbitrator_manager'];

const RoleApplicationSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    desiredRole: {
      type: String,
      required: true,
      enum: DESIRED_ROLES,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      minlength: 20,
      maxlength: 2000,
      trim: true,
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

RoleApplicationSchema.index({ status: 1, createdAt: -1 });
RoleApplicationSchema.index({ walletAddress: 1, desiredRole: 1, status: 1 });

module.exports = mongoose.model('RoleApplication', RoleApplicationSchema);
module.exports.DESIRED_ROLES = DESIRED_ROLES;
