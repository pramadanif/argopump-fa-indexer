import { PrismaClient } from '@prisma/client';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSetup() {
  console.log('🧪 Testing BullPump Indexer Setup...\n');

  // Test 1: Database Connection
  console.log('1. Testing database connection...');
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return;
  }

  // Test 2: Aptos Node Connection
  console.log('\n2. Testing Aptos node connection...');
  
  try {
    const config = new AptosConfig({ 
      network: Network.MAINNET,
      fullnode: process.env.APTOS_NODE_URL || 'https://fullnode.mainnet.aptoslabs.com/v1'
    });
    const aptos = new Aptos(config);
    
    const ledgerInfo = await aptos.getLedgerInfo();
    console.log('✅ Aptos node connection successful');
    console.log(`   Chain ID: ${ledgerInfo.chain_id}`);
    console.log(`   Ledger Version: ${ledgerInfo.ledger_version}`);
  } catch (error) {
    console.error('❌ Aptos node connection failed:', error);
  }

  // Test 3: Database Schema
  console.log('\n3. Testing database schema...');
  
  try {
    // Test if we can query each table
    const faCount = await prisma.fA.count();
    const tradeCount = await prisma.trade.count();
    const poolStatsCount = await prisma.poolStats.count();
    
    console.log('✅ Database schema is working');
    console.log(`   FA records: ${faCount}`);
    console.log(`   Trade records: ${tradeCount}`);
    console.log(`   PoolStats records: ${poolStatsCount}`);
  } catch (error) {
    console.error('❌ Database schema test failed:', error);
    console.log('💡 Try running: npm run db:push');
  }

  // Test 4: Environment Variables
  console.log('\n4. Checking environment variables...');
  
  const requiredEnvVars = ['DATABASE_URL'];
  const optionalEnvVars = ['APTOS_NODE_URL', 'BULLPUMP_CONTRACT_ADDRESS', 'PORT'];
  
  let envOk = true;
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      envOk = false;
    } else {
      console.log(`✅ ${envVar} is set`);
    }
  }
  
  for (const envVar of optionalEnvVars) {
    if (process.env[envVar]) {
      console.log(`✅ ${envVar} is set`);
    } else {
      console.log(`⚠️  ${envVar} is not set (using default)`);
    }
  }

  if (!envOk) {
    console.log('\n💡 Copy .env.example to .env and configure your environment variables');
  }

  // Cleanup
  await prisma.$disconnect();
  
  console.log('\n🎉 Setup test completed!');
  console.log('\nNext steps:');
  console.log('1. Configure your .env file with proper database credentials');
  console.log('2. Update BULLPUMP_CONTRACT_ADDRESS with the actual contract address');
  console.log('3. Run: npm run dev');
}

testSetup().catch(console.error);
