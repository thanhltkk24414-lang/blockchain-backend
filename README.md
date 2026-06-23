# Fapex Backend

Node.js API cho Fapex — Web3 Freelance Platform. MongoDB cache, Pinata IPFS, dong bo su kien Sepolia.

## Chay local

cp .env.example .env
npm install
npm run dev

Entry point: src/server.js

## API Contributor 1 (da tich hop)

- POST /api/ipfs/upload/metadata - Upload metadata job, tra metadataCID
- POST /api/ipfs/upload/file - Upload deliverable / evidence
- GET /api/arbitrator/:address/status - Kiem tra coc trong tai (>= 50 USDC)

Phan cong chi tiet: docs/guides/task-split.md trong monorepo.
