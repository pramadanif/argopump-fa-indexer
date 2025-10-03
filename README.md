# 🚀 ArgoPump - Bonding Curve Token Launchpad on Aptos

<div align="center">

![ArgoPump Banner](https://i.pinimg.com/736x/8f/d5/b9/8fd5b957fcce04f15127e7b363254ee8.jpg)

**The Ultimate Bonding Curve Token Launchpad on Aptos Blockchain**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Aptos](https://img.shields.io/badge/Aptos-Testnet-green)](https://aptoslabs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Smart Contract](#-smart-contract)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Smart Contract Integration](#-smart-contract-integration)
- [Real-Time Indexer](#-real-time-indexer)
- [DEX Integration](#-dex-integration)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**ArgoPump** is a cutting-edge token launchpad built on the Aptos blockchain, featuring an innovative bonding curve mechanism for fair token distribution and price discovery. The platform enables creators to launch tokens instantly while providing traders with a seamless, low-slippage trading experience.

### Why ArgoPump?

- **🔄 Bonding Curve Mechanism** - Fair price discovery through XYK (x*y=k) automated market maker formula
- **⚡ Real-Time Trading** - Sub-second transaction confirmation with instant UI updates
- **🎓 Graduation System** - Automatic migration to DEX pools when reaching 21,500 APT threshold
- **📊 Advanced Analytics** - Comprehensive token metrics, trading volume, and pool statistics
- **🔗 Blockchain-First** - Direct smart contract integration with no intermediaries

---

## 📃 Smart Contract

For the Smart Contract Details go here: [Link](https://github.com/HusseinHato/argopump)

---

## 🚀 Key Features

- ✅ Index `CreateFAEvent` (token creation)
- ✅ Index `MintFAEvent` (token minting)
- ✅ Index `BurnFAEvent` (token burning)
- ✅ Index `buy_tokens` transactions (bonding curve purchases)
- ✅ Pool graduation tracking (21,500 APT threshold)
- ✅ Real-time tracking with 30-second polling
- ✅ Comprehensive event logging and data storage
- ✅ REST API for tokens and trades
- ✅ PostgreSQL database with Prisma ORM
- ✅ TypeScript + Express.js backend

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Blockchain**: Aptos SDK
- **Monitoring**: PM2 for process management and uptime
- **Hosting**: Cloud VM with PM2 for 24/7 uptime
- **CI/CD**: GitHub Actions
- **Containerization**: Docker

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- PM2 (for production)
- Aptos CLI (optional, for smart contract interaction)

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# - Add your PostgreSQL connection strings
# - Update ARGOPUMP_CONTRACT_ADDRESS with the actual contract address
```

### 2. Database Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Optional: Open Prisma Studio to view data
npm run db:studio
```

### 3. Development

```bash
# Start development server
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Production Deployment with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Build TypeScript
npm run build

# Start production server with PM2
pm2 start dist/index.js --name "argopump-indexer"

# Save PM2 process list for automatic startup on reboot
pm2 save
pm2 startup

# Monitor logs
pm2 logs argopump-indexer

# View process information
pm2 status
```

### 5. PM2 Management

```bash
# View all running applications
pm2 list

# Monitor logs in real-time
pm2 logs argopump-indexer

# Restart the application
pm2 restart argopump-indexer

# Stop the application
pm2 stop argopump-indexer

# Delete the application from PM2
pm2 delete argopump-indexer

# Set up PM2 to start on system boot
pm2 startup
pm2 save
```

### 6. Monitoring with PM2

PM2 provides built-in monitoring and process management:

```bash
# Monitor application metrics
pm2 monit

# View application information
pm2 show argopump-indexer

# Monitor application resources
pm2 dashboard
```

### 7. Log Management

PM2 automatically handles log rotation and management:

```bash
# View application logs
pm2 logs argopump-indexer

# Flush all logs
pm2 flush

# Set up log rotation
pm2 install pm2-logrotate
```

### 8. Auto-Restart on Crashes

PM2 will automatically restart the application if it crashes. You can configure this behavior in the PM2 ecosystem file.

### 9. Deployment to Cloud VM

For production deployment to a cloud VM (e.g., AWS EC2, Google Cloud, or DigitalOcean):

1. Set up your cloud VM with Ubuntu/Debian
2. Install Node.js, npm, and PM2
3. Clone your repository
4. Set up environment variables
5. Install dependencies and build the project
6. Start with PM2 as shown above
7. Set up Nginx/Apache as a reverse proxy (recommended)
8. Configure SSL with Let's Encrypt

## 📡 API Endpoints

### Tokens

- `GET /api/tokens` - List all tokens with pagination
- `GET /api/tokens/trending` - Top 10 tokens by 24h volume
- `GET /api/tokens/:address` - Token details with recent trades and price history
- `GET /api/tokens/search?q={query}` - Search tokens by name or symbol

### Trades

- `GET /api/trades/recent` - Recent 50 trades across all tokens
- `GET /api/trades/:faAddress` - Trades for specific token with pagination
- `GET /api/trades/user/:address` - Trades by specific user

### Analytics

- `GET /api/analytics/volume` - 24h trading volume
- `GET /api/analytics/stats` - Platform statistics
- `GET /api/analytics/leaderboard` - Top traders by volume

### Health Check

- `GET /health` - Server health status
- `GET /version` - API version information

## 🗄 Database Schema

### FA (Fungible Asset)
```prisma
model FA {
  address      String    @id
  name         String
  symbol       String
  creator      String
  decimals     Int       @default(8)
  max_supply   Decimal?
  icon_uri     String?
  project_uri  String?
  mint_fee_per_unit Decimal @default(0)
  created_at   DateTime  @default(now())
  
  trades       Trade[]
  pool_stats   PoolStats?
  events       FAEvent[]
}
```

### Trade
```prisma
model Trade {
  id               String   @id @default(cuid())
  transaction_hash String   @unique
  transaction_version String?
  
  // Basic trade info
  fa_address       String
  user_address     String
  apt_amount       Decimal  // APT paid (including fees)
  token_amount     Decimal  // Tokens received
  price_per_token  Decimal  // APT per token
  fee_amount       Decimal  @default(0) // Fee paid
  
  // Trade type
  trade_type       TradeType @default(BUY)
  
  created_at       DateTime @default(now())
  
  fa FA @relation(fields: [fa_address], references: [address])
}
```

### PoolStats
```prisma
model PoolStats {
  fa_address      String   @id
  apt_reserves    Decimal
  total_volume    Decimal  @default(0)
  trade_count     Int      @default(0)
  is_graduated    Boolean  @default(false)
  graduation_threshold Decimal @default(2150000000000) // 21500 APT in octas
  dex_pool_addr   String?  // DEX pool address after graduation (0x... 66 characters)
  
  updated_at      DateTime @updatedAt
  
  fa FA @relation(fields: [fa_address], references: [address])
}
```

### FAEvent
```prisma
model FAEvent {
  id               String   @id @default(cuid())
  transaction_hash String
  transaction_version String?
  
  fa_address       String
  event_type       EventType
  event_data       Json
  
  created_at       DateTime @default(now())
  
  fa FA @relation(fields: [fa_address], references: [address])
  
  @@index([fa_address, event_type])
  @@index([transaction_hash])
}
```

### Enums
```prisma
enum TradeType {
  BUY
  SELL
  MINT
  BURN
}

enum EventType {
  CREATE_FA
  MINT_FA  
  BURN_FA
  BUY_TOKENS
  POOL_GRADUATED
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `DIRECT_URL` | Direct PostgreSQL connection | Required |
| `APTOS_NODE_URL` | Aptos fullnode endpoint | `https://fullnode.mainnet.aptoslabs.com/v1` |
| `argopump_CONTRACT_ADDRESS` | argopump contract address | `0xf937c2d4a8ed5d30141b4911593543dd5975eab3a0e6d75105783205996e516f` |
| `PORT` | Server port | `3000` |

### Important Notes

1. **Contract Address**: The indexer is configured to track contract `0xf937c2d4a8ed5d30141b4911593543dd5975eab3a0e6d75105783205996e516f` with modules:
   - `argopump::token_factory` - for FA creation, minting, and burning
   - `argopump::bonding_curve_pool` - for token purchases via bonding curve

2. **Event Parsing**: The indexer tracks specific argopump events:
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
/argopump-fa-indexer
├── /prisma
│   └── schema.prisma         # Database schema definition
├── /src
│   ├── /routes               # API route handlers
│   │   ├── tokens.ts         # Token-related API endpoints
│   │   └── trades.ts         # Trade-related API endpoints
│   ├── /services
│   │   └── indexer.ts        # Main indexing logic and event processing
│   ├── /types                # TypeScript type definitions
│   │   └── index.ts          # Type exports
│   │
│   ├── debug-argopump.ts     # Debugging utilities
│   ├── index.ts              # Application entry point
│   ├── search-historical.ts  # Historical data processing
│   ├── test-argopump.ts      # Test script for the indexer
│   ├── test-setup.ts         # Test setup and utilities
│   ├── test-specific-tx.ts   # Transaction testing
│   └── jump-to-version.ts    # Version management
│
├── .env.example              # Example environment variables
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # Project documentation
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio
- `npm test:setup` - Test database and Aptos connectivity
- `npm test:argopump` - Test argopump indexer for 60 seconds
- `npm run debug:argopump` - Debug indexer issues
- `npm run search:historical` - Process historical transactions
- `npm run test:specific` - Test specific transactions
- `npm run jump:version` - Jump to specific blockchain version server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run test:setup` - Test database and Aptos connectivity
- `npm run test:argopump` - Test argopump indexer for 60 seconds

## Monitoring & Maintenance

{{ ... }}

PM2 provides robust process management for your Node.js applications. Here are some advanced monitoring commands:

```bash
# Show application metrics
pm2 monit
## Troubleshooting

### Common Issues

1. **Connection Errors**: Check your `DATABASE_URL` and network connectivity
2. **Missing Trades**: Verify `argopump_CONTRACT_ADDRESS` is correct
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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Made with ❤️ by the ArgoPump Team
</div> License
