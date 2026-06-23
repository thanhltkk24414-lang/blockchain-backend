/**
 * SIWE auth unit + integration tests.
 *
 * Unit (no server):
 *   node scripts/test-siwe-auth.js
 *
 * Full flow (server + MongoDB required):
 *   npm start
 *   node scripts/test-siwe-auth.js --integration
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');
const { Wallet, getAddress } = require('ethers');
const { SiweMessage } = require('siwe');

const domain = process.env.SIWE_DOMAIN || 'localhost';
const uri = process.env.APP_URL || 'http://localhost:3000';
const chainId = Number(process.env.CHAIN_ID || 11155111);
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';
const statement = 'Sign in to Fapex';
const userWalletLower = '0x523ebd853a1638065f148a05c0ca423e490d92f7';
const userWalletChecksum = getAddress(userWalletLower);

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

async function runUnitTests() {
  const nonce = 'a1b2c3d4e5f6789012345678901234ab';
  const msg = new SiweMessage({
    domain,
    address: userWalletChecksum,
    statement,
    uri,
    version: '1',
    chainId,
    nonce,
  });
  const prepared = msg.prepareMessage();

  const badChecksum = prepared.replace(
    userWalletChecksum,
    '0x523e8d853a1638065f148A05c0Ca423E490D92f7'
  );
  try {
    new SiweMessage(badChecksum);
    throw new Error('bad checksum should not parse');
  } catch (e) {
    if (!String(e.message).includes('EIP-55')) {
      throw new Error('expected EIP-55 parse error, got: ' + e.message);
    }
    console.log('OK: bad checksum rejected at parse');
  }

  const lowercaseLine = prepared.replace(userWalletChecksum, userWalletLower);
  try {
    new SiweMessage(lowercaseLine);
    throw new Error('lowercase address should not parse');
  } catch (e) {
    if (!String(e.message).includes('EIP-55')) {
      throw new Error('expected EIP-55 for lowercase, got: ' + e.message);
    }
    console.log('OK: lowercase address rejected at parse');
  }

  const wrongDomain = await msg.verify(
    { signature: '0x' + '11'.repeat(65), nonce, domain: 'http://localhost:3000', time: new Date() },
    { suppressExceptions: true }
  );
  if (wrongDomain.success || !wrongDomain.error?.type?.includes('Domain')) {
    throw new Error('expected domain mismatch');
  }
  console.log('OK: domain mismatch:', wrongDomain.error.type);

  const wrongSig = await msg.verify(
    { signature: '0x' + '11'.repeat(65), nonce, domain, time: new Date() },
    { suppressExceptions: true }
  );
  if (wrongSig.success || !wrongSig.error?.type) {
    throw new Error('expected signature error');
  }
  console.log('OK: signature error:', wrongSig.error.type);

  const typoAddress = '0x523ebd853a16338865f148a05c0ca423e490d92f7';
  try {
    getAddress(typoAddress);
    throw new Error('typo address should be invalid');
  } catch (e) {
    console.log('OK: typo address 16338865 rejected:', e.message.split('(')[0].trim());
  }

  console.log('Correct EIP-55 for user wallet:', userWalletChecksum);
}

async function runIntegrationTest() {
  const wallet = Wallet.createRandom();
  const address = wallet.address;

  console.log('Integration test wallet:', address);

  const nonceRes = await request('POST', '/api/auth/nonce', { walletAddress: address });
  if (nonceRes.status !== 200 || !nonceRes.body.success) {
    throw new Error(`nonce failed (${nonceRes.status}): ${JSON.stringify(nonceRes.body)}`);
  }
  console.log('OK: nonce issued');

  const siweMsg = new SiweMessage({
    domain: nonceRes.body.domain,
    address: getAddress(nonceRes.body.walletAddress || address),
    statement,
    uri: nonceRes.body.appUrl || uri,
    version: '1',
    chainId: nonceRes.body.chainId || chainId,
    nonce: nonceRes.body.nonce,
  });
  const message = siweMsg.prepareMessage();
  const signature = await wallet.signMessage(message);

  const lowerMessage = message.replace(address, address.toLowerCase());
  const badRes = await request('POST', '/api/auth/verify', {
    message: lowerMessage,
    signature,
  });
  if (badRes.status === 200 && badRes.body.success) {
    throw new Error('lowercase message should not verify with checksum signature');
  }
  console.log('OK: lowercase message rejected:', (badRes.body.error || '').slice(0, 80) || badRes.status);

  const verifyRes = await request('POST', '/api/auth/verify', { message, signature });
  if (verifyRes.status !== 200 || !verifyRes.body.success || !verifyRes.body.token) {
    throw new Error(`verify failed (${verifyRes.status}): ${JSON.stringify(verifyRes.body)}`);
  }
  console.log('OK: verify returned JWT');

  if (verifyRes.body.token) {
    const meWithAuth = await new Promise((resolve, reject) => {
      const url = new URL('/api/auth/me', baseUrl);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
          headers: { Authorization: 'Bearer ' + verifyRes.body.token },
          timeout: 20000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: { raw: data } });
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
    if (meWithAuth.status !== 200 || !meWithAuth.body.success) {
      throw new Error(`GET /me failed: ${JSON.stringify(meWithAuth.body)}`);
    }
    console.log('OK: GET /api/auth/me with token');
  }
}

async function main() {
  const integration = process.argv.includes('--integration');

  console.log('--- SIWE unit tests ---');
  await runUnitTests();

  if (integration) {
    console.log('--- SIWE integration test →', baseUrl, '---');
    await runIntegrationTest();
  } else {
    console.log('(skip integration — run with --integration while server is up)');
  }

  console.log('SIWE auth checks passed');
}

main().catch((err) => {
  console.error('FAIL:', err.message || err);
  process.exit(1);
});
