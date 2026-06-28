/**
 * Arbitrator application API smoke test.
 *
 * Usage:
 *   node scripts/test-arbitrator-applications.js
 *   BASE_URL=http://127.0.0.1:5000 node scripts/test-arbitrator-applications.js --with-create
 *
 * --with-create requires MongoDB + valid JWT (set TEST_JWT) and staked wallet.
 */
const http = require('http');
const https = require('https');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';
const withCreate = process.argv.includes('--with-create');
const testJwt = process.env.TEST_JWT;

function request(method, path, body, headers = {}) {
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
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
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
  console.log(`Arbitrator applications test → ${baseUrl}`);

  const list = await request('GET', '/api/arbitrator/applications?status=pending');
  if (list.status !== 200 || !list.body.success) {
    throw new Error(`List failed: ${list.status} ${JSON.stringify(list.body)}`);
  }
  console.log('✓ GET /api/arbitrator/applications', { count: list.body.count });

  const unauth = await request('POST', '/api/arbitrator/applications', {
    reason: 'This reason is long enough for validation.',
  });
  if (unauth.status !== 401) {
    throw new Error(`Expected 401 without auth, got ${unauth.status}`);
  }
  console.log('✓ POST /api/arbitrator/applications requires auth');

  if (withCreate) {
    if (!testJwt) {
      throw new Error('Set TEST_JWT for --with-create');
    }
    const created = await request(
      'POST',
      '/api/arbitrator/applications',
      { reason: 'Integration test application with sufficient length for demo.' },
      { Authorization: `Bearer ${testJwt}` },
    );
    if (![201, 400, 409].includes(created.status)) {
      throw new Error(`Unexpected create status: ${created.status} ${JSON.stringify(created.body)}`);
    }
    console.log('✓ POST /api/arbitrator/applications (authenticated)', created.status);
  } else {
    console.log('ℹ Skipping authenticated create (pass --with-create + TEST_JWT)');
  }

  console.log('Arbitrator applications test passed');
}

main().catch((err) => {
  console.error('Arbitrator applications test failed:', err.message);
  process.exit(1);
});
