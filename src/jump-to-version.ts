import { PrismaClient } from '@prisma/client';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function jumpToVersion() {
  const targetVersion = process.argv[2] ? parseInt(process.argv[2]) : NaN;
  if (isNaN(targetVersion)) {
    console.error('❌ Please provide a valid version number as a command line argument');
    process.exit(1);
  }
  
  console.log(`🚀 Jumping to version ${targetVersion} to find ArgoPump transaction...`);
  
  const BULLPUMP_CONTRACT = process.env.BULLPUMP_CONTRACT_ADDRESS;
  if (!BULLPUMP_CONTRACT) {
    throw new Error('BULLPUMP_CONTRACT_ADDRESS environment variable is not set');
  }
  
  const TOKEN_FACTORY_MODULE = `${BULLPUMP_CONTRACT}::token_factory`;
  
  try {
    await prisma.$connect();
    
    const config = new AptosConfig({
      network: Network.TESTNET,
      fullnode: process.env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com/v1'
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
