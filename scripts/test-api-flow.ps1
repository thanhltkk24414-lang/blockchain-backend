# Fapex API — interactive test flow (PowerShell)
# Usage:
#   cd backend
#   .\scripts\test-api-flow.ps1
#   .\scripts\test-api-flow.ps1 -WalletAddress 0xABC... -AuthToken eyJ...
#
# Prerequisites: backend running (npm start), MongoDB (npm run docker:mongo)
# SIWE signing requires MetaMask — this script cannot sign for you.

param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [string]$WalletAddress = "",
    [string]$AuthToken = "",
    [string]$SiweMessage = "",
    [string]$SiweSignature = "",
    [switch]$SkipJob,
    [switch]$SkipIpfs
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Title) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [string]$Token = ""
    )

    $uri = "$BaseUrl$Path"
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }

    $params = @{
        Uri         = $uri
        Method      = $Method
        Headers     = $headers
        ContentType = "application/json"
    }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }

    try {
        $response = Invoke-RestMethod @params
        return @{ Ok = $true; Data = $response }
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        $detail = $_.ErrorDetails.Message
        if (-not $detail) { $detail = $_.Exception.Message }
        return @{ Ok = $false; Status = $status; Error = $detail }
    }
}

function Show-SiweInstructions {
    param([string]$Nonce, [string]$Domain, [int]$ChainId)

    Write-Host ""
    Write-Host "SIWE signing is required — MetaMask cannot run inside PowerShell." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Open Chrome with MetaMask on Sepolia network"
    Write-Host "2. DevTools (F12) → Console → run the script from:"
    Write-Host "   docs/guides/postman-walkthrough-vi.md (Phan C, Buoc 5)"
    Write-Host ""
    Write-Host "   Values to use:"
    Write-Host "     walletAddress = $WalletAddress"
    Write-Host "     nonce         = $Nonce"
    Write-Host "     domain        = $Domain"
    Write-Host "     chainId       = $ChainId"
    Write-Host "     uri           = (match APP_URL in backend/.env, e.g. http://localhost:3000)"
    Write-Host ""
    Write-Host "3. Copy the full SIWE message and hex signature from console output"
    Write-Host ""
}

Write-Host "Fapex API test flow → $BaseUrl" -ForegroundColor Green

if (-not $WalletAddress) {
    $WalletAddress = Read-Host "Wallet address (0x... Sepolia)"
}
if (-not $WalletAddress -or $WalletAddress -notmatch '^0x[a-fA-F0-9]{40}$') {
    Write-Error "Invalid wallet address. Example: 0x1234567890123456789012345678901234567890"
}

# --- Health ---
Write-Step "GET /health"
$health = Invoke-Api -Method GET -Path "/health"
if (-not $health.Ok) {
    Write-Error "Health check failed. Is backend running? npm start"
}
$health.Data | ConvertTo-Json
if ($health.Data.mongodb -eq "disconnected") {
    Write-Warning "MongoDB disconnected — run: npm run docker:mongo"
}

# --- Nonce ---
Write-Step "POST /api/auth/nonce"
$nonceResult = Invoke-Api -Method POST -Path "/api/auth/nonce" -Body @{ walletAddress = $WalletAddress }
if (-not $nonceResult.Ok) {
    Write-Error "Nonce failed: $($nonceResult.Error)"
}
$nonceResult.Data | ConvertTo-Json
$nonce = $nonceResult.Data.nonce
$domain = $nonceResult.Data.domain
$chainId = [int]$nonceResult.Data.chainId

# --- Verify (SIWE) ---
if (-not $AuthToken) {
    if (-not $SiweMessage -or -not $SiweSignature) {
        Show-SiweInstructions -Nonce $nonce -Domain $domain -ChainId $chainId
        if (-not $SiweMessage) {
            $SiweMessage = Read-Host "Paste full SIWE message (multi-line OK in one line)"
        }
        if (-not $SiweSignature) {
            $SiweSignature = Read-Host "Paste signature (0x...)"
        }
    }

    Write-Step "POST /api/auth/verify"
    $verifyResult = Invoke-Api -Method POST -Path "/api/auth/verify" -Body @{
        message   = $SiweMessage
        signature = $SiweSignature
    }
    if (-not $verifyResult.Ok) {
        Write-Error "Verify failed: $($verifyResult.Error)`nTip: call nonce again and re-sign with a fresh nonce."
    }
    $verifyResult.Data | ConvertTo-Json
    $AuthToken = $verifyResult.Data.token
    Write-Host ""
    Write-Host "JWT token (save for later):" -ForegroundColor Green
    Write-Host $AuthToken
}
else {
    Write-Host "Using provided AuthToken (skipping verify)" -ForegroundColor DarkGray
}

# --- Me ---
Write-Step "GET /api/auth/me"
$me = Invoke-Api -Method GET -Path "/api/auth/me" -Token $AuthToken
if (-not $me.Ok) {
    Write-Error "GET /me failed: $($me.Error)"
}
$me.Data | ConvertTo-Json

# --- IPFS metadata ---
if (-not $SkipIpfs) {
    Write-Step "POST /api/ipfs/upload/metadata"
    $meta = Invoke-Api -Method POST -Path "/api/ipfs/upload/metadata" -Token $AuthToken -Body @{
        title              = "Smart Contract Audit"
        description        = "Audit Solidity escrow contracts on Sepolia testnet."
        category           = "development"
        skills             = @("Solidity", "Security")
        deliverables       = "PDF audit report with findings and remediation plan."
        acceptanceCriteria = "All critical and high issues documented with reproducible PoCs."
        clientAddress      = $WalletAddress
        createdAt          = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }
    if (-not $meta.Ok) {
        Write-Warning "IPFS upload failed (check PINATA_JWT in .env): $($meta.Error)"
    }
    else {
        $meta.Data | ConvertTo-Json
    }
}

# --- POST job ---
if (-not $SkipJob) {
    Write-Step "POST /api/jobs"
    $job = Invoke-Api -Method POST -Path "/api/jobs" -Token $AuthToken -Body @{
        title              = "Smart Contract Audit"
        description        = "Audit Solidity escrow contracts on Sepolia testnet for security vulnerabilities."
        category           = "development"
        contractValue      = 100
        duration           = 604800
        skills             = @("Solidity", "Security")
        deliverables       = "PDF audit report with findings and remediation plan."
        acceptanceCriteria = "All critical and high issues documented with reproducible PoCs."
    }
    if (-not $job.Ok) {
        Write-Warning "POST /jobs failed (needs Pinata + RPC): $($job.Error)"
    }
    else {
        $job.Data | ConvertTo-Json
    }
}

# --- GET jobs ---
Write-Step "GET /api/jobs"
$jobs = Invoke-Api -Method GET -Path "/api/jobs?page=1&limit=20"
if (-not $jobs.Ok) {
    Write-Warning "GET /jobs failed: $($jobs.Error)"
}
else {
    $jobs.Data | ConvertTo-Json -Depth 5
}

Write-Host ""
Write-Host "Flow complete." -ForegroundColor Green
Write-Host "Re-run with token: .\scripts\test-api-flow.ps1 -WalletAddress $WalletAddress -AuthToken <JWT>"
