import { Router } from 'express';
import { prisma } from '../index.ts';

export const tradeRoutes = Router();

// GET /api/trades/recent - Recent 50 trades across all tokens
tradeRoutes.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const trades = await prisma.trade.findMany({
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: {
        fa: {
          select: {
            name: true,
            symbol: true
          }
        }
      }
    });

    const totalTrades = await prisma.trade.count();

    res.json({
      success: true,
      data: {
        trades,
        pagination: {
          total: totalTrades,
          limit,
          offset,
          hasMore: offset + limit < totalTrades
        }
      }
    });
  } catch (error) {
    console.error('Error fetching recent trades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent trades'
    });
  }
});

// GET /api/trades/:faAddress - Trades for specific token
tradeRoutes.get('/:faAddress', async (req, res) => {
  try {
    const { faAddress } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const trades = await prisma.trade.findMany({
      where: { fa_address: faAddress },
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: {
        fa: {
          select: {
            name: true,
            symbol: true
          }
        }
      }
    });

    const totalTrades = await prisma.trade.count({
      where: { fa_address: faAddress }
    });

    res.json({
      success: true,
      data: {
        trades,
        pagination: {
          total: totalTrades,
          limit,
          offset,
          hasMore: offset + limit < totalTrades
        }
      }
    });
  } catch (error) {
    console.error('Error fetching trades for token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trades for token'
    });
  }
});
