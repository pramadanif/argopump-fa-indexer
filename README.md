# BullPump FA Indexer

A comprehensive Aptos indexer that tracks BullPump token factory and bonding curve pool transactions.

## Features

- ✅ Index BullPump `CreateFAEvent` (token creation)
- ✅ Index BullPump `MintFAEvent` (token minting)
- ✅ Index BullPump `BurnFAEvent` (token burning)
- ✅ Index BullPump `buy_tokens` transactions (bonding curve purchases)
- ✅ Pool graduation tracking (21,500 APT threshold)
- ✅ Real-time tracking with 30-second polling
- ✅ Comprehensive event logging and data storage
- ✅ REST API for tokens and trades
- ✅ PostgreSQL database with Prisma ORM
- ✅ TypeScript + Express.js backend

## Tech Stack

- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Prisma
- **Blockchain**: Aptos SDK
- **Hosting**: Supabase (recommended)

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# - Add your Supabase PostgreSQL connection strings
# - Update BULLPUMP_CONTRACT_ADDRESS with the actual contract address
```

### 2. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Optional: Open Prisma Studio to view data
npm run db:studio
```

### 3. Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Production Build

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

## API Endpoints

### Tokens

- `GET /api/tokens` - List all tokens
- `GET /api/tokens/trending` - Top 10 tokens by 24h volume
- `GET /api/tokens/:address` - Token details with recent trades

### Trades

- `GET /api/trades/recent` - Recent 50 trades across all tokens
- `GET /api/trades/:faAddress` - Trades for specific token

### Health Check

- `GET /health` - Server health status

## Database Schema

### FA (Fungible Asset)
```sql
- address (String, Primary Key)
- name (String)
- symbol (String) 
- creator (String)
- created_at (DateTime)
```

### Trade
```sql
- id (String, Primary Key)
- transaction_hash (String, Unique)
- fa_address (String, Foreign Key)
- user_address (String)
- apt_amount (Decimal)
- token_amount (Decimal)
- price_per_token (Decimal)
- created_at (DateTime)
```

### PoolStats
```sql
- fa_address (String, Primary Key)
- apt_reserves (Decimal)
- total_volume (Decimal)
- trade_count (Int)
- is_graduated (Boolean)
- updated_at (DateTime)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `DIRECT_URL` | Direct PostgreSQL connection | Required |
| `APTOS_NODE_URL` | Aptos fullnode endpoint | `https://fullnode.mainnet.aptoslabs.com/v1` |
| `BULLPUMP_CONTRACT_ADDRESS` | BullPump contract address | `0x4660906d4ed4062029a19e989e51c814aa5b0711ef0ba0433b5f7487cb03b257` |
| `PORT` | Server port | `3000` |

### Important Notes

1. **Contract Address**: The indexer is configured to track contract `0x4660906d4ed4062029a19e989e51c814aa5b0711ef0ba0433b5f7487cb03b257` with modules:
   - `BullPump::token_factory` - for FA creation, minting, and burning
   - `BullPump::bonding_curve_pool` - for token purchases via bonding curve

2. **Event Parsing**: The indexer tracks specific BullPump events:
   - `CreateFAEvent` - when new tokens are created
   - `MintFAEvent` - when tokens are minted
   - `BurnFAEvent` - when tokens are burned
   - `buy_tokens` function calls - when users purchase tokens

3. **Polling Interval**: Currently set to 30 seconds for more responsive tracking.

4. **Pool Graduation**: Automatically tracks when pools reach the 21,500 APT graduation threshold.

## Deployment

### Supabase Deployment

1. Create a new Supabase project
2. Get your PostgreSQL connection strings from Supabase dashboard
3. Update `.env` with Supabase credentials
4. Deploy using your preferred method (Vercel, Railway, etc.)

### Manual Deployment

1. Set up PostgreSQL database
2. Configure environment variables
3. Run `npm run build`
4. Start with `npm start`

## Development

### Project Structure

```
src/
├── index.ts              # Main server entry point
├── routes/
│   ├── tokens.ts         # Token API endpoints
│   └── trades.ts         # Trade API endpoints
├── services/
│   └── indexer.ts        # Core indexing logic
└── types/
    └── index.ts          # TypeScript type definitions
```

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run test:setup` - Test database and Aptos connectivity
- `npm run test:bullpump` - Test BullPump indexer for 60 seconds

## Monitoring

The indexer logs important events:

- ✅ Successful operations
- ⚠️ Warnings and retries
- ❌ Errors and failures
- 📍 Processing status
- 💰 Trade processing
- 🪙 New token discovery

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check your `DATABASE_URL` and network connectivity
2. **Missing Trades**: Verify `BULLPUMP_CONTRACT_ADDRESS` is correct
3. **Parsing Errors**: Update event parsing logic for actual contract events
4. **Performance**: Adjust polling interval or add database indexes

### Logs

Check console output for detailed error messages and processing status.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License
