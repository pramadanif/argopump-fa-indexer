# BullPump FA Indexer - Deployment Guide

## Quick Deployment Checklist

### ✅ Prerequisites Completed
- [x] Express.js + TypeScript server setup
- [x] PostgreSQL database schema (Prisma)
- [x] Aptos SDK integration
- [x] API endpoints for tokens and trades
- [x] Real-time indexing service
- [x] Trending algorithm implementation

### 🚀 Production Deployment Steps

#### 1. Environment Configuration

Update your `.env` file with production values:

```bash
# Required: Your Supabase PostgreSQL URLs
DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
DIRECT_URL="postgresql://postgres:[password]@[host]:5432/postgres"

# Required: BullPump contract address (update this!)
BULLPUMP_CONTRACT_ADDRESS="0x[actual_contract_address]"

# Optional: Custom Aptos node (default: mainnet)
APTOS_NODE_URL="https://fullnode.mainnet.aptoslabs.com/v1"

# Optional: Custom port (default: 3000)
PORT=3000

# Production environment
NODE_ENV=production
```

#### 2. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to production database
npm run db:push

# Verify setup
npm run test:setup
```

#### 3. Build and Deploy

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### 🌐 Platform-Specific Deployment

#### Supabase + Vercel
1. Push code to GitHub
2. Connect Vercel to your repository
3. Add environment variables in Vercel dashboard
4. Deploy automatically

#### Railway
1. Connect Railway to your GitHub repository
2. Add environment variables
3. Deploy with automatic builds

#### Manual VPS Deployment
```bash
# Clone repository
git clone [your-repo-url]
cd bullpump-fa-indexer

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Setup database
npm run db:push

# Build and start
npm run build
npm start
```

### 📊 Monitoring and Health Checks

#### Health Check Endpoint
```
GET /health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### API Endpoints to Test
```bash
# List all tokens
curl http://localhost:3000/api/tokens

# Get trending tokens
curl http://localhost:3000/api/tokens/trending

# Get recent trades
curl http://localhost:3000/api/trades/recent

# Health check
curl http://localhost:3000/health
```

### 🔧 Configuration Notes

#### BullPump Contract Integration
**IMPORTANT**: Update `BULLPUMP_CONTRACT_ADDRESS` in your `.env` file with the actual BullPump contract address.

The indexer currently looks for:
- Events containing `BuyEvent` or `buy_tokens`
- Function calls to `buy_tokens`
- Events from the specified contract address

You may need to adjust the event parsing logic in `src/services/indexer.ts` based on the actual BullPump contract events.

#### Performance Tuning
- **Polling Interval**: Currently 1 minute (60000ms)
- **Transaction Batch Size**: 100 transactions per cycle
- **Database Connection Pool**: Managed by Prisma

To adjust polling frequency, modify `POLLING_INTERVAL` in `src/services/indexer.ts`.

#### Database Indexes (Recommended)
Add these indexes for better performance:

```sql
-- Index for trending queries
CREATE INDEX idx_trades_created_at ON "Trade" (created_at);
CREATE INDEX idx_trades_fa_address_created_at ON "Trade" (fa_address, created_at);

-- Index for transaction hash lookups
CREATE INDEX idx_trades_transaction_hash ON "Trade" (transaction_hash);

-- Index for user queries
CREATE INDEX idx_trades_user_address ON "Trade" (user_address);
```

### 🚨 Troubleshooting

#### Common Issues

1. **Database Connection Errors**
   - Verify `DATABASE_URL` is correct
   - Check network connectivity to Supabase
   - Ensure database exists and is accessible

2. **No Trades Being Indexed**
   - Verify `BULLPUMP_CONTRACT_ADDRESS` is correct
   - Check Aptos node connectivity
   - Review event parsing logic for actual contract events

3. **High Memory Usage**
   - Reduce `POLLING_INTERVAL` if processing too frequently
   - Optimize database queries
   - Add pagination to large result sets

4. **API Timeouts**
   - Add database connection pooling
   - Implement caching for trending queries
   - Add request rate limiting

#### Logs to Monitor
```bash
# Successful operations
✅ Connected to database
✅ Indexer service started
✅ Processed X transactions
💰 Processed buy: X tokens for Y APT
🪙 Created new FA: TokenName (SYMBOL)

# Warnings
⚠️ Could not fetch FA metadata for: address
⚠️ Could not initialize last processed version

# Errors
❌ Failed to start server
❌ Error indexing transactions
❌ Error processing transaction
```

### 📈 Success Criteria

Your indexer is working correctly when:

- ✅ Health check returns 200 OK
- ✅ `/api/tokens` returns token list
- ✅ `/api/tokens/trending` shows volume-based ranking
- ✅ `/api/trades/recent` shows recent transactions
- ✅ Database is being updated with new trades
- ✅ Logs show successful transaction processing

### 🔄 Maintenance

#### Regular Tasks
1. Monitor database size and performance
2. Check indexer logs for errors
3. Verify trending algorithm accuracy
4. Update contract address if needed
5. Monitor API response times

#### Scaling Considerations
- Add Redis caching for trending queries
- Implement horizontal scaling with multiple indexer instances
- Add database read replicas for API queries
- Implement proper error handling and retries

### 📞 Support

If you encounter issues:
1. Check the logs for error messages
2. Verify environment variables are correct
3. Test database connectivity
4. Confirm Aptos node accessibility
5. Review contract address and event structure

The indexer is designed to be resilient and will continue processing even if some transactions fail to parse.
