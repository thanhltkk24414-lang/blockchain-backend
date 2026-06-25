#!/usr/bin/env node
/**
 * One-off: simulate on-chain state for job #6 on Sepolia.
 */
const path = require('path');
const { ethers } = require('ethers');

const RPC = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/2391dc7d6859472ab05d34a9890ba973';
const JOB_ID = 6;
const FREELANCER = '0xa7ac8154fa3019f5e95ba3720240c782c0e3ed70';
const ESCROW = '0xf2143d1EA4D5a8716344c2cef862f9ed41244ED5';
const REGISTRY = '0xeF5cc7a22D7Ff9e7FA0c5Fe714F088c98758A549';

const STATUS = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', '?4', 'COMPLETED', 'REFUNDED', 'CANCELLED'];

const registryAbi = [
  'function getJob(uint256) view returns (tuple(address client,uint8 status,address freelancer,uint256 contractValue,uint256 deadline,uint256 submittedAt,uint256 assignedAt,string jobMetadataCID,string deliverableCID))',
];
const escrowAbi = [
  'function startWork(uint256 jobId)',
  'function submitWork(uint256 jobId, string deliverableCID)',
  'error WrongStatus()',
  'error OnlyFreelancer()',
  'error StartWindowExpired()',
  'error ContractPaused()',
];

function decodeRevert(err) {
  const data = err?.data || err?.info?.error?.data;
  if (!data) return err?.shortMessage || err?.message || String(err);
  const iface = new ethers.Interface(escrowAbi);
  try {
    const parsed = iface.parseError(data);
    return parsed?.name || data;
  } catch {
    return data;
  }
}

async function tryCall(label, fn) {
  try {
    await fn();
    return { label, ok: true, reason: null };
  } catch (e) {
    return { label, ok: false, reason: decodeRevert(e) };
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const registry = new ethers.Contract(REGISTRY, registryAbi, provider);
  const escrow = new ethers.Contract(ESCROW, escrowAbi, provider);

  const raw = await registry.getJob(JOB_ID);
  const job = {
    client: raw.client,
    status: Number(raw.status),
    statusLabel: STATUS[Number(raw.status)] ?? `UNKNOWN(${raw.status})`,
    freelancer: raw.freelancer,
    contractValue: raw.contractValue.toString(),
    deadline: Number(raw.deadline),
    submittedAt: Number(raw.submittedAt),
    assignedAt: Number(raw.assignedAt),
    jobMetadataCID: raw.jobMetadataCID,
    deliverableCID: raw.deliverableCID,
  };

  console.log('=== getJob(6) ===');
  console.log(JSON.stringify(job, null, 2));
  console.log('Freelancer matches wallet?', job.freelancer.toLowerCase() === FREELANCER.toLowerCase());

  const now = Math.floor(Date.now() / 1000);
  if (job.assignedAt > 0) {
    const elapsed = now - job.assignedAt;
    console.log(`assignedAt=${job.assignedAt} (${new Date(job.assignedAt * 1000).toISOString()})`);
    console.log(`elapsed since assign: ${elapsed}s (${(elapsed / 3600).toFixed(1)}h) — StartWindow is 72h`);
  }

  const sampleCid = 'QmSampleDeliverable00000000000000000000000000';

  const startSim = await tryCall('startWork', () =>
    escrow.startWork.staticCall(JOB_ID, { from: FREELANCER }),
  );
  const submitSim = await tryCall('submitWork', () =>
    escrow.submitWork.staticCall(JOB_ID, sampleCid, { from: FREELANCER }),
  );

  console.log('\n=== simulate (staticCall) ===');
  console.log('startWork:', startSim);
  console.log('submitWork:', submitSim);

  // gas estimate
  for (const [fn, args] of [
    ['startWork', [JOB_ID]],
    ['submitWork', [JOB_ID, sampleCid]],
  ]) {
    try {
      const gas = await escrow[fn].estimateGas(...args, { from: FREELANCER });
      console.log(`estimateGas ${fn}:`, gas.toString());
    } catch (e) {
      console.log(`estimateGas ${fn} FAILED:`, decodeRevert(e));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
