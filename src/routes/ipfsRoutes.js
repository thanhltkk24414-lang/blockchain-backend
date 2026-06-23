const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const ipfsController = require('../controllers/ipfsController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.post('/upload/file', authenticate, upload.single('file'), ipfsController.uploadFile);
router.post('/upload/metadata', authenticate, ipfsController.uploadMetadata);

module.exports = router;
