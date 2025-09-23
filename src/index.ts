import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { tokenRoutes } from './routes/tokens.ts';
import { tradeRoutes } from './routes/trades.ts';
import { IndexerService } from './services/indexer.ts';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Prisma client
export const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/api/tokens', tokenRoutes);
app.use('/api/trades', tradeRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize indexer service
const indexerService = new IndexerService();

async function startServer() {
  try {
    // Connect to database
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Start the indexer
    await indexerService.start();
    console.log('✅ Indexer service started');

    // Start the server
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await indexerService.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await indexerService.stop();
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
