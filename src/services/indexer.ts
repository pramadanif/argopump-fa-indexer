import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { prisma } from '../index.ts';
import { Decimal } from '@prisma/client/runtime/library';

interface CreateFAEvent {
  creator_addr: string;
  fa_obj: { inner: string } | string;
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

interface TokenPurchaseEvent {
  buyer: string;
  fa_object: string;
  apt_in: string;
  tokens_out: string;
}

interface TokenSaleEvent {
  seller: string;
  fa_object: string;
  tokens_in: string;
  apt_out: string;
}

// Graduation event
interface GraduatedPoolCreatedEvent {
  fa_object: string;
  pool_address: string;
  apt_amount: string;
  fa_amount: string;
  lp_shares: string;
}

// DEX events (for logging only, not stored in DB)
interface PoolCreatedEvent {
  pool_addr: string;
  hook_type: number;
  assets: string[];
  creator: string;
  ts: string;
}

interface LiquidityAddedEvent {
  pool_addr: string;
  position_idx: string;
  assets: string[];
  amounts: string[];
  creator: string;
  ts: string;
}

interface LiquidityRemovedEvent {
  pool_addr: string;
  position_idx: string;
  assets: string[];
  amounts: string[];
  creator: string;
  ts: string;
}

interface SwappedEvent {
  pool_addr: string;
  assets: string[];
  asset_in_index: string;
  asset_out_index: string;
  amount_in: string;
  amount_out: string;
  creator: string;
  ts: string;
}

interface FeeCollectedEvent {
  pool_addr: string;
  hook_type: number;
  position_idx: string;
  assets: string[];
  amounts: string[];
  creator: string;
  ts: string;
}

export class IndexerService {
  private aptos: Aptos;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastProcessedVersion = 0;

  private readonly BULLPUMP_CONTRACT: string;
  private readonly POLLING_INTERVAL = 2000;
  
  private readonly TOKEN_FACTORY_MODULE: string;
  private readonly BONDING_CURVE_MODULE: string;
  private readonly GRADUATION_HANDLER_MODULE: string;
  private readonly ROUTER_MODULE: string;

  constructor() {
    const nodeUrl = process.env.APTOS_NODE_URL;
    this.BULLPUMP_CONTRACT = process.env.BULLPUMP_CONTRACT_ADDRESS || '';
    const apiKey = process.env.APTOS_API_KEY;
    
    if (!nodeUrl) {
      throw new Error('APTOS_NODE_URL environment variable is not set');
    }
    
    if (!this.BULLPUMP_CONTRACT) {
      throw new Error('BULLPUMP_CONTRACT_ADDRESS environment variable is not set');
    }
    
    this.TOKEN_FACTORY_MODULE = `${this.BULLPUMP_CONTRACT}::token_factory`;
    this.BONDING_CURVE_MODULE = `${this.BULLPUMP_CONTRACT}::bonding_curve_pool`;
    this.GRADUATION_HANDLER_MODULE = `${this.BULLPUMP_CONTRACT}::graduation_handler`;
    this.ROUTER_MODULE = `${this.BULLPUMP_CONTRACT}::router`;
    
    const network = Network.TESTNET;
    
    console.log('⚡ ARGOPUMP Indexer Configuration:');
    console.log('   Network:', network);
    console.log('   Node URL:', nodeUrl);
    console.log('   API Key:', apiKey ? '✅ Configured' : '❌ Not configured');
    console.log('   Contract:', this.BULLPUMP_CONTRACT);
    console.log('   Modules Tracked:');
    console.log('     - token_factory (DB: FA, PoolStats)');
    console.log('     - bonding_curve_pool (DB: Trade)');
    console.log('     - graduation_handler (DB: PoolStats update)');
    console.log('     - router (Log only: Swaps, Liquidity)');
    console.log('   Polling:', this.POLLING_INTERVAL + 'ms');
    console.log('   Batch Size: 300 transactions');
    
    const config = new AptosConfig({ 
      network,
      fullnode: nodeUrl,
      ...(apiKey && {
        clientConfig: {
          HEADERS: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      })
    });
    
    this.aptos = new Aptos(config);
  }

  async start(fromVersion?: number, maxDuration?: number) {
    if (this.isRunning) {
      console.log('⚠️  Indexer is already running');
      return;
    }

    console.log('🚀 Starting ArgoPump indexer...');
    this.isRunning = true;

    if (fromVersion !== undefined) {
      this.lastProcessedVersion = fromVersion;
      console.log(`📍 Starting from specified version: ${fromVersion}`);
    } else {
      await this.initializeLastProcessedVersion();
    }

    if (maxDuration) {
      console.log(`⏰ Running in serverless mode for ${maxDuration}ms`);
      setTimeout(() => {
        console.log('⏰ Serverless timeout reached, stopping indexer...');
        this.stop();
      }, maxDuration);
      
      await this.runBatchProcessing(maxDuration);
    } else {
      this.intervalId = setInterval(() => {
        this.indexNewTransactions().catch(error => {
          console.error('❌ Error in indexing cycle:', error);
        });
      }, this.POLLING_INTERVAL);

      await this.indexNewTransactions();
    }
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

  private async runBatchProcessing(maxDuration: number) {
    const startTime = Date.now();
    const batchInterval = 5000;
    
    console.log('🔄 Starting batch processing for serverless environment...');
    
    while (this.isRunning && (Date.now() - startTime) < maxDuration - 5000) {
      try {
        await this.indexNewTransactions();
        await new Promise(resolve => setTimeout(resolve, batchInterval));
      } catch (error) {
        console.error('❌ Error in batch processing:', error);
        await new Promise(resolve => setTimeout(resolve, batchInterval));
      }
    }
    
    console.log('✅ Batch processing completed');
  }

  private async initializeLastProcessedVersion() {
    try {
      const ledgerInfo = await this.aptos.getLedgerInfo();
      const currentVersion = parseInt(ledgerInfo.ledger_version);
      
      const recentTrade = await prisma.trade.findFirst({
        where: {
          created_at: {
            gte: new Date(Date.now() - 3600000)
          }
        },
        orderBy: { created_at: 'desc' }
      });

      if (recentTrade) {
        try {
          const txn = await this.aptos.getTransactionByHash({
            transactionHash: recentTrade.transaction_hash
          });
          
          if ('version' in txn) {
            this.lastProcessedVersion = parseInt(txn.version);
            console.log(`📍 Continuing from recent trade: ${this.lastProcessedVersion}`);
            return;
          }
        } catch {
          console.log('⚠️  Could not get recent trade version, jumping to latest');
        }
      }
      
      this.lastProcessedVersion = Math.max(0, currentVersion - 100);
      console.log(`⚡ ULTRA-FAST MODE: Jumping to latest blockchain version`);
      console.log(`📍 Current ledger: ${currentVersion}`);
      console.log(`📍 Starting from: ${this.lastProcessedVersion}`);
    } catch (error) {
      console.error('⚠️  Could not initialize last processed version:', error);
      this.lastProcessedVersion = 0;
    }
  }

  private async indexNewTransactions() {
    try {
      const transactions = await this.aptos.getTransactions({
        options: {
          offset: this.lastProcessedVersion + 1,
          limit: 300
        }
      });

      if (transactions.length === 0) {
        return;
      }

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
          console.log(`🎯 [${currentTime}] Found ${bullPumpTxCount} BullPump tx in ${processedCount} txs (v${this.lastProcessedVersion})`);
        } else {
          if (Math.random() < 0.1) {
            console.log(`⚡ [${currentTime}] Scanned ${processedCount} tx (v${this.lastProcessedVersion})`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error indexing transactions:', error);
    }
  }

  private async processTransaction(transaction: any): Promise<boolean> {
    try {
      const isBullPump = this.isBullPumpTransaction(transaction);
      
      if (!isBullPump) {
        return false;
      }

      // Process events that affect database
      await this.processCreateFAEvents(transaction);
      await this.processMintFAEvents(transaction);
      await this.processBurnFAEvents(transaction);
      await this.processBuyTokensEvents(transaction);
      await this.processTokenPurchaseEvents(transaction);
      await this.processTokenSaleEvents(transaction);
      await this.processGraduatedPoolCreatedEvents(transaction);
      
      // Process DEX events (logging only)
      await this.processPoolCreatedEvents(transaction);
      await this.processLiquidityAddedEvents(transaction);
      await this.processLiquidityRemovedEvents(transaction);
      await this.processSwappedEvents(transaction);
      await this.processFeeCollectedEvents(transaction);

      return true;
    } catch (error) {
      console.error('❌ Error processing transaction:', transaction.hash, error);
      return false;
    }
  }

  private isBullPumpTransaction(transaction: any): boolean {
    if (transaction.payload && transaction.payload.type === 'entry_function_payload') {
      const functionName = transaction.payload.function;
      const isBullPumpFunction = functionName?.startsWith(this.TOKEN_FACTORY_MODULE) ||
                                functionName?.startsWith(this.BONDING_CURVE_MODULE) ||
                                functionName?.startsWith(this.GRADUATION_HANDLER_MODULE) ||
                                functionName?.startsWith(this.ROUTER_MODULE);
      
      if (isBullPumpFunction) {
        return true;
      }
    }

    if (transaction.events && transaction.events.length > 0) {
      const hasBullPumpEvent = transaction.events.some((event: any) => 
        event.type?.includes(this.BULLPUMP_CONTRACT)
      );
      
      if (hasBullPumpEvent) {
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
    if (transaction.payload?.type === 'entry_function_payload' && 
        transaction.payload.function === `${this.BONDING_CURVE_MODULE}::buy_tokens`) {
      try {
        await this.processBuyTokensTransaction(transaction);
      } catch (error) {
        console.error('❌ Error processing buy_tokens:', error);
      }
    }
  }

  private async processTokenPurchaseEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('TokenPurchaseEvent')) {
        try {
          const eventData = event.data as TokenPurchaseEvent;
          await this.processTokenPurchaseEvent(transaction, eventData);
        } catch (error) {
          console.error('❌ Error processing TokenPurchaseEvent:', error);
        }
      }
    }
  }

  private async processTokenSaleEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('TokenSaleEvent')) {
        try {
          const eventData = event.data as TokenSaleEvent;
          await this.processTokenSaleEvent(transaction, eventData);
        } catch (error) {
          console.error('❌ Error processing TokenSaleEvent:', error);
        }
      }
    }
  }

  private async processGraduatedPoolCreatedEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('GraduatedPoolCreatedEvent')) {
        try {
          const eventData = event.data as GraduatedPoolCreatedEvent;
          await this.processGraduatedPoolCreatedEvent(transaction, eventData);
        } catch (error) {
          console.error('❌ Error processing GraduatedPoolCreatedEvent:', error);
        }
      }
    }
  }

  // DEX events - logging only, no database changes
  private async processPoolCreatedEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('PoolCreated')) {
        try {
          const eventData = event.data as PoolCreatedEvent;
          console.log(`🏊 DEX Pool Created: ${eventData.pool_addr} | Assets: ${eventData.assets.length}`);
        } catch (error) {
          // Silent fail for logging
        }
      }
    }
  }

  private async processLiquidityAddedEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('LiquidityAdded')) {
        try {
          const eventData = event.data as LiquidityAddedEvent;
          console.log(`💧 Liquidity Added: Pool ${eventData.pool_addr} | Position ${eventData.position_idx}`);
        } catch (error) {
          // Silent fail for logging
        }
      }
    }
  }

  private async processLiquidityRemovedEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('LiquidityRemoved')) {
        try {
          const eventData = event.data as LiquidityRemovedEvent;
          console.log(`💧 Liquidity Removed: Pool ${eventData.pool_addr} | Position ${eventData.position_idx}`);
        } catch (error) {
          // Silent fail for logging
        }
      }
    }
  }

  private async processSwappedEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('Swapped')) {
        try {
          const eventData = event.data as SwappedEvent;
          console.log(`🔄 Swap: Pool ${eventData.pool_addr} | ${eventData.amount_in} → ${eventData.amount_out}`);
        } catch (error) {
          // Silent fail for logging
        }
      }
    }
  }

  private async processFeeCollectedEvents(transaction: any) {
    if (!transaction.events) return;
    for (const event of transaction.events) {
      if (event.type?.includes('FeeCollected')) {
        try {
          const eventData = event.data as FeeCollectedEvent;
          console.log(`💰 Fee Collected: Pool ${eventData.pool_addr} | Position ${eventData.position_idx}`);
        } catch (error) {
          // Silent fail for logging
        }
      }
    }
  }

  private async processCreateFAEvent(transaction: any, eventData: CreateFAEvent) {
    try {
      const faAddress = this.extractFAAddress(eventData.fa_obj);
      const maxSupply = this.extractMaxSupply(eventData.max_supply);
      
      const existingFA = await prisma.fA.findUnique({
        where: { address: faAddress }
      });

      if (existingFA) {
        return;
      }

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

      await prisma.poolStats.create({
        data: {
          fa_address: faAddress,
          apt_reserves: new Decimal(0),
          total_volume: new Decimal(0),
          trade_count: 0,
          is_graduated: false
        }
      });

      console.log(`🪙 Created FA: ${eventData.name} (${eventData.symbol})`);
    } catch (error) {
      console.error('❌ Error processing CreateFAEvent:', error);
    }
  }

  private async processMintFAEvent(transaction: any, eventData: MintFAEvent) {
    try {
      // Convert microseconds to milliseconds
      const timestampMs = parseInt(transaction.timestamp) / 1000;

      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: eventData.fa_obj,
          user_address: eventData.recipient_addr,
          apt_amount: new Decimal(eventData.total_mint_fee),
          token_amount: new Decimal(eventData.amount),
          price_per_token: this.calculatePricePerToken(eventData.total_mint_fee, eventData.amount),
          created_at: new Date(timestampMs)
        }
      });

      console.log(`🔨 Minted: ${eventData.amount} tokens`);
    } catch (error) {
      console.error('❌ Error processing MintFAEvent:', error);
    }
  }

  private async processBurnFAEvent(transaction: any, eventData: BurnFAEvent) {
    try {
      // Convert microseconds to milliseconds
      const timestampMs = parseInt(transaction.timestamp) / 1000;

      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: eventData.fa_obj,
          user_address: eventData.burner_addr,
          apt_amount: new Decimal(0),
          token_amount: new Decimal(eventData.amount),
          price_per_token: new Decimal(0),
          created_at: new Date(timestampMs)
        }
      });

      console.log(`🔥 Burned: ${eventData.amount} tokens`);
    } catch (error) {
      console.error('❌ Error processing BurnFAEvent:', error);
    }
  }

  private async processBuyTokensTransaction(transaction: any) {
    try {
      const existingTrade = await prisma.trade.findUnique({
        where: { transaction_hash: transaction.hash }
      });

      if (existingTrade) return;

      const args = transaction.payload.arguments;
      if (!args || args.length < 2) return;

      const faObjAddr = args[0];
      const aptAmount = args[1];
      const buyer = transaction.sender;

      const feeAmount = Math.floor(parseInt(aptAmount) * 100 / 10000);
      const aptForCurve = parseInt(aptAmount) - feeAmount;

      let tokenAmount = "0";
      
      if (transaction.events) {
        for (const event of transaction.events) {
          if (event.type?.includes('Transfer') || event.type?.includes('Deposit')) {
            try {
              const amount = event.data?.amount;
              if (amount && parseInt(amount) > 0) {
                tokenAmount = amount;
                break;
              }
            } catch {}
          }
        }
      }

      // Convert microseconds to milliseconds
      const timestampMs = parseInt(transaction.timestamp) / 1000;

      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: faObjAddr,
          user_address: buyer,
          apt_amount: new Decimal(aptAmount),
          token_amount: new Decimal(tokenAmount),
          price_per_token: this.calculatePricePerToken(aptAmount, tokenAmount),
          created_at: new Date(timestampMs)
        }
      });

      await this.updatePoolStats(faObjAddr, aptForCurve.toString());

      console.log(`💰 Buy: ${tokenAmount} tokens`);
    } catch (error) {
      console.error('❌ Error processing buy_tokens:', error);
    }
  }

  private async processTokenPurchaseEvent(transaction: any, eventData: TokenPurchaseEvent) {
    try {
      const existingTrade = await prisma.trade.findUnique({
        where: { transaction_hash: transaction.hash }
      });

      if (existingTrade) return;

      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: eventData.fa_object,
          user_address: eventData.buyer,
          apt_amount: new Decimal(eventData.apt_in),
          token_amount: new Decimal(eventData.tokens_out),
          price_per_token: this.calculatePricePerToken(eventData.apt_in, eventData.tokens_out),
          created_at: new Date(parseInt(transaction.timestamp) / 1000)
        }
      });

      await this.updatePoolStats(eventData.fa_object, eventData.apt_in);

      console.log(`💰 Purchase: ${eventData.tokens_out} tokens`);
    } catch (error) {
      console.error('❌ Error processing TokenPurchaseEvent:', error);
    }
  }

  private async processTokenSaleEvent(transaction: any, eventData: TokenSaleEvent) {
    try {
      const existingTrade = await prisma.trade.findUnique({
        where: { transaction_hash: transaction.hash }
      });

      if (existingTrade) return;

      await prisma.trade.create({
        data: {
          transaction_hash: transaction.hash,
          fa_address: eventData.fa_object,
          user_address: eventData.seller,
          apt_amount: new Decimal(eventData.apt_out).negated(),
          token_amount: new Decimal(eventData.tokens_in).negated(),
          price_per_token: this.calculatePricePerToken(eventData.apt_out, eventData.tokens_in),
          created_at: new Date(parseInt(transaction.timestamp) / 1000)
        }
      });

      console.log(`💸 Sale: ${eventData.tokens_in} tokens`);
    } catch (error) {
      console.error('❌ Error processing TokenSaleEvent:', error);
    }
  }

  private async processGraduatedPoolCreatedEvent(transaction: any, eventData: GraduatedPoolCreatedEvent) {
    try {
      await prisma.poolStats.update({
        where: { fa_address: eventData.fa_object },
        data: {
          is_graduated: true,
          updated_at: new Date()
        }
      });

      console.log(`🎓 Pool Graduated! FA: ${eventData.fa_object}`);
      console.log(`   DEX Pool: ${eventData.pool_address}`);
      console.log(`   APT: ${eventData.apt_amount}, FA: ${eventData.fa_amount}`);
      console.log(`   LP Shares: ${eventData.lp_shares}`);
    } catch (error) {
      console.error('❌ Error processing GraduatedPoolCreatedEvent:', error);
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

  private async updatePoolStats(faAddress: string, aptAmount: string) {
    try {
      const currentStats = await prisma.poolStats.findUnique({
        where: { fa_address: faAddress }
      });

      if (!currentStats) {
        return;
      }

      const newAptReserves = currentStats.apt_reserves.plus(new Decimal(aptAmount));
      const graduationThreshold = new Decimal("2150000000000");
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
        console.log(`🎓 Pool graduated! ${faAddress}`);
      }
    } catch (error) {
      console.error('❌ Error updating pool stats:', error);
    }
  }
}