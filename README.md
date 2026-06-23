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
