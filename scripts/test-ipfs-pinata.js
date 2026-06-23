/**
 * Structural test for Pinata IPFS service (no real API keys required).
 * Run: node scripts/test-ipfs-pinata.js
 */
require('dotenv').config();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const saved = {
    PINATA_JWT: process.env.PINATA_JWT,
    PINATA_API_KEY: process.env.PINATA_API_KEY,
    PINATA_SECRET_API_KEY: process.env.PINATA_SECRET_API_KEY,
    IPFS_API_KEY: process.env.IPFS_API_KEY,
    IPFS_API_SECRET: process.env.IPFS_API_SECRET,
    IPFS_GATEWAY_URL: process.env.IPFS_GATEWAY_URL,
  };

  try {
  delete require.cache[require.resolve('../src/config/ipfs')];
  delete process.env.PINATA_JWT;
  delete process.env.PINATA_API_KEY;
  delete process.env.PINATA_SECRET_API_KEY;
  delete process.env.IPFS_API_KEY;
  delete process.env.IPFS_API_SECRET;
  process.env.IPFS_GATEWAY_URL = 'https://gateway.pinata.cloud';

  const ipfsService = require('../src/config/ipfs');
  const testCid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

  const gatewayUrl = ipfsService.getGatewayUrl(testCid);
  assert(
    gatewayUrl === `https://gateway.pinata.cloud/ipfs/${testCid}`,
    `getGatewayUrl mismatch: ${gatewayUrl}`
  );

  let uploadFailed = false;
  try {
    await ipfsService.uploadJSON({ hello: 'world' });
  } catch (error) {
    uploadFailed = true;
    assert(
      error.message.includes('Pinata credentials missing'),
      `Expected missing-credentials error, got: ${error.message}`
    );
  }
  assert(uploadFailed, 'uploadJSON should fail without credentials');

  delete require.cache[require.resolve('../src/config/ipfs')];
  process.env.IPFS_API_KEY = 'test-key';
  process.env.IPFS_API_SECRET = 'test-secret';
  const ipfsWithLegacyKeys = require('../src/config/ipfs');

  let legacyAuthFailed = false;
  try {
    await ipfsWithLegacyKeys.uploadJSON({ hello: 'legacy' });
  } catch (error) {
    legacyAuthFailed = true;
    assert(
      !error.message.includes('Pinata credentials missing'),
      'Legacy IPFS_API_KEY/IPFS_API_SECRET should satisfy auth check'
    );
  }
  assert(legacyAuthFailed, 'uploadJSON with fake keys should fail at Pinata API, not auth');

  console.log('OK — Pinata IPFS structure test passed');
  console.log('  - getGatewayUrl uses IPFS_GATEWAY_URL');
  console.log('  - uploadJSON rejects missing credentials');
  console.log('  - IPFS_API_KEY / IPFS_API_SECRET legacy mapping works');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

run().catch((error) => {
  console.error('FAIL —', error.message);
  process.exit(1);
});
