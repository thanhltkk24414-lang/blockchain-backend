/**
 * Smoke test: auth modules load and JWT helpers work (no MongoDB required).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-smoke-test';
process.env.CHAIN_ID = process.env.CHAIN_ID || '11155111';
process.env.SIWE_DOMAIN = process.env.SIWE_DOMAIN || 'localhost';

const jwt = require('jsonwebtoken');
const { SiweMessage } = require('siwe');
const auth = require('../src/middleware/auth');
const authController = require('../src/controllers/authController');
const app = require('../src/app');

const testAddress = '0x1234567890123456789012345678901234567890';

const token = auth.generateToken(testAddress);
const decoded = jwt.verify(token, process.env.JWT_SECRET);

if (decoded.walletAddress !== testAddress.toLowerCase()) {
  throw new Error('JWT walletAddress mismatch');
}

if (typeof authController.getNonce !== 'function') {
  throw new Error('authController.getNonce missing');
}

if (typeof SiweMessage !== 'function') {
  throw new Error('siwe package not loaded');
}

const authRoutes = require('../src/routes/authRoutes');

if (!authRoutes || typeof authRoutes !== 'function') {
  throw new Error('authRoutes not exported');
}

console.log('Auth smoke test passed');
console.log('- JWT sign/verify OK');
console.log('- siwe package OK');
console.log('- auth routes module OK');
console.log('- app module loads OK');
