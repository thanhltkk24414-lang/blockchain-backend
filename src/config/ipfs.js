// 📄 DÁN TOÀN BỘ CODE NÀY VÀO src/config/ipfs.js
const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

/**
 * 📝 GHI CHÚ: IPFS Service
 * Dùng để upload và download dữ liệu từ IPFS
 * 
 * Các chức năng:
 * - uploadFile: Upload file lên IPFS
 * - uploadJSON: Upload JSON lên IPFS
 * - getFile: Lấy file từ IPFS theo CID
 * - getJSON: Lấy JSON từ IPFS theo CID
 * - getGatewayUrl: Lấy URL gateway từ CID
 */
class IPFSService {
  constructor() {
    // Lấy cấu hình từ biến môi trường
    this.gatewayUrl = process.env.IPFS_GATEWAY_URL || 'https://ipfs.infura.io:5001';
    this.apiKey = process.env.IPFS_API_KEY || '';
    this.apiSecret = process.env.IPFS_API_SECRET || '';
    
    // Tạo auth header nếu có API key
    this.authHeader = this.apiKey && this.apiSecret 
      ? `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`
      : '';
    
    logger.info(`📡 IPFS Service initialized with gateway: ${this.gatewayUrl}`);
  }

  /**
   * Upload file lên IPFS
   * @param {Buffer} fileBuffer - Buffer của file cần upload
   * @param {string} filename - Tên file
   * @returns {Promise<{cid: string, url: string, gatewayUrl: string}>}
   * 
   * 📝 Ví dụ sử dụng:
   * const fileBuffer = fs.readFileSync('image.png');
   * const result = await ipfsService.uploadFile(fileBuffer, 'image.png');
   * console.log(result.cid); // QmX...
   */
  async uploadFile(fileBuffer, filename) {
    try {
      logger.info(`📤 Uploading file: ${filename} (${fileBuffer.length} bytes)`);
      
      // Tạo form data
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'application/octet-stream',
      });

      // Gửi request lên IPFS
      const headers = {
        ...formData.getHeaders(),
      };
      
      if (this.authHeader) {
        headers.Authorization = this.authHeader;
      }

      const response = await axios.post(
        `${this.gatewayUrl}/api/v0/add`,
        formData,
        {
          headers,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const cid = response.data.Hash;
      const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
      
      logger.info(`✅ File uploaded to IPFS: ${cid}`);
      
      return {
        cid,
        url: `ipfs://${cid}`,
        gatewayUrl,
      };
    } catch (error) {
      logger.error('❌ IPFS upload failed:', error.message);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  /**
   * Upload JSON lên IPFS
   * @param {Object} data - Dữ liệu JSON cần upload
   * @returns {Promise<{cid: string, url: string, gatewayUrl: string}>}
   * 
   * 📝 Ví dụ sử dụng:
   * const metadata = { title: 'Job 1', description: '...' };
   * const result = await ipfsService.uploadJSON(metadata);
   * console.log(result.cid); // QmY...
   */
  async uploadJSON(data) {
    try {
      logger.info(`📤 Uploading JSON to IPFS`);
      
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (this.authHeader) {
        headers.Authorization = this.authHeader;
      }

      const response = await axios.post(
        `${this.gatewayUrl}/api/v0/add`,
        JSON.stringify(data),
        { headers }
      );

      const cid = response.data.Hash;
      const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
      
      logger.info(`✅ JSON uploaded to IPFS: ${cid}`);
      
      return {
        cid,
        url: `ipfs://${cid}`,
        gatewayUrl,
      };
    } catch (error) {
      logger.error('❌ IPFS JSON upload failed:', error.message);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  /**
   * Lấy file từ IPFS theo CID
   * @param {string} cid - IPFS CID của file
   * @returns {Promise<Buffer>}
   * 
   * 📝 Ví dụ sử dụng:
   * const fileBuffer = await ipfsService.getFile('QmX...');
   * // Lưu file buffer hoặc xử lý tiếp
   */
  async getFile(cid) {
    try {
      logger.info(`📥 Downloading file from IPFS: ${cid}`);
      
      const headers = {};
      if (this.authHeader) {
        headers.Authorization = this.authHeader;
      }

      const response = await axios.get(
        `${this.gatewayUrl}/api/v0/cat?arg=${cid}`,
        {
          headers,
          responseType: 'arraybuffer',
        }
      );

      logger.info(`✅ File downloaded: ${response.data.length} bytes`);
      return response.data;
    } catch (error) {
      logger.error(`❌ IPFS file retrieval failed for CID ${cid}:`, error.message);
      throw new Error(`IPFS file retrieval failed: ${error.message}`);
    }
  }

  /**
   * Lấy JSON từ IPFS theo CID
   * @param {string} cid - IPFS CID của JSON
   * @returns {Promise<Object>}
   * 
   * 📝 Ví dụ sử dụng:
   * const metadata = await ipfsService.getJSON('QmY...');
   * console.log(metadata.title);
   */
  async getJSON(cid) {
    try {
      logger.info(`📥 Downloading JSON from IPFS: ${cid}`);
      
      const headers = {};
      if (this.authHeader) {
        headers.Authorization = this.authHeader;
      }

      const response = await axios.get(
        `${this.gatewayUrl}/api/v0/cat?arg=${cid}`,
        { headers }
      );

      const data = JSON.parse(response.data);
      logger.info(`✅ JSON downloaded from IPFS`);
      return data;
    } catch (error) {
      logger.error(`❌ IPFS JSON retrieval failed for CID ${cid}:`, error.message);
      throw new Error(`IPFS JSON retrieval failed: ${error.message}`);
    }
  }

  /**
   * Lấy URL gateway từ CID
   * @param {string} cid - IPFS CID
   * @returns {string} URL có thể truy cập qua browser
   * 
   * 📝 Ví dụ sử dụng:
   * const url = ipfsService.getGatewayUrl('QmX...');
   * // https://ipfs.io/ipfs/QmX...
   */
  getGatewayUrl(cid) {
    return `https://ipfs.io/ipfs/${cid}`;
  }

  /**
   * Kiểm tra file có tồn tại trên IPFS không
   * @param {string} cid - IPFS CID cần kiểm tra
   * @returns {Promise<boolean>}
   */
  async fileExists(cid) {
    try {
      await this.getFile(cid);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
module.exports = new IPFSService();