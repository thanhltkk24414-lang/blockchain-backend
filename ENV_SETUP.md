# Hướng dẫn cấu hình `backend/.env` (Bước 2)

> Sao chép `backend/.env.example` → `backend/.env`, điền địa chỉ contract từ `deployments/sepolia.json` và `RPC_URL` (cùng Infura URL với `contracts/.env`).

---

## Tổng quan

Backend đọc biến môi trường từ file `backend/.env` (không dùng `contracts/.env` trực tiếp). Một số giá trị **có thể copy** từ `contracts/.env` hoặc từ file deploy.

**Nguồn chính:**

| Nguồn | Dùng cho |
|--------|----------|
| `deployments/sepolia.json` | 6 địa chỉ contract Sepolia |
| `contracts/.env` → `SEPOLIA_RPC_URL` | `RPC_URL` trong backend |
| Infura Dashboard | RPC Sepolia |
| Pinata Dashboard | IPFS pinning + gateway |
| MongoDB local hoặc Atlas | `MONGODB_URI` |
| Tự tạo | `JWT_SECRET` |

---

## Bước 1 — Sao chép file (PowerShell)

Mở terminal tại thư mục gốc monorepo `d:\projects\Blockchain`:

```powershell
cd d:\projects\Blockchain
Copy-Item -Path backend\.env.example -Destination backend\.env
```

Hoặc nếu đang ở trong thư mục `backend`:

```powershell
cd d:\projects\Blockchain\backend
Copy-Item .env.example .env
```

**Lưu ý:** File `.env` đã nằm trong `.gitignore` — không commit lên Git.

---

## Bước 2 — Điền địa chỉ contract từ `deployments/sepolia.json`

Mở `deployments/sepolia.json` và map sang từng biến trong `backend/.env`:

| Key trong `sepolia.json` | Biến trong `backend/.env` | Địa chỉ Sepolia (deploy hiện tại) |
|--------------------------|-----------------------------|-----------------------------------|
| `addresses.MockUSDC` | `MOCK_USDC_ADDRESS` | `0x2293193Eaa5CE5253d5e081046a06dB077f26f8e` |
| `addresses.ReputationStore` | `REPUTATION_STORE_ADDRESS` | `0x7A96219812e9363dBdbD43BE14384820E5f9b0DC` |
| `addresses.PlatformTreasury` | `PLATFORM_TREASURY_ADDRESS` | `0x0110BfF85E484b82205833D3950fC7C61714c0e7` |
| `addresses.JobRegistry` | `JOB_REGISTRY_ADDRESS` | `0xeF5cc7a22D7Ff9e7FA0c5Fe714F088c98758A549` |
| `addresses.ArbitratorPanel` | `ARBITRATOR_PANEL_ADDRESS` | `0x324e7d8Cfe5aBdb62caa236Bb23626E23BC7EC4F` |
| `addresses.EscrowVault` | `ESCROW_VAULT_ADDRESS` | `0xf2143d1EA4D5a8716344c2cef862f9ed41244ED5` |

Ví dụ dòng trong `.env`:

```env
MOCK_USDC_ADDRESS=0x2293193Eaa5CE5253d5e081046a06dB077f26f8e
REPUTATION_STORE_ADDRESS=0x7A96219812e9363dBdbD43BE14384820E5f9b0DC
PLATFORM_TREASURY_ADDRESS=0x0110BfF85E484b82205833D3950fC7C61714c0e7
JOB_REGISTRY_ADDRESS=0xeF5cc7a22D7Ff9e7FA0c5Fe714F088c98758A549
ARBITRATOR_PANEL_ADDRESS=0x324e7d8Cfe5aBdb62caa236Bb23626E23BC7EC4F
ESCROW_VAULT_ADDRESS=0xf2143d1EA4D5a8716344c2cef862f9ed41244ED5
```

Nếu bạn deploy lại contract, **cập nhật lại** 6 dòng này từ file `deployments/sepolia.json` mới.

---

## Bước 3 — Copy `RPC_URL` từ `contracts/.env`

Trong `contracts/.env` (hoặc mẫu root `.env.example`), biến tên là **`SEPOLIA_RPC_URL`**.

Trong `backend/.env`, dùng tên **`RPC_URL`** (hoặc `SEPOLIA_RPC_URL` — backend chấp nhận cả hai).

```env
# contracts/.env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<PROJECT_ID_CỦA_BẠN>

# backend/.env — copy nguyên URL, chỉ đổi tên biến
RPC_URL=https://sepolia.infura.io/v3/<PROJECT_ID_CỦA_BẠN>
```

Backend (`src/config/blockchain.js`) đọc: `process.env.RPC_URL || process.env.SEPOLIA_RPC_URL`.

---

## Bảng đầy đủ: mọi biến trong `backend/.env.example`

| Biến | Điền gì | Ví dụ format | Lấy từ đâu | Bắt buộc local dev? | Copy từ `contracts/.env`? |
|------|---------|--------------|------------|----------------------|---------------------------|
| `PORT` | Cổng HTTP server | `5000` | Mặc định trong example | Không (có default logic app) | Không |
| `NODE_ENV` | Môi trường chạy | `development` | Tự đặt | Không | Không |
| `ALLOWED_ORIGINS` | Origin frontend được CORS | `http://localhost:3000` | URL dev server React | Có (khi có frontend) | Không |
| `MONGODB_URI` | Connection string MongoDB | `mongodb://localhost:27017/freelance-platform` | MongoDB local hoặc Atlas | Có (khi dùng DB) | Không |
| `RPC_URL` | JSON-RPC Sepolia | `https://sepolia.infura.io/v3/YOUR_PROJECT_ID` | Infura / Alchemy | **Có** | **Có** — = `SEPOLIA_RPC_URL` |
| `SEPOLIA_RPC_URL` | Alias của `RPC_URL` (tùy chọn) | Cùng format `RPC_URL` | Giống trên | Thay thế `RPC_URL` | **Có** — cùng giá trị |
| `JWT_SECRET` | Chuỗi bí mật ký JWT | Chuỗi ngẫu nhiên ≥ 32 ký tự | Tự generate | Có (khi có auth API) | Không |
| `JWT_EXPIRES_IN` | Thời hạn token | `7d`, `24h` | Tự đặt | Không | Không |
| `INDEXER_PRIVATE_KEY` | Private key ví gửi tx on-chain | `abc123...` (không có `0x`) | Ví Sepolia testnet | Không (tùy tính năng) | **Có thể** — cùng `PRIVATE_KEY` deployer |
| `MOCK_USDC_ADDRESS` | Địa chỉ MockUSDC | `0x2293...f8e` | `deployments/sepolia.json` | **Có** | Không |
| `REPUTATION_STORE_ADDRESS` | ReputationStore | `0x7A96...b0DC` | `deployments/sepolia.json` | **Có** | Không |
| `PLATFORM_TREASURY_ADDRESS` | PlatformTreasury | `0x0110...c0e7` | `deployments/sepolia.json` | **Có** | Không |
| `JOB_REGISTRY_ADDRESS` | JobRegistry | `0xeF5c...A549` | `deployments/sepolia.json` | **Có** | Không |
| `ARBITRATOR_PANEL_ADDRESS` | ArbitratorPanel | `0x324e...EC4F` | `deployments/sepolia.json` | **Có** | Không |
| `ESCROW_VAULT_ADDRESS` | EscrowVault | `0xf214...4ED5` | `deployments/sepolia.json` | **Có** | Không |
| `IPFS_GATEWAY_URL` | Gateway đọc IPFS | `https://gateway.pinata.cloud` | Pinata | Có (khi upload/read metadata) | Không |
| `PINATA_JWT` | JWT Pinata (khuyến nghị) | Chuỗi JWT từ dashboard | [Pinata API Keys](https://app.pinata.cloud/developers/api-keys) | Có (khi upload) — dùng JWT **hoặc** key pair | Không |
| `PINATA_API_KEY` | Pinata API key | Chuỗi public key | Pinata | Có (khi upload, nếu không dùng JWT) | Không |
| `PINATA_SECRET_API_KEY` | Pinata secret | Chuỗi bí mật | Pinata | Có (khi upload, nếu không dùng JWT) | Không |
| `IPFS_API_KEY` | Alias legacy của `PINATA_API_KEY` | Cùng Pinata API key | Pinata | Thay thế `PINATA_API_KEY` | Không |
| `IPFS_API_SECRET` | Alias legacy của `PINATA_SECRET_API_KEY` | Cùng Pinata secret | Pinata | Thay thế `PINATA_SECRET_API_KEY` | Không |

### So sánh key `contracts/.env` (root `.env.example`)

| `contracts/.env` | `backend/.env` | Ghi chú |
|------------------|----------------|---------|
| `SEPOLIA_RPC_URL` | `RPC_URL` | Copy **cùng URL** |
| `PRIVATE_KEY` | `INDEXER_PRIVATE_KEY` | Chỉ khi cần backend ký giao dịch (cron/indexer) |
| `ETHERSCAN_API_KEY` | — | Backend không dùng |
| `USDC_ADDRESS` | — | Backend dùng `MOCK_USDC_ADDRESS` từ deployments |

---

## Hướng dẫn chi tiết các trường thường gặp khó

### `RPC_URL` / Infura

1. Đăng ký tại [https://infura.io](https://infura.io) (free tier).
2. Tạo **API Key** → chọn network **Ethereum** → bật **Sepolia**.
3. Copy endpoint dạng:
   ```
   https://sepolia.infura.io/v3/<PROJECT_ID>
   ```
4. Dán vào `backend/.env` làm `RPC_URL=...`
5. Dán **cùng URL** vào `contracts/.env` làm `SEPOLIA_RPC_URL=...`

**Lỗi thường gặp:** Nhầm mainnet (`https://mainnet.infura.io/...`) với Sepolia; thiếu `/v3/`; dùng secret thay vì Project ID.

---

### `INDEXER_PRIVATE_KEY`

- **Khi nào cần:** Khi backend phải **gửi giao dịch lên Sepolia** (ví dụ cron gọi `claimTimeoutRelease`, indexer sync on-chain).
- **Có phải cùng key deployer không?** Trên **testnet dev**, thường dùng **cùng ví** với `PRIVATE_KEY` trong `contracts/.env` (ví đã deploy contract). Trên production nên dùng ví riêng, chỉ cấp role tối thiểu.
- **Format:** Giống Hardhat — **không** có tiền tố `0x` (trừ khi code app yêu cầu khác; kiểm tra khi chạy).
- **Khi không cần:** Để trống — `blockchain.js` vẫn khởi tạo provider + đọc contract (read-only), không có signer.

```env
INDEXER_PRIVATE_KEY=
```

---

### IPFS — Pinata (`IPFS_GATEWAY_URL`, `PINATA_*`)

Backend dùng [Pinata](https://pinata.cloud) để pin metadata job/bid (`src/config/ipfs.js`):

- **Upload:** `POST https://api.pinata.cloud/pinning/pinJSONToIPFS` (JSON) hoặc `pinFileToIPFS` (file)
- **Đọc:** `GET {IPFS_GATEWAY_URL}/ipfs/{cid}` (mặc định `https://gateway.pinata.cloud`)

#### Bước 1 — Tạo API key

1. Đăng ký / đăng nhập [https://app.pinata.cloud](https://app.pinata.cloud)
2. **Developers → API Keys** → **New Key**
3. Bật quyền `pinJSONToIPFS` và `pinFileToIPFS` (hoặc Admin)
4. Copy **JWT** (khuyến nghị) hoặc **API Key + Secret**

#### Bước 2 — Điền `backend/.env`

**Cách A — JWT (gọn nhất):**

```env
IPFS_GATEWAY_URL=https://gateway.pinata.cloud
PINATA_JWT=<JWT_từ_Pinata>
```

**Cách B — API key pair:**

```env
IPFS_GATEWAY_URL=https://gateway.pinata.cloud
PINATA_API_KEY=<pinata_api_key>
PINATA_SECRET_API_KEY=<pinata_secret_api_key>
```

**Cách C — tên biến legacy (vẫn hỗ trợ):**

```env
IPFS_GATEWAY_URL=https://gateway.pinata.cloud
IPFS_API_KEY=<pinata_api_key>
IPFS_API_SECRET=<pinata_secret_api_key>
```

#### Kiểm tra cấu hình (không cần key thật)

```powershell
cd d:\projects\Blockchain\backend
node scripts/test-ipfs-pinata.js
```

Kết quả mong đợi: `OK — Pinata IPFS structure test passed`.

**Local dev tối thiểu:** Có thể bỏ qua nếu chưa test tạo job/bid; route upload sẽ lỗi khi thiếu `PINATA_JWT` hoặc key pair.

---

### `MONGODB_URI`

#### Option A — MongoDB local (nhanh cho dev)

1. Cài [MongoDB Community](https://www.mongodb.com/try/download/community) hoặc chạy Docker:
   ```powershell
   docker run -d -p 27017:27017 --name mongo mongo:7
   ```
2. Trong `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/freelance-platform
   ```
   Tên database `freelance-platform` sẽ được tạo tự động khi app kết nối lần đầu.

#### Option B — MongoDB Atlas (cloud, free M0)

1. [https://cloud.mongodb.com](https://cloud.mongodb.com) → Create cluster **M0 Free**.
2. **Database Access** → tạo user + password.
3. **Network Access** → Add IP → `0.0.0.0/0` (chỉ dev) hoặc IP máy bạn.
4. **Connect** → Drivers → copy connection string:
   ```env
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/freelance-platform?retryWrites=true&w=majority
   ```
5. Thay `<password>` bằng mật khẩu thật (URL-encode ký tự đặc biệt).

---

### `JWT_SECRET`

Chuỗi bí mật để ký JSON Web Token cho đăng nhập API.

**PowerShell — tạo ngẫu nhiên 64 ký tự hex:**

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

Hoặc Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Dán kết quả:

```env
JWT_SECRET=<chuỗi_vừa_tạo>
```

**Không** dùng giá trị mẫu `your_super_secret_key_change_me` trên môi trường thật.

---

### `ALLOWED_ORIGINS`

Danh sách origin được phép gọi API (CORS), phân tách bằng dấu phẩy nếu nhiều URL.

```env
# Dev — frontend React mặc định
ALLOWED_ORIGINS=http://localhost:3000

# Nhiều origin
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Production: thay bằng domain thật (`https://your-app.com`).

---

## `.env` tối thiểu vs đầy đủ

### Tối thiểu — chạy blockchain config / đọc contract Sepolia

Đủ cho `src/config/blockchain.js` khởi tạo provider và load contract:

```env
RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID

MOCK_USDC_ADDRESS=0x2293193Eaa5CE5253d5e081046a06dB077f26f8e
REPUTATION_STORE_ADDRESS=0x7A96219812e9363dBdbD43BE14384820E5f9b0DC
PLATFORM_TREASURY_ADDRESS=0x0110BfF85E484b82205833D3950fC7C61714c0e7
JOB_REGISTRY_ADDRESS=0xeF5cc7a22D7Ff9e7FA0c5Fe714F088c98758A549
ARBITRATOR_PANEL_ADDRESS=0x324e7d8Cfe5aBdb62caa236Bb23626E23BC7EC4F
ESCROW_VAULT_ADDRESS=0xf2143d1EA4D5a8716344c2cef862f9ed41244ED5
```

### Đầy đủ — local dev với API, DB, auth, IPFS

Copy toàn bộ `backend/.env.example` và điền hết:

- `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS`
- `MONGODB_URI`
- `RPC_URL`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- 6 địa chỉ contract
- `IPFS_GATEWAY_URL`, `PINATA_JWT` (hoặc `PINATA_API_KEY` + `PINATA_SECRET_API_KEY`)
- `INDEXER_PRIVATE_KEY` (nếu test cron / tx on-chain)

### Production

Thêm/so với local:

- `NODE_ENV=production`
- `JWT_SECRET` mạnh, unique per environment
- `ALLOWED_ORIGINS` = domain production
- `MONGODB_URI` = Atlas với IP whitelist chặt
- `INDEXER_PRIVATE_KEY` = ví riêng, không dùng chung ví cá nhân
- Không commit `.env`; dùng secret manager trên host (Railway, Render, VPS, …)

---

## Biến nào backend **đang dùng** trong code?

Theo `backend/src/config/blockchain.js` (checkout hiện tại):

| Biến | Được dùng? |
|------|------------|
| `RPC_URL` / `SEPOLIA_RPC_URL` | Có — bắt buộc |
| `MOCK_USDC_ADDRESS` … `ESCROW_VAULT_ADDRESS` | Có — bắt buộc (6 biến) |
| `INDEXER_PRIVATE_KEY` | Có — tùy chọn (bật signer) |
| `MONGODB_URI` | Trong `package.json` có `mongoose`; dùng khi app/ models mount |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Dự kiến cho auth routes (full backend submodule) |
| `IPFS_GATEWAY_URL`, `PINATA_*` / `IPFS_API_*` | Có — `src/config/ipfs.js` (Pinata upload + gateway read) |
| `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS` | Dự kiến cho `app.js` / Express server |

> Submodule `backend` trên repo remote có thêm routes, models, IPFS service. Sau `git submodule update --init backend`, chạy `npm install` trong `backend/` rồi điền đủ `.env` theo bảng trên.

---

## Lỗi thường gặp & cách kiểm tra

| Triệu chứng | Nguyên nhân | Cách sửa |
|-------------|-------------|----------|
| `RPC_URL or SEPOLIA_RPC_URL is not defined` | Thiếu RPC | Thêm `RPC_URL=...` |
| `MOCK_USDC_ADDRESS is not set` (hoặc contract khác) | Thiếu/sai địa chỉ | Copy từ `deployments/sepolia.json` |
| `ABI not found for JobRegistry` | Chưa export ABI | Từ root: `npm run export-abis` |
| MongoDB connection refused | Mongo chưa chạy / sai URI | Start Mongo hoặc sửa Atlas |
| CORS error từ frontend | Sai `ALLOWED_ORIGINS` | Khớp URL frontend (port 3000) |
| Tx revert / insufficient funds | `INDEXER_PRIVATE_KEY` ví hết Sepolia ETH | Faucet Sepolia cho ví indexer |

### Kiểm tra backend khởi động

```powershell
cd d:\projects\Blockchain\backend
npm install
npm run dev
# hoặc: node src/index.js / npm start — tùy script trong package.json submodule
```

### Kiểm tra nhanh blockchain config (Node)

```powershell
cd d:\projects\Blockchain\backend
node -e "require('dotenv').config(); const bc=require('./src/config/blockchain'); bc.initialize().then(()=>console.log('OK')).catch(e=>console.error(e.message))"
```

Kết quả mong đợi: log `Blockchain provider initialized`, `Loaded contract ...` cho 6 contract, cuối cùng `OK`.

### Kiểm tra RPC

```powershell
node -e "require('dotenv').config({path:'backend/.env'}); const {ethers}=require('ethers'); new ethers.JsonRpcProvider(process.env.RPC_URL).getBlockNumber().then(n=>console.log('Sepolia block:',n))"
```

(chạy từ root monorepo, hoặc đổi path `.env`)

---

## Checklist Bước 2

- [ ] `Copy-Item backend\.env.example backend\.env`
- [ ] `RPC_URL` = cùng URL với `SEPOLIA_RPC_URL` trong `contracts/.env`
- [ ] 6 địa chỉ contract từ `deployments/sepolia.json`
- [ ] `JWT_SECRET` đã đổi khỏi giá trị mẫu (nếu dùng auth)
- [ ] `MONGODB_URI` trỏ đúng DB đang chạy (nếu dùng API + DB)
- [ ] `npm run export-abis` từ root (nếu chưa có file trong `backend/src/abi/`)
- [ ] Chạy thử lệnh kiểm tra blockchain ở trên → `OK`

---

*Tài liệu này tương ứng Bước 2 trong quy trình setup monorepo Blockchain — cập nhật khi `deployments/sepolia.json` thay đổi sau deploy mới.*
