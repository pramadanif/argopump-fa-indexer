import { IndexerService } from './services/indexer.ts';
import { prisma } from './index.ts';

async function testBullPumpIndexer() {
  console.log('🧪 Testing BullPump Indexer...');
  console.log('📍 Tracking contract: 0x4660906d4ed4062029a19e989e51c814aa5b0711ef0ba0433b5f7487cb03b257');
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Initialize indexer
    const indexer = new IndexerService();
    console.log('✅ Indexer initialized');

    // Test for a short period
    await indexer.start();
    console.log('✅ Indexer started - monitoring BullPump transactions...');
    console.log('🔍 Looking for:');
    console.log('   - CreateFAEvent (token creation)');
    console.log('   - MintFAEvent (token minting)');
    console.log('   - BurnFAEvent (token burning)');
    console.log('   - buy_tokens function calls (token purchases)');

    // Run for 60 seconds to give more time to find transactions
    console.log('⏱️  Running for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));

    await indexer.stop();
    console.log('✅ Indexer stopped');

    // Check what we found
    const faCount = await prisma.fA.count();
    const tradeCount = await prisma.trade.count();
    const poolCount = await prisma.poolStats.count();

    console.log(`📊 Results:`);
    console.log(`   - FAs found: ${faCount}`);
    console.log(`   - Trades found: ${tradeCount}`);
    console.log(`   - Pools found: ${poolCount}`);

    if (faCount > 0) {
      const recentFAs = await prisma.fA.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: { pool_stats: true }
      });

      console.log('\n🪙 Recent FAs:');
      recentFAs.forEach(fa => {
        console.log(`   - ${fa.name} (${fa.symbol}) by ${fa.creator}`);
      });
    }

    if (tradeCount > 0) {
      const recentTrades = await prisma.trade.findMany({
        take: 5,
        orderBy: { created_at: 'desc' }
      });

      console.log('\n💰 Recent Trades:');
      recentTrades.forEach(trade => {
        console.log(`   - ${trade.token_amount} tokens for ${trade.apt_amount} APT`);
      });
    }

    if (faCount === 0 && tradeCount === 0) {
      console.log('\n💡 No BullPump transactions found. This could mean:');
      console.log('   - The contract is not active on the current network');
      console.log('   - No recent transactions occurred');
      console.log('   - The contract address might be incorrect');
      console.log('   - You might need to wait longer or check a different time period');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBullPumpIndexer();
