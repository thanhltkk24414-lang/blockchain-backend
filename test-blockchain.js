require('dotenv').config();
const blockchain = require('./src/config/blockchain');

async function test() {
  console.log('🔗 Testing blockchain connection...');
  
  try {
    await blockchain.initialize();
    
    // Kiểm tra tất cả contracts
    const contracts = ['usdc', 'reputationStore', 'platformTreasury', 'jobRegistry', 'arbitratorPanel', 'escrowVault'];
    
    console.log('\n📋 Contracts status:');
    for (const name of contracts) {
      try {
        const contract = blockchain.getContract(name);
        console.log(`  ✅ ${name}: ${contract.target}`);
      } catch (error) {
        console.log(`  ❌ ${name}: ${error.message}`);
      }
    }
    
    // Kiểm tra kết nối
    const status = await blockchain.checkConnection();
    console.log('\n📊 Connection status:', status);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
