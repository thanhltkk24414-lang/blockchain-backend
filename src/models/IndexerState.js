// 📄 DÁN VÀO src/models/IndexerState.js
const mongoose = require('mongoose');

const IndexerStateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    default: 'lastBlock'
  },
  blockNumber: {
    type: Number,
    required: true,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('IndexerState', IndexerStateSchema);