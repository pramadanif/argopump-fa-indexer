import { PrismaClient } from '@prisma/client';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function testSpecificTransaction() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error('❌ Please provide a transaction hash as a command line argument');
    process.exit(1);
  }
  
  console.log('🧪 Testing specific BullPump transaction...');
  console.log('📍 Transaction:', txHash);
  
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    const config = new AptosConfig({
      network: Network.TESTNET,
      fullnode: process.env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com/v1'
    });
    const aptos = new Aptos(config);

    // Get the specific transaction
    const transaction = await aptos.getTransactionByHash({
      transactionHash: txHash
    });

    console.log('\n📋 Transaction Details:');
    console.log('   Hash:', transaction.hash);
    console.log('   Version:', (transaction as any).version);
    console.log('   Type:', (transaction as any).type);
    
    if ('payload' in transaction) {
      console.log('   Function:', (transaction.payload as any)?.function);
      console.log('   Arguments:', (transaction.payload as any)?.arguments);
    }
    
    if ('events' in transaction && transaction.events) {
      console.log('   Events:', transaction.events.length);
      transaction.events.forEach((event: any, i: number) => {
        console.log(`     ${i + 1}. ${event.type}`);
        if (event.type.includes('CreateFAEvent')) {
          console.log('        Data:', JSON.stringify(event.data, null, 2));
        }
      });
    }

    // Test if our indexer would detect this transaction
    const BULLPUMP_CONTRACT = process.env.BULLPUMP_CONTRACT_ADDRESS;
    if (!BULLPUMP_CONTRACT) {
      console.error('❌ BULLPUMP_CONTRACT_ADDRESS environment variable is not set');
      process.exit(1);
    }
    const TOKEN_FACTORY_MODULE = `${BULLPUMP_CONTRACT}::token_factory`;
    
    let isBullPump = false;
    
    // Check function call
    if ('payload' in transaction && transaction.payload?.type === 'entry_function_payload') {
      const functionName = (transaction.payload as any).function;
      if (functionName?.startsWith(TOKEN_FACTORY_MODULE)) {
        console.log('\n✅ Would be detected as BullPump function call');
        isBullPump = true;
      }
    }
    
    // Check events
    if ('events' in transaction && transaction.events) {
      const hasEvent = transaction.events.some((event: any) => 
        event.type?.includes(BULLPUMP_CONTRACT)
      );
      if (hasEvent) {
        console.log('✅ Would be detected as BullPump event');
        isBullPump = true;
      }
    }
    
    if (!isBullPump) {
      console.log('❌ Would NOT be detected by current indexer logic');
    }

    // Try to process CreateFAEvent
    if ('events' in transaction && transaction.events) {
      for (const event of transaction.events) {
        if (event.type?.includes('CreateFAEvent')) {
          console.log('\n🎯 Processing CreateFAEvent...');
          const eventData = event.data;
          
          console.log('Event Data:');
          console.log('   creator_addr:', eventData.creator_addr);
          console.log('   fa_obj:', eventData.fa_obj);
          console.log('   name:', eventData.name);
          console.log('   symbol:', eventData.symbol);
          console.log('   decimals:', eventData.decimals);
          console.log('   max_supply:', eventData.max_supply);
          console.log('   icon_uri:', eventData.icon_uri);
          console.log('   project_uri:', eventData.project_uri);
          
          // Extract FA address properly
          const faAddress = typeof eventData.fa_obj === 'string' 
            ? eventData.fa_obj 
            : eventData.fa_obj.inner;
            
          console.log('   Extracted FA Address:', faAddress);
          
          // Check if FA already exists in database
          const existingFA = await prisma.fA.findUnique({
            where: { address: faAddress }
          });
          
          if (existingFA) {
            console.log('⚠️  FA already exists in database');
          } else {
            console.log('✅ FA is new, would be created in database');
            
            // Actually create it for testing
            try {
              await prisma.fA.create({
                data: {
                  address: faAddress,
                  name: eventData.name,
                  symbol: eventData.symbol,
                  creator: eventData.creator_addr,
                  created_at: new Date(parseInt((transaction as any).timestamp) / 1000)
                }
              });
              
              await prisma.poolStats.create({
                data: {
                  fa_address: faAddress,
                  apt_reserves: 0,
                  total_volume: 0,
                  trade_count: 0,
                  is_graduated: false
                }
              });
              
              console.log('🎉 Successfully created FA and PoolStats in database!');
              
            } catch (error) {
              console.error('❌ Error creating FA:', error);
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSpecificTransaction();
