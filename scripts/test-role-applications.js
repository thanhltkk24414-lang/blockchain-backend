/**
 * Delegated role application API smoke test.
 *
 * Usage:
 *   node scripts/test-role-applications.js
 *   BASE_URL=http://127.0.0.1:5000 node scripts/test-role-applications.js --with-create
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
  console.log(`Role applications test → ${baseUrl}`);

  const list = await request('GET', '/api/admin/role-applications?status=pending');
  if (list.status !== 200 || !list.body.success) {
    throw new Error(`List failed: ${list.status} ${JSON.stringify(list.body)}`);
  }
  console.log('✓ GET /api/admin/role-applications', { count: list.body.count });

  const unauth = await request('POST', '/api/admin/role-applications', {
    desiredRole: 'pauser',
    reason: 'This reason is long enough for validation.',
  });
  if (unauth.status !== 401) {
    throw new Error(`Expected 401 without auth, got ${unauth.status}`);
  }
  console.log('✓ POST /api/admin/role-applications requires auth');

  const badRole = await request('POST', '/api/admin/role-applications', {
    desiredRole: 'superadmin',
    reason: 'This reason is long enough for validation.',
  }, testJwt ? { Authorization: `Bearer ${testJwt}` } : {});
  if (testJwt && badRole.status !== 400) {
    throw new Error(`Expected 400 for invalid role, got ${badRole.status}`);
  }
  if (testJwt) console.log('✓ POST rejects invalid desiredRole');

  if (withCreate && testJwt) {
    const created = await request(
      'POST',
      '/api/admin/role-applications',
      {
        desiredRole: 'pauser',
        reason: 'Smoke test application for delegated pauser role.',
      },
      { Authorization: `Bearer ${testJwt}` },
    );
    if (created.status !== 201 || !created.body.success) {
      throw new Error(`Create failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    console.log('✓ POST created role application', created.body.application?._id);

    const mine = await request('GET', '/api/admin/role-applications/me', null, {
      Authorization: `Bearer ${testJwt}`,
    });
    if (mine.status !== 200 || !mine.body.success) {
      throw new Error(`GET me failed: ${mine.status}`);
    }
    console.log('✓ GET /api/admin/role-applications/me', { count: mine.body.applications?.length });
  } else if (withCreate) {
    console.log('Skip create — set TEST_JWT for authenticated create test');
  }

  console.log('All role application checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
