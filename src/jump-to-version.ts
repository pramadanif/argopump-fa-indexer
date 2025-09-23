import { PrismaClient } from '@prisma/client';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

const prisma = new PrismaClient();

async function jumpToVersion() {
  const targetVersion = 6876866764; // Version of the new transaction
  
  console.log(`🚀 Jumping to version ${targetVersion} to find BullPump transaction...`);
  
  const BULLPUMP_CONTRACT = "0x4660906d4ed4062029a19e989e51c814aa5b0711ef0ba0433b5f7487cb03b257";
  const TOKEN_FACTORY_MODULE = `${BULLPUMP_CONTRACT}::token_factory`;
  
  try {
    await prisma.$connect();
    
    const config = new AptosConfig({ 
      network: Network.TESTNET,
      fullnode: 'https://fullnode.testnet.aptoslabs.com/v1'
    });
    const aptos = new Aptos(config);
    
    // Get transactions around the target version
    const startVersion = targetVersion - 10;
    const endVersion = targetVersion + 10;
    
    console.log(`🔍 Searching versions ${startVersion} to ${endVersion}...`);
    
    const transactions = await aptos.getTransactions({
      options: {
        offset: startVersion,
        limit: 20
      }
    });
    
    let foundBullPump = false;
    
    for (const tx of transactions) {
      if ('version' in tx) {
        const version = parseInt(tx.version);
        
        // Check if this is a BullPump transaction
        let isBullPump = false;
        
        if ('payload' in tx && tx.payload?.type === 'entry_function_payload') {
          const functionName = (tx.payload as any).function;
          if (functionName?.startsWith(TOKEN_FACTORY_MODULE)) {
            isBullPump = true;
            console.log(`🎯 Found BullPump transaction at version ${version}:`);
            console.log(`   Hash: ${tx.hash}`);
            console.log(`   Function: ${functionName}`);
            console.log(`   Sender: ${(tx as any).sender}`);
            
            if ('events' in tx && tx.events) {
              console.log(`   Events: ${tx.events.length}`);
              tx.events.forEach((event: any, i: number) => {
                console.log(`     ${i + 1}. ${event.type}`);
                if (event.type?.includes('CreateFAEvent')) {
                  const eventData = event.data;
                  console.log(`        Token: ${eventData.name} (${eventData.symbol})`);
                  console.log(`        FA Address: ${typeof eventData.fa_obj === 'string' ? eventData.fa_obj : eventData.fa_obj.inner}`);
                }
              });
            }
            
            foundBullPump = true;
          }
        }
      }
    }
    
    if (!foundBullPump) {
      console.log('❌ No BullPump transactions found in the specified range');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

jumpToVersion();
