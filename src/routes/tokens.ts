import { Router } from 'express';
import { prisma } from '../index.ts';

export const tokenRoutes = Router();

// GET /api/tokens - List all tokens
tokenRoutes.get('/', async (req, res) => {
  try {
    const tokens = await prisma.fA.findMany({
      include: {
        pool_stats: true,
        _count: {
          select: { trades: true }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tokens'
    });
  }
});

// GET /api/tokens/trending - Top 10 by volume 24h
tokenRoutes.get('/trending', async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const trending = await prisma.$queryRaw`
      SELECT 
        fa.address,
        fa.name,
        fa.symbol,
        fa.creator,
        COALESCE(SUM(t.apt_amount), 0) as volume_24h,
        COUNT(t.id) as trade_count_24h,
        ps.apt_reserves,
        ps.total_volume,
        ps.is_graduated
      FROM "FA" fa
      LEFT JOIN "Trade" t ON fa.address = t.fa_address 
        AND t.created_at > ${twentyFourHoursAgo}
      LEFT JOIN "PoolStats" ps ON fa.address = ps.fa_address
      GROUP BY fa.address, fa.name, fa.symbol, fa.creator, ps.apt_reserves, ps.total_volume, ps.is_graduated
      ORDER BY volume_24h DESC
      LIMIT 10
    `;

    res.json({
      success: true,
      data: trending
    });
  } catch (error) {
    console.error('Error fetching trending tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending tokens'
    });
  }
});

// GET /api/tokens/:address - Token detail + recent trades
tokenRoutes.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    const token = await prisma.fA.findUnique({
      where: { address },
      include: {
        pool_stats: true,
        trades: {
          orderBy: { created_at: 'desc' },
          take: 50,
          select: {
            id: true,
            transaction_hash: true,
            user_address: true,
            apt_amount: true,
            token_amount: true,
            price_per_token: true,
            created_at: true
          }
        }
      }
    });

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }

    // Calculate 24h volume for this token
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const volume24h = await prisma.trade.aggregate({
      where: {
        fa_address: address,
        created_at: {
          gte: twentyFourHoursAgo
        }
      },
      _sum: {
        apt_amount: true
      },
      _count: true
    });

    res.json({
      success: true,
      data: {
        ...token,
        volume_24h: volume24h._sum.apt_amount || 0,
        trade_count_24h: volume24h._count || 0
      }
    });
  } catch (error) {
    console.error('Error fetching token details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token details'
    });
  }
});
