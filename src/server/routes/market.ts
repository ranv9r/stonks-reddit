/**
 * Market API routes for Meme Stonks.
 * Handles market data, stonk details, and trading.
 */

import { Router } from 'express';
import { context } from '@devvit/web/server';
import { STARTING_BALANCE } from '../../shared/config';
import type {
    MarketResponse,
    StonkDetailResponse,
    TradeRequest,
    TradeResponse,
    PortfolioDisplay,
    StonkDisplay
} from '../../shared/types/stonks';
import * as redisService from '../services/redis';
import * as tradingEngine from '../services/tradingEngine';
import * as leaderboardService from '../services/leaderboardService';

const router = Router();

/**
 * GET /api/market - Get all stonks and user wallet balance.
 */
router.get('/api/config', async (_req, res) => {
    try {
        const { subredditName } = context;
        res.json({ subredditName: subredditName || 'Stonks' });
    } catch (error) {
        console.error('[Config API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

router.get('/api/market', async (_req, res) => {
    try {
        const { userId } = context;

        // Get all stonks
        const stonks = await redisService.getAllStonks();

        // Get user data
        const user = userId
            ? await redisService.getOrCreateUser(userId, STARTING_BALANCE)
            : null;

        // Get price history to calculate change
        const stonkDisplays: StonkDisplay[] = await Promise.all(
            stonks.map(async (stonk) => {
                const history = await redisService.getPriceHistory(stonk.id, 2);
                const previousPrice = history.length > 1 && history[0] ? history[0].p : stonk.basePrice;
                const priceChange = stonk.currentPrice - previousPrice;
                const priceChangePercent = previousPrice > 0
                    ? ((priceChange / previousPrice) * 100)
                    : 0;

                return {
                    id: stonk.id,
                    name: stonk.name,
                    ticker: stonk.ticker,
                    icon: stonk.icon,
                    currentPrice: stonk.currentPrice,
                    priceChange,
                    priceChangePercent,
                };
            })
        );

        const response: MarketResponse = {
            stonks: stonkDisplays,
            walletBalance: user?.walletBalance ?? 0,
            lastUpdate: Date.now(),
        };

        res.json(response);
    } catch (error) {
        console.error('[Market API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

/**
 * GET /api/stonk/:id - Get stonk details with price history.
 */
router.get('/api/stonk/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = context;

        const stonk = await redisService.getStonk(id);
        if (!stonk) {
            res.status(404).json({ error: 'Stonk not found' });
            return;
        }

        const priceHistory = await redisService.getPriceHistory(id, 100);

        // Get user's holding and spend limit if logged in
        let userHolding = null;
        let spendLimit = { allowed: true, remaining: 1000000, spent: 0 };

        if (userId) {
            const user = await redisService.getUser(userId);
            userHolding = user?.portfolio[id] || null;
            spendLimit = await tradingEngine.getUserSpendLimit(userId, id);
        }

        const response: StonkDetailResponse = {
            stonk,
            priceHistory,
            userHolding,
            spendLimit,
        };

        res.json(response);
    } catch (error) {
        console.error('[Stonk Detail API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch stonk details' });
    }
});

/**
 * POST /api/trade - Execute a buy or sell order.
 */
router.post('/api/trade', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Must be logged in to trade' });
            return;
        }

        const { stonkId, action, amount } = req.body as TradeRequest;

        // Validate input
        if (!stonkId || !action || !amount || amount <= 0) {
            res.status(400).json({
                success: false,
                message: 'Invalid trade request'
            });
            return;
        }

        let result: TradeResponse;

        if (action === 'buy') {
            result = await tradingEngine.executeBuy(userId, stonkId, amount, STARTING_BALANCE);
        } else if (action === 'sell') {
            result = await tradingEngine.executeSell(userId, stonkId, amount, STARTING_BALANCE);
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "buy" or "sell"'
            });
            return;
        }

        // Register user on leaderboard after first trade
        if (result.success) {
            await leaderboardService.registerUserOnLeaderboard(userId);
        }

        res.json(result);
    } catch (error) {
        console.error('[Trade API] Error:', error);
        res.status(500).json({ success: false, message: 'Trade failed' });
    }
});

/**
 * GET /api/portfolio - Get user's portfolio with holdings.
 */
router.get('/api/portfolio', async (_req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
        const { totalValue, holdings } = await tradingEngine.calculatePortfolioValue(
            userId,
            STARTING_BALANCE
        );

        // Calculate cost basis
        let totalCostBasis = 0;
        for (const holding of Object.values(user.portfolio)) {
            totalCostBasis += holding.qty * holding.avgPrice;
        }

        const totalProfitLoss = totalValue - totalCostBasis;
        const totalProfitLossPercent = totalCostBasis > 0
            ? (totalProfitLoss / totalCostBasis) * 100
            : 0;

        // Build display holdings
        const displayHoldings = await Promise.all(
            holdings.map(async (h) => {
                const stonk = await redisService.getStonk(h.stonkId);
                const holding = user.portfolio[h.stonkId];
                const costBasis = holding?.qty && holding?.avgPrice
                    ? holding.qty * holding.avgPrice
                    : 0;

                return {
                    stonkId: h.stonkId,
                    ticker: stonk?.ticker || h.stonkId,
                    icon: stonk?.icon || '📈',
                    quantity: h.quantity,
                    avgBuyPrice: holding?.avgPrice || 0,
                    currentPrice: stonk?.currentPrice || 0,
                    currentValue: h.currentValue,
                    profitLoss: h.profitLoss,
                    profitLossPercent: costBasis > 0 ? (h.profitLoss / costBasis) * 100 : 0,
                };
            })
        );

        const response: PortfolioDisplay = {
            walletBalance: user.walletBalance,
            totalValue,
            totalProfitLoss,
            totalProfitLossPercent,
            holdings: displayHoldings,
        };

        res.json(response);
    } catch (error) {
        console.error('[Portfolio API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
});

/**
 * GET /api/wallet - Get user's wallet balance.
 */
router.get('/api/wallet', async (_req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
        res.json({ balance: user.walletBalance });
    } catch (error) {
        console.error('[Wallet API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

/**
 * GET /api/leaderboard - Get top traders leaderboard.
 */
router.get('/api/leaderboard', async (_req, res) => {
    try {
        const { userId } = context;
        const leaderboard = await leaderboardService.getLeaderboard(userId || null);
        res.json(leaderboard);
    } catch (error) {
        console.error('[Leaderboard API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

export default router;
