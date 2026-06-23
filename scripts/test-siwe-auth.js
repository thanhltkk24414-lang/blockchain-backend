/**
 * Verifies SIWE auth helpers and error formatting.
 * Run: node scripts/test-siwe-auth.js
 */
const { getAddress } = require('ethers');
const { SiweMessage } = require('siwe');

const domain = process.env.SIWE_DOMAIN || 'localhost';
const uri = process.env.APP_URL || 'http://localhost:3000';
const chainId = Number(process.env.CHAIN_ID || 11155111);
const nonce = 'a1b2c3d4e5f6789012345678901234ab';
const address = getAddress('0x523ebd853a1638065f148a05c0ca423e490d92f7');
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

async function main() {
  const badChecksum = prepared.replace(address, '0x523e8d853a1638065f148A05c0Ca423E490D92f7');
  try {
    new SiweMessage(badChecksum);
    console.error('FAIL: bad checksum should not parse');
    process.exit(1);
  } catch (e) {
    if (!String(e.message).includes('EIP-55')) {
      console.error('FAIL: expected EIP-55 parse error, got:', e.message);
      process.exit(1);
    }
    console.log('OK: bad checksum rejected at parse');
  }

  const wrongDomain = await msg.verify(
    { signature: '0x' + '11'.repeat(65), nonce, domain: 'http://localhost:3000', time: new Date() },
    { suppressExceptions: true }
  );
  if (wrongDomain.success || !wrongDomain.error?.type?.includes('Domain')) {
    console.error('FAIL: expected domain mismatch');
    process.exit(1);
  }
  console.log('OK: domain mismatch:', wrongDomain.error.type);

  const wrongSig = await msg.verify(
    { signature: '0x' + '11'.repeat(65), nonce, domain, time: new Date() },
    { suppressExceptions: true }
  );
  if (wrongSig.success || !wrongSig.error?.type) {
    console.error('FAIL: expected signature error');
    process.exit(1);
  }
  console.log('OK: signature error:', wrongSig.error.type);

  console.log('SIWE auth checks passed');
  console.log('Correct EIP-55 for user wallet:', address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
