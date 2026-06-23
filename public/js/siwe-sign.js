(function () {
  'use strict';

  const STATEMENT = 'Sign in to Fapex';
  const API_BASE = window.location.origin;
  const SEPOLIA_CHAIN_ID = 11155111;
  const SEPOLIA_HEX = '0xaa36a7';

  const els = {
    status: document.getElementById('status'),
    walletAddress: document.getElementById('walletAddress'),
    nonce: document.getElementById('nonce'),
    domain: document.getElementById('domain'),
    uri: document.getElementById('uri'),
    chainId: document.getElementById('chainId'),
    outMessage: document.getElementById('outMessage'),
    outSignature: document.getElementById('outSignature'),
    btnConnect: document.getElementById('btnConnect'),
    btnNonce: document.getElementById('btnNonce'),
    btnSign: document.getElementById('btnSign'),
    btnCopyPostman: document.getElementById('btnCopyPostman'),
  };

  let connectedAccount = null;

  /** Uses ethers.getAddress when available; otherwise MetaMask / nonce API checksummed address. */
  function getChecksumAddress(address) {
    const hex = address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(hex)) {
      throw new Error('Địa chỉ ví không hợp lệ.');
    }
    if (typeof window.ethers !== 'undefined' && window.ethers.getAddress) {
      return window.ethers.getAddress(hex);
    }
    if (connectedAccount && hex.toLowerCase() === connectedAccount.toLowerCase()) {
      return connectedAccount;
    }
    if (hex !== hex.toLowerCase() && hex !== hex.toUpperCase()) {
      return hex;
    }
    throw new Error(
      'Cần địa chỉ EIP-55: bấm "Kết nối MetaMask" rồi "Lấy nonce từ API" (server trả về checksum).'
    );
  }

  function resolveSigningAddress() {
    if (!connectedAccount) {
      throw new Error('Bấm "Kết nối MetaMask" trước.');
    }
    return getChecksumAddress(connectedAccount);
  }

  function setStatus(kind, text) {
    els.status.className = kind;
    els.status.textContent = text;
  }

  function showError(err, context) {
    const msg = err && err.message ? err.message : String(err);
    console.error(context || 'SIWE sign error:', err);
    setStatus('error', (context ? context + ': ' : '') + msg);
    if (typeof err === 'object' && err !== null && err.code !== undefined) {
      alert('Lỗi: ' + msg + (err.code ? ' (code ' + err.code + ')' : ''));
    } else {
      alert('Lỗi: ' + msg);
    }
  }

  /** EIP-4361 message — same layout as siwe@3 SiweMessage.prepareMessage() */
  function prepareSiweMessage(fields) {
    const {
      domain,
      address,
      statement,
      uri,
      version,
      chainId,
      nonce,
      issuedAt = new Date().toISOString(),
    } = fields;

    const header = domain + ' wants you to sign in with your Ethereum account:';
    const prefix = statement
      ? header + '\n' + address + '\n\n' + statement + '\n'
      : header + '\n' + address + '\n';

    return (
      prefix +
      '\nURI: ' + uri +
      '\nVersion: ' + version +
      '\nChain ID: ' + chainId +
      '\nNonce: ' + nonce +
      '\nIssued At: ' + issuedAt
    );
  }

  function getEthereum() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (Array.isArray(eth.providers) && eth.providers.length) {
      return eth.providers.find(function (p) { return p.isMetaMask; }) || eth.providers[0];
    }
    return eth;
  }

  function applyQueryParams() {
    const params = new URLSearchParams(window.location.search);
    ['walletAddress', 'nonce', 'domain', 'uri', 'chainId'].forEach(function (key) {
      const value = params.get(key);
      if (value) els[key].value = value;
    });
  }

  function checkEthereum() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setStatus(
        'error',
        'window.ethereum không có — MetaMask chưa cài hoặc trang mở sai (file://).\n' +
        'Cài MetaMask, mở http://127.0.0.1:5000/siwe-sign.html sau khi chạy npm start.'
      );
      els.btnConnect.disabled = true;
      els.btnSign.disabled = true;
      return false;
    }
    setStatus('ok', 'MetaMask phát hiện được. Bấm "Kết nối MetaMask" trước, rồi lấy nonce và ký.');
    return true;
  }

  async function ensureSepolia(ethereum, targetChainId) {
    const chainId = Number(targetChainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new Error('Chain ID không hợp lệ.');
    }
    const hexChain = '0x' + chainId.toString(16);
    const currentHex = await ethereum.request({ method: 'eth_chainId' });
    if (currentHex.toLowerCase() === hexChain.toLowerCase()) return;

    setStatus('info', 'Đang chuyển sang chain ' + chainId + '…');
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChain }],
      });
    } catch (switchErr) {
      if (switchErr.code === 4902 && chainId === SEPOLIA_CHAIN_ID) {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: SEPOLIA_HEX,
            chainName: 'Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
        return;
      }
      throw switchErr;
    }
  }

  async function connectWallet() {
    const ethereum = getEthereum();
    if (!ethereum) {
      showError(new Error('MetaMask không khả dụng.'), 'Kết nối');
      return;
    }
    els.btnConnect.disabled = true;
    setStatus('info', 'Chờ MetaMask — chọn tài khoản…');
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        throw new Error('Không có tài khoản nào được chọn.');
      }
      connectedAccount = accounts[0];
      els.walletAddress.value = connectedAccount;

      const targetChain = Number(els.chainId.value) || SEPOLIA_CHAIN_ID;
      await ensureSepolia(ethereum, targetChain);

      setStatus('ok', 'Đã kết nối: ' + connectedAccount + '\nTiếp theo: "Lấy nonce từ API" rồi "Ký với MetaMask".');
    } catch (err) {
      showError(err, 'Kết nối MetaMask');
    } finally {
      els.btnConnect.disabled = false;
    }
  }

  async function fetchNonce() {
    if (!connectedAccount) {
      setStatus('error', 'Bấm "Kết nối MetaMask" trước khi lấy nonce.');
      return;
    }
    const walletAddress = getChecksumAddress(connectedAccount);
    els.btnNonce.disabled = true;
    setStatus('info', 'Đang gọi POST /api/auth/nonce…');
    try {
      const res = await fetch(API_BASE + '/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddress }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'HTTP ' + res.status);
      }
      els.nonce.value = data.nonce;
      if (data.domain) els.domain.value = data.domain;
      if (data.appUrl) els.uri.value = data.appUrl;
      if (data.chainId) els.chainId.value = String(data.chainId);
      if (data.walletAddress) {
        connectedAccount = data.walletAddress;
        els.walletAddress.value = data.walletAddress;
      }
      setStatus('ok', 'Đã lấy nonce. Bấm "Ký với MetaMask".');
    } catch (err) {
      showError(err, 'Lấy nonce thất bại');
    } finally {
      els.btnNonce.disabled = false;
    }
  }

  function buildMessageString() {
    const walletAddress = resolveSigningAddress();
    const nonce = els.nonce.value.trim();
    const domain = els.domain.value.trim();
    const uri = els.uri.value.trim();
    const chainId = Number(els.chainId.value);

    if (!nonce || !domain || !uri || !chainId) {
      throw new Error('Điền đủ nonce, domain, uri và chainId (lấy nonce từ API).');
    }

    return prepareSiweMessage({
      domain: domain,
      address: walletAddress,
      statement: STATEMENT,
      uri: uri,
      version: '1',
      chainId: chainId,
      nonce: nonce,
    });
  }

  async function signSiwe() {
    const ethereum = getEthereum();
    if (!ethereum) {
      showError(new Error('MetaMask không khả dụng. Dùng http://127.0.0.1:5000/siwe-sign.html.'), 'Ký');
      return;
    }

    let prepared;
    try {
      prepared = buildMessageString();
    } catch (err) {
      showError(err, 'Tạo message');
      return;
    }

    els.btnSign.disabled = true;
    setStatus('info', 'Đang kết nối ví và chờ xác nhận ký trong MetaMask…');

    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        throw new Error('Chưa kết nối ví — bấm "Kết nối MetaMask" trước.');
      }
      const signer = accounts[0];
      connectedAccount = signer;
      els.walletAddress.value = signer;

      if (signer.toLowerCase() !== connectedAccount.toLowerCase()) {
        throw new Error('Ví MetaMask (' + signer + ') không khớp tài khoản đang ký.');
      }

      const targetChain = Number(els.chainId.value) || SEPOLIA_CHAIN_ID;
      await ensureSepolia(ethereum, targetChain);

      prepared = buildMessageString();

      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [prepared, signer],
      });

      els.outMessage.value = prepared;
      els.outSignature.value = signature;
      els.btnCopyPostman.disabled = false;
      setStatus('ok', 'Đã ký thành công.\nBấm "Copy JSON cho Postman" → dán vào body verify, hoặc copy từng field vào biến Postman.');
    } catch (err) {
      showError(err, 'Ký SIWE');
    } finally {
      els.btnSign.disabled = false;
    }
  }

  function buildPostmanJson() {
    const message = els.outMessage.value;
    const signature = els.outSignature.value;
    if (!message || !signature) {
      throw new Error('Chưa có message/chữ ký — bấm "Ký với MetaMask" trước.');
    }
    return JSON.stringify({ message: message, signature: signature });
  }

  async function copyPostmanJson() {
    let json;
    try {
      json = buildPostmanJson();
    } catch (err) {
      showError(err, 'Copy JSON');
      return;
    }
    els.btnCopyPostman.disabled = true;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setStatus('ok', 'Đã copy JSON cho Postman.\nDán vào body POST /api/auth/verify hoặc file verify-body.json (REST Client).');
    } catch (err) {
      showError(err, 'Copy JSON');
    } finally {
      els.btnCopyPostman.disabled = false;
    }
  }

  els.btnConnect.addEventListener('click', function (e) {
    e.preventDefault();
    connectWallet();
  });
  els.btnNonce.addEventListener('click', function (e) {
    e.preventDefault();
    fetchNonce();
  });
  els.btnSign.addEventListener('click', function (e) {
    e.preventDefault();
    signSiwe();
  });
  els.btnCopyPostman.addEventListener('click', function (e) {
    e.preventDefault();
    copyPostmanJson();
  });

  applyQueryParams();
  checkEthereum();

  window.addEventListener('ethereum#initialized', checkEthereum);
})();
