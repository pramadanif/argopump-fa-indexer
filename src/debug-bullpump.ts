import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugArgoPump() {
  console.log('🔍 Debugging ArgoPump Contract...\n');
  
  const BULLPUMP_CONTRACT = process.env.BULLPUMP_CONTRACT_ADDRESS;
  if (!BULLPUMP_CONTRACT) {
    console.error('❌ BULLPUMP_CONTRACT_ADDRESS environment variable is not set');
    process.exit(1);
  }
  
  // Try both networks
  const networks = [
    { name: 'TESTNET', network: Network.TESTNET, url: 'https://fullnode.testnet.aptoslabs.com/v1' },
    { name: 'MAINNET', network: Network.MAINNET, url: 'https://fullnode.mainnet.aptoslabs.com/v1' }
  ];
  
  for (const { name, network, url } of networks) {
    console.log(`\n🌐 Checking ${name}...`);
    
    try {
      const config = new AptosConfig({ network, fullnode: url });
      const aptos = new Aptos(config);
      
      // Check if contract exists
      console.log('1. Checking if contract exists...');
      try {
        const accountResources = await aptos.getAccountResources({
          accountAddress: BULLPUMP_CONTRACT
        });
        console.log(`✅ Contract found on ${name}! Resources: ${accountResources.length}`);
        
        // List some resources
        console.log('📋 Sample resources:');
        accountResources.slice(0, 5).forEach(resource => {
          console.log(`   - ${resource.type}`);
        });
        
      } catch (error) {
        console.log(`❌ Contract not found on ${name}`);
        continue;
      }
      
      // Get recent transactions
      console.log('\n2. Checking recent transactions...');
      try {
        const transactions = await aptos.getTransactions({
          options: { limit: 100 }
        });
        
        let bullPumpTxCount = 0;
        const bullPumpTxs = [];
        
        for (const tx of transactions) {
          if ('payload' in tx && tx.payload?.type === 'entry_function_payload') {
            const functionName = (tx.payload as any).function;
            if (functionName?.includes(BULLPUMP_CONTRACT)) {
              bullPumpTxCount++;
              bullPumpTxs.push({
                hash: tx.hash,
                function: functionName,
                sender: (tx as any).sender
              });
            }
          }
          
          // Check events
          if ('events' in tx && tx.events) {
            const hasEvent = tx.events.some((event: any) => 
              event.type?.includes(BULLPUMP_CONTRACT)
            );
            if (hasEvent) {
              bullPumpTxCount++;
              bullPumpTxs.push({
                hash: tx.hash,
                function: 'EVENT',
                sender: (tx as any).sender
              });
            }
          }
        }
        
        console.log(`📊 Found ${bullPumpTxCount} BullPump transactions in last 100 transactions`);
        
        if (bullPumpTxs.length > 0) {
          console.log('\n🎯 Recent BullPump transactions:');
          bullPumpTxs.slice(0, 5).forEach(tx => {
            console.log(`   - ${tx.hash.substring(0, 10)}... | ${tx.function} | ${tx.sender?.substring(0, 10)}...`);
          });
        }
        
      } catch (error) {
        console.log(`❌ Error getting transactions on ${name}:`, error);
      }
      
    } catch (error) {
      console.log(`❌ Error connecting to ${name}:`, error);
    }
  }
  
  // Check specific transaction if provided
  const specificTxHash = process.argv[2];
  if (specificTxHash) {
    console.log(`\n🔍 Checking specific transaction: ${specificTxHash}`);
    
    for (const { name, network, url } of networks) {
      try {
        const config = new AptosConfig({ network, fullnode: url });
        const aptos = new Aptos(config);
        
        const tx = await aptos.getTransactionByHash({
          transactionHash: specificTxHash
        });
        
        console.log(`\n📋 Transaction details on ${name}:`);
        console.log('   Hash:', tx.hash);
        console.log('   Type:', (tx as any).type);
        if ('payload' in tx) {
          console.log('   Function:', (tx.payload as any)?.function);
          console.log('   Arguments:', (tx.payload as any)?.arguments);
        }
        if ('events' in tx) {
          console.log('   Events:', tx.events?.length || 0);
          tx.events?.slice(0, 3).forEach((event: any, i: number) => {
            console.log(`     ${i + 1}. ${event.type}`);
          });
        }
        
        break; // Found the transaction
        
      } catch (error) {
      }
    }
  }
}

debugArgoPump().catch(console.error);
