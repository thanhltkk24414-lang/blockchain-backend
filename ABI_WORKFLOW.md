# Quy trình ABI cho backend (`src/abi/`)

> **Tóm tắt:** Không bao giờ copy ABI thủ công từ Etherscan vào `src/abi/*.json`. Luôn export từ Hardhat trong monorepo gốc: `npm run compile && npm run export-abis`.

---

## Vì sao copy ABI từ Etherscan gây conflict?

Khi owner repo `blockchain-backend` dán ABI từ [Etherscan](https://etherscan.io) vào `src/abi/*.json` rồi commit, file đó **không khớp** với phiên bản dev đã export bằng script `scripts/export-abis.js` trong monorepo `Blockchain`. Git coi đây là hai thay đổi song song trên cùng file → **merge conflict** khi `git pull --rebase origin main` hoặc merge `dev` vào `main`.

Các khác biệt thường gặp (dù cả hai đều có thể là mảng JSON):

| Nguồn | Định dạng file | Vấn đề |
|--------|----------------|--------|
| **Hardhat export** (`npm run export-abis`) | Mảng ABI thuần, `JSON.stringify(abi, null, 2)` | **Chuẩn** — khớp `contracts/` trong monorepo |
| **Artifact Hardhat** (`artifacts/.../Contract.json`) | Object đầy đủ: `_format`, `contractName`, `abi`, `bytecode`, … | Script export **chỉ lấy** trường `abi` |
| **Etherscan (Contract → Code → ABI)** | Thường là mảng ABI thuần | Có thể **lệch nội dung** (contract cũ, proxy, nhầm địa chỉ), **khác thứ tự/format**, hoặc dán nhầm toàn bộ artifact |

Backend (`src/config/blockchain.js`) yêu cầu file ABI là **mảng JSON** (không phải object bọc `abi`):

```javascript
const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
if (!Array.isArray(abi) || abi.length === 0) {
  throw new Error(`ABI file is empty for ${contractName}`);
}
```

Copy Etherscan dễ gây conflict vì:

1. **Nội dung khác** — ABI on-chain có thể không khớp source Solidity hiện tại trong monorepo.
2. **Lịch sử Git chồng chéo** — owner sửa tay trên `main`, dev export tự động trên `dev`.
3. **Định dạng khác nhẹ** — khoảng trắng, xuống dòng, thứ tự field → Git diff toàn file dù logic giống nhau.

---

## Định dạng ABI đúng

Script `d:\projects\Blockchain\scripts\export-abis.js`:

1. Đọc artifact Hardhat (ví dụ `artifacts/contracts/FreelanceSystem.sol/JobRegistry.json`).
2. Lấy trường `abi` (mảng).
3. Ghi ra `backend/src/abi/<ContractName>.json` — **chỉ mảng ABI**, indent 2 spaces.

**Ví dụ đầu file `JobRegistry.json` đúng:**

```json
[
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_reputationStore",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  ...
]
```

**Sai — artifact Hardhat nguyên bản (không dùng trực tiếp):**

```json
{
  "_format": "hh-sol-artifact-1",
  "contractName": "JobRegistry",
  "abi": [ ... ],
  "bytecode": "0x..."
}
```

**Sai — tự sửa / copy Etherscan** khi chưa chạy export từ monorepo.

### Các file ABI trong repo

| File | Contract |
|------|----------|
| `src/abi/MockUSDC.json` | MockUSDC |
| `src/abi/ReputationStore.json` | ReputationStore |
| `src/abi/PlatformTreasury.json` | PlatformTreasury |
| `src/abi/JobRegistry.json` | JobRegistry |
| `src/abi/ArbitratorPanel.json` | ArbitratorPanel |
| `src/abi/EscrowVault.json` | EscrowVault |

---

## Quy trình đúng (mọi thành viên)

Chạy từ **thư mục gốc monorepo** `d:\projects\Blockchain` (không chạy trong submodule `backend`):

```powershell
cd d:\projects\Blockchain
npm run compile
npm run export-abis
```

Sau đó commit trong repo **`blockchain-backend`** (submodule):

```powershell
cd d:\projects\Blockchain\backend
git status
git add src/abi/
git commit -m "chore: sync ABIs from Hardhat export"
git push origin dev
```

**Khi nào cần export lại?**

- Sau khi sửa Solidity trong `contracts/`.
- Sau khi `npm run compile` tạo artifact mới.
- Trước khi merge `dev` → `main` nếu contract đã đổi.

**Không làm:**

- Dán ABI từ Etherscan vào `src/abi/*.json`.
- Sửa tay từng function trong file ABI.
- Copy nguyên file `artifacts/.../Contract.json` vào `src/abi/`.

---

## Owner đang kẹt rebase trên Codespaces / `main`

Giả sử bạn đang trong repo `blockchain-backend`, lệnh `git pull --rebase origin main` báo conflict ở `src/abi/*.json`.

### Bước 0 — Kiểm tra trạng thái

```bash
git status
# Thường thấy: interactive rebase in progress; Unmerged paths: src/abi/...
```

### Tùy chọn A — Hủy rebase, dùng nhánh dev (an toàn nhất)

```bash
git rebase --abort
git checkout dev
git pull origin dev
```

Dùng khi bạn **không cần** giữ commit copy ABI thủ công trên `main`.

### Tùy chọn B — Tiếp tục rebase, chấp nhận ABI từ dev (khuyến nghị)

Trong VS Code / Codespaces, với **mỗi** file conflict trong `src/abi/`:

- Chọn **Accept Incoming Change** (phiên bản incoming / `theirs` trong rebase thường là nhánh bạn rebase lên, tức `main` hoặc upstream — **ưu tiên phiên bản đã export từ dev**, không phải bản bạn paste Etherscan).

Hoặc sửa tay: xóa toàn bộ marker `<<<<<<<`, `=======`, `>>>>>>>`, giữ nội dung từ nhánh dev/export.

```bash
git add src/abi/
git rebase --continue
```

Lặp lại nếu còn conflict. Khi xong:

```bash
git status
```

### Tùy chọn C — ABI mới từ monorepo (chuẩn nhất)

Nếu có clone monorepo `Blockchain` (hoặc Codespaces workspace đầy đủ):

```bash
# Từ thư mục gốc monorepo (một cấp trên backend nếu backend là submodule)
cd /workspaces/Blockchain   # hoặc đường dẫn tương đương
npm run compile
npm run export-abis

cd backend
git add src/abi/
# Nếu đang rebase:
git rebase --continue
# Nếu không rebase, commit bình thường:
git commit -m "chore: sync ABIs from Hardhat export"
```

### Giải quyết từng file ABI khi conflict

| File | Hành động khuyến nghị |
|------|------------------------|
| `src/abi/ArbitratorPanel.json` | Accept Incoming (dev/export) **hoặc** file sau `npm run export-abis` |
| `src/abi/EscrowVault.json` | Giống trên |
| `src/abi/JobRegistry.json` | Giống trên |
| `src/abi/MockUSDC.json` | Giống trên |
| `src/abi/PlatformTreasury.json` | Giống trên |
| `src/abi/ReputationStore.json` | Giống trên |

**Không** giữ phía "Current Change" nếu đó là bản copy Etherscan.

---

## Làm sạch `main` sau khi merge (owner)

Sau khi conflict đã xử lý và merge/rebase xong:

```bash
cd backend   # repo blockchain-backend
git checkout main
git pull origin main
git merge dev          # hoặc: git pull --rebase origin main (khi đã fix conflict)
git push origin main
```

Đảm bảo ABI trên `main` trùng `dev`:

```powershell
# Từ monorepo root (Windows)
cd d:\projects\Blockchain
npm run compile
npm run export-abis
cd backend
git diff src/abi/
```

Nếu `git diff` trống (hoặc chỉ khác line ending), ABI đã đồng bộ.

Commit đồng bộ nếu có thay đổi thật:

```bash
git add src/abi/
git commit -m "chore: sync ABIs from Hardhat export"
git push origin main
```

---

## Kiểm tra nhanh ABI hợp lệ

```powershell
cd d:\projects\Blockchain\backend
node -e "require('dotenv').config(); const bc=require('./src/config/blockchain'); bc.initialize().then(()=>console.log('OK')).catch(e=>console.error(e.message))"
```

Kết quả mong đợi: log load 6 contract, cuối cùng `OK`.

Lỗi `ABI file is empty` hoặc `ABI not found` → chạy lại `npm run export-abis` từ monorepo root.

---

## Liên quan

- Cấu hình `.env` và địa chỉ contract: [ENV_SETUP.md](./ENV_SETUP.md)
- Script export: `d:\projects\Blockchain\scripts\export-abis.js`
- Load ABI trong backend: `src/config/blockchain.js` → `loadAbi()`

---

*Tài liệu này giải quyết conflict rebase do copy ABI Etherscan thủ công. Luôn dùng `npm run compile && npm run export-abis` từ monorepo gốc.*
