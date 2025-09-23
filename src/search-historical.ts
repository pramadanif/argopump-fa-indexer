import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

async function searchHistorical() {
  console.log('🔍 Searching for historical BullPump transactions...');
  
  const BULLPUMP_CONTRACT = "0x4660906d4ed4062029a19e989e51c814aa5b0711ef0ba0433b5f7487cb03b257";
  const TOKEN_FACTORY_MODULE = `${BULLPUMP_CONTRACT}::token_factory`;
  const BONDING_CURVE_MODULE = `${BULLPUMP_CONTRACT}::bonding_curve_pool`;
  
  try {
    const config = new AptosConfig({ 
      network: Network.TESTNET,
      fullnode: 'https://fullnode.testnet.aptoslabs.com/v1'
    });
    const aptos = new Aptos(config);
    
    // Get current ledger info to determine search range
    const ledgerInfo = await aptos.getLedgerInfo();
    const currentVersion = parseInt(ledgerInfo.ledger_version);
    
    console.log(`📊 Current ledger version: ${currentVersion}`);
    
    // Search last 5,000 transactions (smaller batch for faster results)
    const searchStart = Math.max(0, currentVersion - 5000);
    const searchEnd = currentVersion;
    
    console.log(`🔍 Searching versions ${searchStart} to ${searchEnd}...`);
    
    let foundTx = 0;
    let currentOffset = searchStart;
    const batchSize = 100;
    
    while (currentOffset < searchEnd) {
      try {
        const transactions = await aptos.getTransactions({
          options: {
            offset: currentOffset,
            limit: Math.min(batchSize, searchEnd - currentOffset)
          }
        });
        
        let bullPumpInBatch = 0;
        
        for (const tx of transactions) {
          // Check function calls
          if ('payload' in tx && tx.payload?.type === 'entry_function_payload') {
            const functionName = (tx.payload as any).function;
            if (functionName?.startsWith(TOKEN_FACTORY_MODULE) || 
                functionName?.startsWith(BONDING_CURVE_MODULE)) {
              console.log(`🎯 Found BullPump function call: ${functionName}`);
              console.log(`   Hash: ${tx.hash}`);
              console.log(`   Sender: ${(tx as any).sender}`);
              foundTx++;
              bullPumpInBatch++;
            }
          }
          
          // Check events
          if ('events' in tx && tx.events) {
            const hasEvent = tx.events.some((event: any) => 
              event.type?.includes(BULLPUMP_CONTRACT)
            );
            if (hasEvent) {
              console.log(`🎯 Found BullPump event in transaction: ${tx.hash}`);
              foundTx++;
              bullPumpInBatch++;
            }
          }
        }
        
        if (bullPumpInBatch > 0) {
          console.log(`📊 Found ${bullPumpInBatch} BullPump transactions in batch (offset ${currentOffset})`);
        } else {
          process.stdout.write('.');
        }
        
        currentOffset += batchSize;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`❌ Error at offset ${currentOffset}:`, error);
        currentOffset += batchSize;
      }
    }
    
    console.log(`\n📊 Search complete. Found ${foundTx} BullPump transactions total.`);
    
    if (foundTx === 0) {
      console.log('\n💡 No BullPump transactions found in recent history.');
      console.log('   Possible reasons:');
      console.log('   - Contract was deployed but no transactions yet');
      console.log('   - Your transaction is older than 5,000 versions');
      console.log('   - Transaction is on different network (mainnet vs testnet)');
      console.log('   - Transaction hash might help: provide it as argument');
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
}

searchHistorical();
