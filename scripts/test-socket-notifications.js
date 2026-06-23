/**
 * Socket.io notification tests.
 *
 * Unit (no server):
 *   node scripts/test-socket-notifications.js
 *
 * Integration (server + MongoDB + JWT):
 *   npm start
 *   node scripts/test-socket-notifications.js --integration
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
const socketService = require('../src/services/notifications/socketService');
const { notifyJobChange } = require('../src/services/notifications/notificationService');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';
const testWallet = '0x523ebd853a1638065f148a05c0ca423e490d92f7';

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
        timeout: 20000,
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runUnitTests() {
  console.log('--- Socket notification unit tests ---');

  const server = http.createServer((_req, res) => {
    res.end('ok');
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  socketService.initialize(server);

  const received = [];
  const fakeJob = {
    onchainJobId: 42,
    status: 'ASSIGNED',
    clientAddress: testWallet,
    freelancerAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    isDisputed: false,
  };

  const mockIo = {
    to(room) {
      return {
        emit(event, payload) {
          received.push({ room, event, payload });
        },
      };
    },
  };
  socketService.io = mockIo;

  notifyJobChange(fakeJob, 'escrow:deposited', {
    source: 'unit_test',
    transactionHash: '0xtest',
  });

  assert(received.some((r) => r.event === 'job:updated'), 'job:updated should be emitted');
  assert(received.some((r) => r.event === 'escrow:deposited'), 'escrow:deposited should be emitted');
  assert(
    received.some((r) => r.room === `wallet:${testWallet}`),
    'client wallet room should receive event'
  );
  assert(
    received.some((r) => r.room === 'job:42'),
    'job room should receive event'
  );

  socketService.io = null;
  await new Promise((resolve) => server.close(resolve));

  console.log('Unit tests passed.');
}

async function runIntegrationTests() {
  console.log('--- Socket notification integration tests ---');

  const health = await request('GET', '/health');
  assert(health.status === 200, `/health failed: ${health.status}`);
  assert(health.body.websocket?.enabled === true, 'health should report websocket enabled');

  const nonceRes = await request('POST', '/api/auth/nonce', { walletAddress: testWallet });
  assert(nonceRes.status === 200, `nonce failed: ${nonceRes.status}`);
  const nonce = nonceRes.body.nonce;
  assert(nonce, 'nonce missing from response');

  const secret = process.env.JWT_SECRET;
  assert(secret, 'JWT_SECRET required for integration test');
  const token = jwt.sign({ walletAddress: testWallet }, secret, { expiresIn: '1h' });

  const socketUrl = baseUrl.replace(/\/$/, '');
  const client = io(socketUrl, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 10000);
    client.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    client.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const connectedPayload = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connected event timeout')), 5000);
    client.on('connected', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  assert(
    connectedPayload.walletAddress === testWallet,
    `connected wallet mismatch: ${connectedPayload.walletAddress}`
  );

  client.emit('subscribe:job', 999);

  client.disconnect();
  console.log('Integration tests passed.');
}

async function main() {
  const integration = process.argv.includes('--integration');

  try {
    await runUnitTests();
    if (integration) {
      await runIntegrationTests();
    } else {
      console.log('Skip integration (run with --integration when server is up).');
    }
    console.log('All socket notification tests passed.');
    process.exit(0);
  } catch (error) {
    console.error('Socket notification tests failed:', error.message);
    process.exit(1);
  }
}

main();
