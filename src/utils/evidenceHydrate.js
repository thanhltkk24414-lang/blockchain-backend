const { keccak256, toUtf8Bytes } = require('ethers');
const Dispute = require('../models/Dispute');
const ipfsService = require('../config/ipfs');
const logger = require('../utils/logger');

function cidToEvidenceHash(cid) {
  const trimmed = String(cid || '').trim();
  if (!trimmed) return null;
  return keccak256(toUtf8Bytes(trimmed)).toLowerCase();
}

function evidenceToPlain(entry) {
  if (!entry) return null;
  if (typeof entry.toObject === 'function') return entry.toObject();
  return { ...entry };
}

/** Merge duplicate rows and resolve ipfsHash from onChainHash when possible. */
function resolveEvidenceCids(evidenceList) {
  const hashToCid = new Map();
  const resolved = [];

  for (const raw of evidenceList || []) {
    const ev = evidenceToPlain(raw);
    if (!ev) continue;

    const ipfsHash = ev.ipfsHash ? String(ev.ipfsHash).trim() : '';
    const onChainHash = ev.onChainHash ? String(ev.onChainHash).toLowerCase() : '';

    if (ipfsHash) {
      const computed = cidToEvidenceHash(ipfsHash);
      if (computed) hashToCid.set(computed, ipfsHash);
      if (onChainHash) hashToCid.set(onChainHash, ipfsHash);
    }

    resolved.push(ev);
  }

  for (const ev of resolved) {
    if (!ev.ipfsHash && ev.onChainHash) {
      const cid = hashToCid.get(String(ev.onChainHash).toLowerCase());
      if (cid) ev.ipfsHash = cid;
    }
  }

  return resolved;
}

async function findCidInDatabase(onChainHash, onchainJobId) {
  const hash = String(onChainHash).toLowerCase();
  const filter = {
    'evidence.onChainHash': hash,
    'evidence.ipfsHash': { $exists: true, $nin: [null, ''] },
  };
  if (onchainJobId != null) filter.onchainJobId = Number(onchainJobId);

  const dispute = await Dispute.findOne(filter).lean();
  if (!dispute?.evidence?.length) return null;

  for (const entry of dispute.evidence) {
    if (entry.onChainHash?.toLowerCase() === hash && entry.ipfsHash) {
      return entry.ipfsHash;
    }
    if (entry.ipfsHash && cidToEvidenceHash(entry.ipfsHash) === hash) {
      return entry.ipfsHash;
    }
  }
  return null;
}

async function findCidFromPinata(onchainJobId, onChainHash) {
  if (onchainJobId == null || !onChainHash) return null;
  try {
    const pins = await ipfsService.listPinsByMetadata('onchainJobId', String(onchainJobId));
    const hash = String(onChainHash).toLowerCase();
    for (const pin of pins) {
      const cid = pin.cid;
      if (!cid) continue;
      if (cidToEvidenceHash(cid) === hash) return cid;
    }
  } catch (err) {
    logger.warn(`Pinata evidence lookup failed for job ${onchainJobId}: ${err.message}`);
  }
  return null;
}

async function hydrateEvidenceContent(evidenceList, { onchainJobId } = {}) {
  let list = resolveEvidenceCids(evidenceList);

  for (const ev of list) {
    if (ev.ipfsHash || !ev.onChainHash) continue;
    const fromDb = await findCidInDatabase(ev.onChainHash, onchainJobId);
    if (fromDb) {
      ev.ipfsHash = fromDb;
      continue;
    }
    const fromPinata = await findCidFromPinata(onchainJobId, ev.onChainHash);
    if (fromPinata) ev.ipfsHash = fromPinata;
  }

  list = resolveEvidenceCids(list);

  return Promise.all(
    list.map(async (evidence) => {
      let content = null;
      if (evidence.ipfsHash) {
        try {
          content = await ipfsService.getJSON(evidence.ipfsHash);
        } catch {
          try {
            content = await ipfsService.getFile(evidence.ipfsHash);
          } catch {
            /* not JSON or file */
          }
        }
      }
      return {
        ...evidence,
        content,
      };
    }),
  );
}

module.exports = {
  cidToEvidenceHash,
  resolveEvidenceCids,
  hydrateEvidenceContent,
};
