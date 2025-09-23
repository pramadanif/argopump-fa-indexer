import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { prisma } from '../index.ts';
import { Decimal } from '@prisma/client/runtime/library';

// Define enums locally until Prisma client is properly generated
const EventType = {
  CREATE_FA: 'CREATE_FA',
  MINT_FA: 'MINT_FA',
  BURN_FA: 'BURN_FA',
  BUY_TOKENS: 'BUY_TOKENS',
  POOL_GRADUATED: 'POOL_GRADUATED'
} as const;

const TradeType = {
  BUY: 'BUY',
  SELL: 'SELL',
  MINT: 'MINT',
  BURN: 'BURN'
} as const;

interface CreateFAEvent {
  creator_addr: string;
  fa_obj: { inner: string } | string; // Can be object or string
  max_supply?: { vec: string[] } | string;
  name: string;
  symbol: string;
  decimals: number;
  icon_uri: string;
  project_uri: string;
  mint_fee_per_smallest_unit_of_fa: string;
}

interface MintFAEvent {
  fa_obj: string;
  amount: string;
  recipient_addr: string;
  total_mint_fee: string;
}

interface BurnFAEvent {
  fa_obj: string;
  amount: string;
  burner_addr: string;
}

interface BuyTokensEvent {
  buyer: string;
  fa_obj_addr: string;
  apt_amount: string;
  token_amount: string;
  fee_amount: string;
}

export class IndexerService {
  private aptos: Aptos;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastProcessedVersion = 0;

  // BullPump contract address
  private readonly BULLPUMP_CONTRACT = "0x4660906d4ed4062029a19e989e51c814aa5b0711ef0ba0433b5f7487cb03b257";
  private readonly POLLING_INTERVAL = 3000; // 3 seconds - Avoid rate limit
  
  // BullPump module names
  private readonly TOKEN_FACTORY_MODULE = `${this.BULLPUMP_CONTRACT}::token_factory`;
  private readonly BONDING_CURVE_MODULE = `${this.BULLPUMP_CONTRACT}::bonding_curve_pool`;

  constructor() {
    const network = Network.TESTNET; // Change to MAINNET when ready
    const nodeUrl = process.env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com/v1';
    
    console.log('🌐 REAL-TIME Indexer Configuration:');
    console.log('   Network:', network);
    console.log('   Node URL:', nodeUrl);
    console.log('   Contract:', this.BULLPUMP_CONTRACT);
    console.log('   Polling Interval:', this.POLLING_INTERVAL + 'ms (REAL-TIME)');
    console.log('   Batch Size: 200 transactions');
    console.log('   Expected Delay: ~1-2 seconds after deploy');
    
    const config = new AptosConfig({ 
      network,
      fullnode: nodeUrl
    });
    this.aptos = new Aptos(config);
  }

  async start(fromVersion?: number) {
    if (this.isRunning) {
      console.log('⚠️  Indexer is already running');
      return;
    }

    console.log('🚀 Starting BullPump indexer...');
    this.isRunning = true;

    // Get the last processed version from database or use provided version
    if (fromVersion !== undefined) {
      this.lastProcessedVersion = fromVersion;
      console.log(`📍 Starting from specified version: ${fromVersion}`);
    } else {
      await this.initializeLastProcessedVersion();
    }

    // Start polling for new transactions
    this.intervalId = setInterval(() => {
      this.indexNewTransactions().catch(error => {
        console.error('❌ Error in indexing cycle:', error);
      });
    }, this.POLLING_INTERVAL);

    // Run initial indexing
    await this.indexNewTransactions();
  }

  async searchHistoricalTransactions(startVersion: number, endVersion: number) {
    console.log(`🔍 Searching historical transactions from ${startVersion} to ${endVersion}...`);
    
    let currentVersion = startVersion;
    let totalBullPumpTx = 0;
    const batchSize = 100;

    while (currentVersion < endVersion) {
      try {
        const transactions = await this.aptos.getTransactions({
          options: {
            offset: currentVersion,
            limit: Math.min(batchSize, endVersion - currentVersion)
          }
        });

        let bullPumpTxInBatch = 0;
        for (const transaction of transactions) {
          if ('version' in transaction) {
            const isBullPumpTx = await this.processTransaction(transaction);
            if (isBullPumpTx) {
              bullPumpTxInBatch++;
              totalBullPumpTx++;
            }
            currentVersion = parseInt(transaction.version);
          }
        }

        if (bullPumpTxInBatch > 0) {
          console.log(`🎯 Found ${bullPumpTxInBatch} BullPump transactions in batch (version ${currentVersion})`);
        }

        currentVersion++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error searching version ${currentVersion}:`, error);
        currentVersion += batchSize;
      }
    }

    console.log(`📊 Historical search complete. Found ${totalBullPumpTx} BullPump transactions total.`);
    return totalBullPumpTx;
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping indexer...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async initializeLastProcessedVersion() {
    try {
      // Try to get the latest transaction version from our database
      const latestTrade = await prisma.trade.findFirst({
        orderBy: { created_at: 'desc' }
      });

      if (latestTrade) {
        // Get the transaction version for this trade
        const txn = await this.aptos.getTransactionByHash({
          transactionHash: latestTrade.transaction_hash
        });
        
        if ('version' in txn) {
          this.lastProcessedVersion = parseInt(txn.version);
        }
      } else {
        // If no trades in database, start from recent transactions
        // to catch up with current state
        const ledgerInfo = await this.aptos.getLedgerInfo();
        const currentVersion = parseInt(ledgerInfo.ledger_version);
        // Start very close to current for REAL-TIME tracking
        this.lastProcessedVersion = Math.max(0, currentVersion - 50);
        console.log(`📍 No previous trades found, starting from recent history: ${this.lastProcessedVersion}`);
      }

      console.log(`📍 Starting from version: ${this.lastProcessedVersion}`);
    } catch (error) {
      console.error('⚠️  Could not initialize last processed version:', error);
      this.lastProcessedVersion = 0;
    }
  }

  private async indexNewTransactions() {
    try {
      console.log('🔍 Checking for new transactions...');

      // Get recent transactions - REAL-TIME processing
      const transactions = await this.aptos.getTransactions({
        options: {
          offset: this.lastProcessedVersion + 1,
          limit: 200 // Optimized for real-time responsiveness
        }
      });

      let processedCount = 0;
      let bullPumpTxCount = 0;

      for (const transaction of transactions) {
        if ('version' in transaction) {
          const isBullPumpTx = await this.processTransaction(transaction);
          if (isBullPumpTx) {
            bullPumpTxCount++;
          }
          this.lastProcessedVersion = parseInt(transaction.version);
          processedCount++;
        }
      }

      if (processedCount > 0) {
        const currentTime = new Date().toLocaleTimeString();
        if (bullPumpTxCount > 0) {
          console.log(`🎯 [${currentTime}] Found ${bullPumpTxCount} BullPump tx in ${processedCount} transactions (v${this.lastProcessedVersion})`);
        } else {
          console.log(`⚡ [${currentTime}] Processed ${processedCount} tx - Real-time monitoring (v${this.lastProcessedVersion})`);
        }
      }
    } catch (error) {
      console.error('❌ Error indexing transactions:', error);
    }
  }

  private async processTransaction(transaction: any): Promise<boolean> {
    try {
      // Debug: Log transaction details for debugging
      const isBullPump = this.isBullPumpTransaction(transaction);
      
      if (isBullPump) {
        console.log('🎯 Found BullPump transaction:', transaction.hash);
        console.log('📋 Function:', transaction.payload?.function);
        console.log('📋 Events:', transaction.events?.length || 0);
      }

      if (!isBullPump) {
        return false;
      }

      // Process different types of BullPump events
      await this.processCreateFAEvents(transaction);
      await this.processMintFAEvents(transaction);
      await this.processBurnFAEvents(transaction);
      await this.processBuyTokensEvents(transaction);

      return true;
    } catch (error) {
      console.error('❌ Error processing transaction:', transaction.hash, error);
      return false;
    }
  }

  private isBullPumpTransaction(transaction: any): boolean {
    // Minimal debug logging for REAL-TIME performance
    if (Math.random() < 0.0001) { // Log only 0.01% for maximum speed
      console.log('🔍 Sample check:', transaction.hash?.substring(0, 10) + '...');
    }

    // Check if the transaction involves the BullPump contract
    if (transaction.payload && transaction.payload.type === 'entry_function_payload') {
      const functionName = transaction.payload.function;
      const isBullPumpFunction = functionName?.startsWith(this.TOKEN_FACTORY_MODULE) ||
                                functionName?.startsWith(this.BONDING_CURVE_MODULE);
      
      if (isBullPumpFunction) {
        console.log('🎯 Found BullPump function call:', functionName);
        return true;
      }
    }

    // Check events for BullPump contract
    if (transaction.events) {
      const hasBullPumpEvent = transaction.events.some((event: any) => 
        event.type?.includes(this.BULLPUMP_CONTRACT)
      );
      
      if (hasBullPumpEvent) {
        console.log('🎯 Found BullPump event in transaction:', transaction.hash);
        return true;
      }
    }

    return false;
  }

  private async processCreateFAEvents(transaction: any) {
    if (!transaction.events) return;

    for (const event of transaction.events) {
      if (event.type?.includes('CreateFAEvent')) {
        try {
          const eventData = event.data as CreateFAEvent;
          await this.processCreateFAEvent(transaction, eventData);
        } catch (error) {
          console.error('❌ Error processing CreateFAEvent:', error);
        }
      }
    }
  }

  private async processMintFAEvents(transaction: any) {
    if (!transaction.events) return;

    for (const event of transaction.events) {
      if (event.type?.includes('MintFAEvent')) {
        try {
          const eventData = event.data as MintFAEvent;
          await this.processMintFAEvent(transaction, eventData);
        } catch (error) {
          console.error('❌ Error processing MintFAEvent:', error);
        }
      }
    }
  }

  private async processBurnFAEvents(transaction: any) {
    if (!transaction.events) return;

    for (const event of transaction.events) {
      if (event.type?.includes('BurnFAEvent')) {
        try {
          const eventData = event.data as BurnFAEvent;
          await this.processBurnFAEvent(transaction, eventData);
        } catch (error) {
          console.error('❌ Error processing BurnFAEvent:', error);
        }
      }
    }
  }

  private async processBuyTokensEvents(transaction: any) {
    // Check for buy_tokens function calls
    if (transaction.payload?.type === 'entry_function_payload' && 
        transaction.payload.function === `${this.BONDING_CURVE_MODULE}::buy_tokens`) {
      try {
        await this.processBuyTokensTransaction(transaction);
      } catch (error) {
        console.error('❌ Error processing buy_tokens transaction:', error);
      }
    }
  }

  private async processCreateFAEvent(transaction: any, eventData: CreateFAEvent) {
    try {
      // Extract FA address using helper function
      const faAddress = this.extractFAAddress(eventData.fa_obj);
      const maxSupply = this.extractMaxSupply(eventData.max_supply);
      
      // Check if FA already exists
      const existingFA = await prisma.fA.findUnique({
        where: { address: faAddress }
      });

      if (existingFA) {
        console.log(`⚠️  FA already exists: ${eventData.name} (${eventData.symbol})`);
        return; // Already processed
      }

      // Create FA record with ALL fields
      await prisma.fA.create({
        data: {
          address: faAddress,
          name: eventData.name,
          symbol: eventData.symbol,
          creator: eventData.creator_addr,
          decimals: eventData.decimals,
          max_supply: maxSupply ? new Decimal(maxSupply) : null,
          icon_uri: eventData.icon_uri,
          project_uri: eventData.project_uri,
          mint_fee_per_unit: new Decimal(eventData.mint_fee_per_smallest_unit_of_fa),
          created_at: new Date(parseInt(transaction.timestamp) / 1000)
        }
      });

      // Create initial pool stats
      await prisma.poolStats.create({
        data: {
          fa_address: faAddress,
          apt_reserves: new Decimal(0),
          total_volume: new Decimal(0),
          trade_count: 0,
          is_graduated: false
        }
      });

      console.log(`📝 Would create CreateFA event for: ${eventData.name} (${eventData.symbol})`);
      // Event creation temporarily disabled due to schema issues

      console.log(`🪙 Created new FA: ${eventData.name} (${eventData.symbol}) at ${faAddress}`);
      console.log(`   Max Supply: ${maxSupply || 'unlimited'}`);
      console.log(`   Decimals: ${eventData.decimals}`);
    } catch (error) {
      console.error('❌ Error processing CreateFAEvent:', error);
    }
  }

  private async processMintFAEvent(transaction: any, eventData: MintFAEvent) {
    try {
      // Create trade record for mint
      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: eventData.fa_obj,
          user_address: eventData.recipient_addr,
          apt_amount: new Decimal(eventData.total_mint_fee),
          token_amount: new Decimal(eventData.amount),
          price_per_token: this.calculatePricePerToken(eventData.total_mint_fee, eventData.amount),
          created_at: new Date(transaction.timestamp)
        }
      });

      console.log(`📝 Would create MintFA event for: ${eventData.amount} tokens`);
      // Event creation temporarily disabled due to schema issues

      console.log(`🔨 Processed mint: ${eventData.amount} tokens to ${eventData.recipient_addr}`);
    } catch (error) {
      console.error('❌ Error processing MintFAEvent:', error);
    }
  }

  private async processBurnFAEvent(transaction: any, eventData: BurnFAEvent) {
    try {
      // Create trade record for burn
      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: eventData.fa_obj,
          user_address: eventData.burner_addr,
          apt_amount: new Decimal(0), // No APT involved in burn
          token_amount: new Decimal(eventData.amount),
          price_per_token: new Decimal(0),
          created_at: new Date(transaction.timestamp)
        }
      });

      console.log(`📝 Would create BurnFA event for: ${eventData.amount} tokens`);
      // Event creation temporarily disabled due to schema issues

      console.log(`🔥 Processed burn: ${eventData.amount} tokens from ${eventData.burner_addr}`);
    } catch (error) {
      console.error('❌ Error processing BurnFAEvent:', error);
    }
  }

  private async processBuyTokensTransaction(transaction: any) {
    try {
      // Check if already processed
      const existingTrade = await prisma.trade.findUnique({
        where: { transaction_hash: transaction.hash }
      });

      if (existingTrade) {
        return; // Already processed
      }

      // Extract function arguments
      const args = transaction.payload.arguments;
      if (!args || args.length < 2) {
        console.warn('⚠️  buy_tokens transaction missing arguments');
        return;
      }

      const faObjAddr = args[0]; // fa_obj_addr
      const aptAmount = args[1]; // amount in octas
      const buyer = transaction.sender;

      // Calculate fee (1% = 100 basis points)
      const feeAmount = Math.floor(parseInt(aptAmount) * 100 / 10000);
      const aptForCurve = parseInt(aptAmount) - feeAmount;

      // Try to get token amount from events or calculate it
      let tokenAmount = "0";
      
      // Look for transfer events to determine token amount
      if (transaction.events) {
        for (const event of transaction.events) {
          if (event.type?.includes('Transfer') || event.type?.includes('Deposit')) {
            try {
              const amount = event.data?.amount;
              if (amount && parseInt(amount) > 0) {
                tokenAmount = amount;
                break;
              }
            } catch (error) {
              // Continue looking
            }
          }
        }
      }

      // Create trade record
      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: faObjAddr,
          user_address: buyer,
          apt_amount: new Decimal(aptAmount),
          token_amount: new Decimal(tokenAmount),
          price_per_token: this.calculatePricePerToken(aptAmount, tokenAmount),
          created_at: new Date(transaction.timestamp)
        }
      });

      // Update pool stats
      await this.updatePoolStats(faObjAddr, aptForCurve.toString());

      console.log(`📝 Would create BuyTokens event for: ${tokenAmount} tokens, ${aptAmount} octas`);
      // Event creation temporarily disabled due to schema issues

      console.log(`💰 Processed buy: ${tokenAmount} tokens for ${aptAmount} octas (${buyer})`);
    } catch (error) {
      console.error('❌ Error processing buy_tokens transaction:', error);
    }
  }

  private calculatePricePerToken(aptAmount: string, tokenAmount: string): Decimal {
    try {
      const apt = parseFloat(aptAmount);
      const tokens = parseFloat(tokenAmount);
      
      if (tokens === 0) return new Decimal(0);
      
      return new Decimal(apt / tokens);
    } catch {
      return new Decimal(0);
    }
  }

  // Helper functions to handle different data formats from Aptos events
  private extractFAAddress(fa_obj: { inner: string } | string): string {
    if (typeof fa_obj === 'string') {
      return fa_obj;
    }
    return fa_obj.inner;
  }

  private extractMaxSupply(max_supply?: { vec: string[] } | string): string | null {
    if (!max_supply) return null;
    if (typeof max_supply === 'string') {
      return max_supply;
    }
    return max_supply.vec && max_supply.vec.length > 0 ? max_supply.vec[0] || null : null;
  }

  // Remove old processBuyEvent method as it's replaced by processBuyTokensTransaction

  // Remove old ensureFAExists method as FA creation is now handled by processCreateFAEvent

  private async updatePoolStats(faAddress: string, aptAmount: string) {
    try {
      // Get current pool stats to check for graduation
      const currentStats = await prisma.poolStats.findUnique({
        where: { fa_address: faAddress }
      });

      if (!currentStats) {
        console.warn(`⚠️  Pool stats not found for FA: ${faAddress}`);
        return;
      }

      const newAptReserves = currentStats.apt_reserves.plus(new Decimal(aptAmount));
      const graduationThreshold = new Decimal("2150000000000"); // 21500 APT in octas
      const isGraduated = newAptReserves.gte(graduationThreshold);

      await prisma.poolStats.update({
        where: { fa_address: faAddress },
        data: {
          apt_reserves: newAptReserves,
          total_volume: {
            increment: new Decimal(aptAmount)
          },
          trade_count: {
            increment: 1
          },
          is_graduated: isGraduated,
          updated_at: new Date()
        }
      });

      if (isGraduated && !currentStats.is_graduated) {
        console.log(`🎓 Pool graduated! FA: ${faAddress}`);
        
        console.log(`📝 Would create PoolGraduated event for FA: ${faAddress}`);
        // Event creation temporarily disabled due to schema issues
      }
    } catch (error) {
      console.error('❌ Error updating pool stats:', error);
    }
  }
}
