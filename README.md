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

## SIWE auth (verify flow)

1. Set `backend/.env`: `SIWE_DOMAIN=localhost`, `APP_URL=http://localhost:3000`, `CHAIN_ID=11155111`, `MONGODB_URI`, `JWT_SECRET`.
2. Start backend: `npm start` (use `http://127.0.0.1:5000` on Windows, not `localhost`, to avoid IPv6 hangs).
3. Open `http://127.0.0.1:5000/siwe-sign.html` → **Kết nối MetaMask** (Sepolia).
4. **Lấy nonce từ API** — fills nonce, domain, URI, chainId, and EIP-55 `walletAddress`.
5. **Ký với MetaMask** → **Copy JSON cho Postman**.
6. `POST /api/auth/verify` with that JSON body (message + signature). Do not edit the message after signing.
7. Copy `token` from response → `Authorization: Bearer <token>` for `GET /api/auth/me`.

**Common failures:** lowercase address in message (must be EIP-55, e.g. `0x523eBd853a1638065f148A05c0Ca423E490D92f7`); typo `16338865` vs correct `1638065`; signature from an old message after re-fetching nonce; `domain` must be `SIWE_DOMAIN` only (not full `APP_URL`); re-sign if you change nonce/domain/URI/chainId/address.

Run `npm run test:siwe` (unit) and `npm run test:siwe:integration` (needs `npm start` + MongoDB).

## WebSocket notifications (Socket.io)

Realtime job/escrow updates for the frontend UI. Requires JWT from SIWE login.

**Connect (browser or Node client):**

```javascript
import { io } from 'socket.io-client';

const socket = io('http://127.0.0.1:5000', {
  path: '/socket.io',
  auth: { token: '<JWT from POST /api/auth/verify>' },
  transports: ['websocket', 'polling'],
});

socket.on('connected', (data) => console.log('authenticated', data.walletAddress));
socket.on('job:updated', (payload) => console.log('job update', payload));
socket.emit('subscribe:job', onchainJobId); // optional: job-specific room
```

**Server → client events**

| Event | When |
|-------|------|
| `connected` | After JWT auth succeeds |
| `job:updated` | Any job/escrow status change (umbrella) |
| `job:created` | `JobCreated` indexed |
| `job:status_updated` | `JobStatusUpdated` indexed |
| `job:freelancer_assigned` | `FreelancerAssigned` indexed |
| `escrow:deposited` | `EscrowDeposited` |
| `escrow:released` | `FundsReleased` |
| `escrow:dispute_raised` | `DisputeRaised` |
| `dispute:updated` | Dispute opened/finalized (umbrella) |
| `dispute:opened` | `DisputeSetup` indexed |
| `dispute:finalized` | `DisputeFinalized` indexed |

**Client → server events:** `subscribe:job`, `unsubscribe:job` (pass `onchainJobId`).

Notifications are emitted when the event indexer or realtime EscrowVault listener (`SEPOLIA_WSS_URL`) syncs chain events to MongoDB.

Run `npm run test:socket` (unit) and `npm run test:socket:integration` (needs `npm start` + MongoDB + `JWT_SECRET`).

## Deploy (Railway / Render)

Production uses `Dockerfile`, `railway.toml`, and `render.yaml` in this repo. Set env vars from `.env.example` in the platform dashboard (never commit `.env`).

Full steps: [docs/guides/deploy-backend.md](https://github.com/thanhltkk24414-lang/Blockchain-docs/blob/main/guides/deploy-backend.md) in the docs repo.

Quick verify after deploy: `GET /health` on your public URL.
