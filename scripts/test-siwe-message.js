/**
 * Verifies SIWE message fields match authController expectations (siwe@3).
 * Run: node scripts/test-siwe-message.js
 */
const { SiweMessage } = require('siwe');

const domain = 'localhost';
const uri = 'http://localhost:3000';
const chainId = 11155111;
const nonce = 'a1b2c3d4e5f6789012345678901234ab';
const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const statement = 'Sign in to Fapex';

const msg = new SiweMessage({
  domain,
  address,
  statement,
  uri,
  version: '1',
  chainId,
  nonce,
});

const prepared = msg.prepareMessage();

const checks = [
  [prepared.includes(domain), 'domain in message'],
  [prepared.includes(statement), 'statement in message'],
  [prepared.includes(uri), 'uri in message'],
  [prepared.includes(`Chain ID: ${chainId}`), 'chainId in message'],
  [prepared.includes(`Nonce: ${nonce}`), 'nonce in message'],
  [prepared.includes(address), 'address in message'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  console.error('SIWE message format check FAILED');
  failed.forEach(([, label]) => console.error(' -', label));
  console.error('\nPrepared message:\n', prepared);
  process.exit(1);
}

const parsed = new SiweMessage(prepared);
if (parsed.statement !== statement || Number(parsed.chainId) !== chainId) {
  console.error('Round-trip parse mismatch');
  process.exit(1);
}

console.log('SIWE message format OK (matches authController + siwe-sign.html)');
console.log(prepared);
