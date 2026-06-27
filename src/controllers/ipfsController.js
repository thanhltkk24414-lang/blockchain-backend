const fs = require('fs');
const ipfsService = require('../config/ipfs');
const logger = require('../utils/logger');

const ipfsController = {
  /**
   * POST /api/ipfs/upload/file
   * Upload deliverable or dispute evidence file to Pinata.
   */
  uploadFile: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Please attach a file' });
      }

      const buffer = req.file.buffer || fs.readFileSync(req.file.path);
      const filename = req.file.originalname || req.file.filename || 'upload.bin';
      const result = await ipfsService.uploadFile(buffer, filename);

      if (req.file.path) {
        fs.unlink(req.file.path, () => {});
      }

      res.status(200).json({
        success: true,
        cid: result.cid,
        metadataCID: result.cid,
        url: result.gatewayUrl,
      });
    } catch (error) {
      logger.error('IPFS file upload error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload file to IPFS' });
    }
  },

  /**
   * POST /api/ipfs/upload/metadata
   * Upload job metadata JSON to Pinata; frontend uses CID for on-chain createJob.
   */
  uploadMetadata: async (req, res) => {
    try {
      const metadata = req.body;
      if (!metadata || Object.keys(metadata).length === 0) {
        return res.status(400).json({ success: false, error: 'Please provide JSON metadata' });
      }

      const pinataMetadata = {
        name: `Job_Metadata_${Date.now()}.json`,
      };
      const keyvalues = {};
      if (metadata.type) keyvalues.type = String(metadata.type);
      if (metadata.onchainJobId != null) keyvalues.onchainJobId = String(metadata.onchainJobId);
      if (metadata.jobId) keyvalues.jobId = String(metadata.jobId);
      if (Object.keys(keyvalues).length > 0) {
        pinataMetadata.keyvalues = keyvalues;
      }

      const result = await ipfsService.uploadJSON(metadata, {
        metadata: pinataMetadata,
      });

      res.status(200).json({
        success: true,
        metadataCID: result.cid,
        cid: result.cid,
        url: result.gatewayUrl,
      });
    } catch (error) {
      logger.error('IPFS metadata upload error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload metadata to IPFS' });
    }
  },
};

module.exports = ipfsController;
