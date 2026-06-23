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
        return res.status(400).json({ success: false, error: 'Vui lòng đính kèm một file' });
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
      res.status(500).json({ success: false, error: 'Không thể upload file lên hệ thống IPFS' });
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
        return res.status(400).json({ success: false, error: 'Vui lòng cung cấp dữ liệu JSON' });
      }

      const result = await ipfsService.uploadJSON(metadata, {
        name: `Job_Metadata_${Date.now()}.json`,
      });

      res.status(200).json({
        success: true,
        metadataCID: result.cid,
        cid: result.cid,
        url: result.gatewayUrl,
      });
    } catch (error) {
      logger.error('IPFS metadata upload error:', error);
      res.status(500).json({ success: false, error: 'Không thể upload metadata lên hệ thống IPFS' });
    }
  },
};

module.exports = ipfsController;
