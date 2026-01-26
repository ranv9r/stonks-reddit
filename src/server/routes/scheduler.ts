/**
 * Scheduler job handlers for Meme Stonks.
 * Handles price tick and leaderboard update jobs.
 */

import { Router } from 'express';
import { realtime } from '@devvit/web/server';
import * as tradingEngine from '../services/tradingEngine';
import * as leaderboardService from '../services/leaderboardService';
import * as stressTestService from '../services/stressTestService';
import * as redisService from '../services/redis';

const router = Router();

/**
 * Price tick job - runs every 5 seconds.
 * Resolves all pending buy/sell batches and updates prices.
 * Broadcasts updated market data to all connected clients.
 */
router.post('/internal/scheduler/price-tick', async (_req, res) => {
    try {
        console.log(`[Price Tick] Starting at ${new Date().toISOString()}`);

        await tradingEngine.resolveBatches();

        // Run stress test tick if active
        await stressTestService.tick();

        // Broadcast updated market data to all clients
        const stonks = await redisService.getAllStonks();
        const payload = {
            stonks: stonks.map(s => ({
                id: s.id,
                ticker: s.ticker,
                icon: s.icon,
                currentPrice: s.currentPrice,
                priceChangePercent: 0, // Will be calculated on client if needed
            })),
            timestamp: Date.now(),
        };
        await realtime.send('global_ticker', payload);
        console.log(`[Price Tick] Broadcast to global_ticker`);

        console.log(`[Price Tick] Completed at ${new Date().toISOString()}`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Price Tick] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

/**
 * Leaderboard update job - runs every 30 minutes.
 * Recalculates net worth for all users and updates rankings.
 */
router.post('/internal/scheduler/leaderboard-update', async (_req, res) => {
    try {
        console.log(`[Leaderboard Update] Starting at ${new Date().toISOString()}`);

        await leaderboardService.updateLeaderboard();

        console.log(`[Leaderboard Update] Completed at ${new Date().toISOString()}`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Leaderboard Update] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

export default router;
