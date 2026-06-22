const https = require('https');
const fs = require('fs');

// Danh sách contracts cần lấy ABI
const contracts = [
  { name: 'MockUSDC', address: '0x2293193Eaa5CE5253d5e081046a06dB077f26f8e' },
  { name: 'ReputationStore', address: '0x7A96219812e9363dBdbD43BE14384820E5f9b0DC' },
  { name: 'PlatformTreasury', address: '0x0110BfF85E484b82205833D3950fC7C61714c0e7' },
  { name: 'JobRegistry', address: '0xeF5cc7a22D7Ff9e7FA0c5Fe714F088c98758A549' },
  { name: 'EscrowVault', address: '0xf2143d1EA4D5a8716344c2cef862f9ed41244ED5' }
];

console.log('📥 Đang lấy ABI từ Etherscan...\n');

contracts.forEach(({ name, address }) => {
  const url = `https://api-sepolia.etherscan.io/api?module=contract&action=getabi&address=${address}`;
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status === '1') {
          // Lưu ABI vào file
          fs.writeFileSync(`src/abi/${name}.json`, json.result);
          console.log(`✅ ${name}.json đã lưu thành công`);
        } else {
          console.log(`❌ ${name}.json thất bại:`, json.message);
        }
      } catch (e) {
        console.log(`❌ ${name}.json lỗi:`, e.message);
      }
    });
  }).on('error', (e) => {
    console.log(`❌ ${name}.json lỗi kết nối:`, e.message);
  });
});

// Đợi 5 giây để hoàn thành
setTimeout(() => {
  console.log('\n📋 Kiểm tra kết quả:');
  const files = ['MockUSDC', 'ReputationStore', 'PlatformTreasury', 'JobRegistry', 'EscrowVault'];
  files.forEach(f => {
    try {
      const stats = fs.statSync(`src/abi/${f}.json`);
      console.log(`✅ ${f}.json (${stats.size} bytes)`);
    } catch {
      console.log(`❌ ${f}.json chưa có`);
    }
  });
}, 5000);
