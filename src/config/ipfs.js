const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

const PINATA_API_URL = 'https://api.pinata.cloud';
const DEFAULT_GATEWAY_URL = 'https://gateway.pinata.cloud';

/**
 * IPFS Service — Pinata pinning API for uploads, gateway for reads.
 *
 * - uploadFile: POST /pinning/pinFileToIPFS
 * - uploadJSON: POST /pinning/pinJSONToIPFS
 * - getFile / getJSON: fetch via IPFS_GATEWAY_URL
 */
class IPFSService {
  constructor() {
    this.gatewayUrl = (process.env.IPFS_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/$/, '');
    this.jwt = process.env.PINATA_JWT || '';
    this.apiKey = process.env.PINATA_API_KEY || process.env.IPFS_API_KEY || '';
    this.apiSecret =
      process.env.PINATA_SECRET_API_KEY || process.env.IPFS_API_SECRET || '';

    const authMode = this.jwt ? 'JWT' : this.apiKey && this.apiSecret ? 'API key' : 'none';
    logger.info(`IPFS Service initialized (Pinata, auth: ${authMode}, gateway: ${this.gatewayUrl})`);
  }

  _getPinataAuthHeaders() {
    if (this.jwt) {
      return { Authorization: `Bearer ${this.jwt}` };
    }
    if (this.apiKey && this.apiSecret) {
      return {
        pinata_api_key: this.apiKey,
        pinata_secret_api_key: this.apiSecret,
      };
    }
    return null;
  }

  _ensureAuth() {
    const headers = this._getPinataAuthHeaders();
    if (!headers) {
      throw new Error(
        'Pinata credentials missing: set PINATA_JWT or PINATA_API_KEY + PINATA_SECRET_API_KEY (or IPFS_API_KEY + IPFS_API_SECRET)'
      );
    }
    return headers;
  }

  _formatError(error) {
    const data = error.response?.data;
    if (typeof data?.error === 'string') return data.error;
    if (data?.details) return data.details;
    if (data?.reason) return data.reason;
    return error.message;
  }

  _buildUploadResult(cid) {
    return {
      cid,
      url: `ipfs://${cid}`,
      gatewayUrl: this.getGatewayUrl(cid),
    };
  }

  async uploadFile(fileBuffer, filename) {
    try {
      logger.info(`Uploading file to Pinata: ${filename} (${fileBuffer.length} bytes)`);

      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename,
        contentType: 'application/octet-stream',
      });

      const response = await axios.post(
        `${PINATA_API_URL}/pinning/pinFileToIPFS`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            ...this._ensureAuth(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const cid = response.data.IpfsHash;
      logger.info(`File pinned to IPFS: ${cid}`);
      return this._buildUploadResult(cid);
    } catch (error) {
      const message = this._formatError(error);
      logger.error(`Pinata file upload failed: ${message}`);
      throw new Error(`IPFS upload failed: ${message}`);
    }
  }

  async uploadJSON(data, options = {}) {
    try {
      logger.info('Uploading JSON to Pinata');

      const body = {
        pinataContent: data,
      };
      if (options.name) {
        body.pinataMetadata = { name: options.name };
      }

      const response = await axios.post(
        `${PINATA_API_URL}/pinning/pinJSONToIPFS`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            ...this._ensureAuth(),
          },
        }
      );

      const cid = response.data.IpfsHash;
      logger.info(`JSON pinned to IPFS: ${cid}`);
      return this._buildUploadResult(cid);
    } catch (error) {
      const message = this._formatError(error);
      logger.error(`Pinata JSON upload failed: ${message}`);
      throw new Error(`IPFS upload failed: ${message}`);
    }
  }

  async getFile(cid) {
    try {
      logger.info(`Downloading file from IPFS gateway: ${cid}`);

      const response = await axios.get(`${this.gatewayUrl}/ipfs/${cid}`, {
        responseType: 'arraybuffer',
      });

      logger.info(`File downloaded: ${response.data.length} bytes`);
      return response.data;
    } catch (error) {
      logger.error(`IPFS file retrieval failed for CID ${cid}:`, error.message);
      throw new Error(`IPFS file retrieval failed: ${error.message}`);
    }
  }

  async getJSON(cid) {
    try {
      logger.info(`Downloading JSON from IPFS gateway: ${cid}`);

      const response = await axios.get(`${this.gatewayUrl}/ipfs/${cid}`);
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

      logger.info('JSON downloaded from IPFS');
      return data;
    } catch (error) {
      logger.error(`IPFS JSON retrieval failed for CID ${cid}:`, error.message);
      throw new Error(`IPFS JSON retrieval failed: ${error.message}`);
    }
  }

  getGatewayUrl(cid) {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }

  async fileExists(cid) {
    try {
      await this.getFile(cid);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new IPFSService();
