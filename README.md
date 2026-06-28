# FAPEX — Backend

> Node.js API, SIWE auth, MongoDB cache, Sepolia event indexer, Pinata IPFS, Socket.io.

Submodule của monorepo [`Blockchain`](../README.md).

**Production:** https://fapex-backend-production.up.railway.app

**Cập nhật:** 2026-06-28

---

## Features

| Module | Mô tả |
|--------|--------|
| **Auth** | SIWE (EIP-4361) → JWT 7 ngày |
| **REST API** | users, jobs, bids, disputes, IPFS upload |
| **Indexer** | `eth_getLogs` poll → MongoDB + Socket.io |
| **Realtime** | Optional WSS listener (`SEPOLIA_WSS_URL`) |
| **IPFS** | Pinata pin file/metadata |
| **CORS** | Wildcard `https://*.vercel.app` |

---

## Quick start

```bash
cd backend
npm install
cp .env.example .env
# Điền MONGODB_URI, RPC_URL, JWT_SECRET, contract addresses, PINATA_JWT

npm run dev          # http://127.0.0.1:5000
npm run docker:mongo # MongoDB local (Docker)
```

---

## Environment variables

Xem đầy đủ: [`.env.example`](.env.example)

| Variable | Mô tả |
|----------|--------|
| `PORT` | Default 5000 |
| `MONGODB_URI` | MongoDB connection |
| `RPC_URL` | Sepolia JSON-RPC |
| `JWT_SECRET` | Auth signing |
| `SIWE_DOMAIN` | Domain trong SIWE message (no protocol) |
| `APP_URL` | Full app URL (SIWE URI) |
| `ALLOWED_ORIGINS` | CORS + Socket.io (`https://*.vercel.app`) |
| `ENABLE_EVENT_INDEXER` | `false` để tắt indexer local |
| `INDEXER_PRIVATE_KEY` | Wallet cho on-chain txs (createJob, cron) |
| `JOB_REGISTRY_ADDRESS` | `0x302629f82d51b0972ffc3A99cbE355F4acEf908d` |
| `LEGACY_JOB_REGISTRY_ADDRESS` | `0xE5425cFE21BAe73d54138Bb290B671bF4c55FBC9` |
| `PINATA_JWT` | IPFS pinning |

Contract addresses sync với [`../deployments/sepolia.json`](../deployments/sepolia.json).

---

## API endpoints

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/health` | Health check |
| GET | `/api/config` | Contract addresses cho FE |
| POST | `/api/auth/nonce` | SIWE step 1 |
| POST | `/api/auth/verify` | SIWE → JWT |
| GET | `/api/auth/me` | Current user |
| POST | `/api/ipfs/upload/*` | Pinata upload |
| CRUD | `/api/jobs`, `/api/bids`, `/api/disputes` | Job marketplace |

Chi tiết: [docs/guides/auth-api.md](../docs/guides/auth-api.md)

---

## Indexer

- File: `src/services/blockchain/eventIndexer.js`
- Checkpoint: `IndexerState.lastBlock`
- Events: `JobCreated`, `EscrowDeposited`, `WorkSubmitted`, `DisputeRaised`, …
- **Chain = source of truth** — MongoDB là cache

Sau redeploy JobRegistry:

```bash
node scripts/migrate-job-registry-index.js
```

---

## Socket.io

- Path: `/socket.io`
- Auth: JWT trong handshake
- Rooms: `wallet:{address}`, `job:{onchainJobId}`

---

## Deploy (Railway)

Chi tiết: [docs/guides/deploy-backend.md](../docs/guides/deploy-backend.md)

```
ALLOWED_ORIGINS=http://localhost:3000,https://*.vercel.app
SIWE_DOMAIN=your-app.vercel.app
APP_URL=https://your-app.vercel.app
```

---

## Docs

- [Manual (VI)](../docs/guides/manual-vi.md)
- [Deploy backend](../docs/guides/deploy-backend.md)
- [Postman walkthrough](../docs/guides/postman-walkthrough-vi.md)
- [On-chain / off-chain map](../docs/guides/on-chain-off-chain-map-vi.md)
