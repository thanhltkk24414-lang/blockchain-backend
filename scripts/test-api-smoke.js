/**
 * API smoke test — health (+ optional nonce) without starting the server.
 * Health works without MongoDB; nonce requires a running server + MongoDB.
 *
 * Usage:
 *   node scripts/test-api-smoke.js
 *   BASE_URL=http://127.0.0.1:5000 node scripts/test-api-smoke.js --with-nonce
 */
const http = require('http');
const https = require('https');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';
const withNonce = process.argv.includes('--with-nonce');
const testWallet = process.env.TEST_WALLET || '0x1234567890123456789012345678901234567890';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout: ${method} ${path}`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`Smoke test → ${baseUrl}`);

  const health = await request('GET', '/health');
  if (health.status !== 200 || health.body.status !== 'ok') {
    throw new Error(`Health check failed: ${health.status} ${JSON.stringify(health.body)}`);
  }
  console.log('✓ GET /health', health.body);

  if (withNonce) {
    const nonce = await request('POST', '/api/auth/nonce', { walletAddress: testWallet });
    if (nonce.status !== 200 || !nonce.body.success) {
      throw new Error(`Nonce failed (is MongoDB running?): ${nonce.status} ${JSON.stringify(nonce.body)}`);
    }
    console.log('✓ POST /api/auth/nonce', { nonce: nonce.body.nonce, chainId: nonce.body.chainId });
  } else {
    console.log('ℹ Skipping nonce (pass --with-nonce when MongoDB is available)');
  }

  console.log('API smoke test passed');
}

main().catch((err) => {
  console.error('API smoke test failed:', err.message);
  process.exit(1);
});
