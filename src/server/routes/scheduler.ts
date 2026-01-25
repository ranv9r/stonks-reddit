/**
 * Scheduler job handlers for Meme Stonks.
 * Handles price tick and leaderboard update jobs.
 */

import { Router } from 'express';
import * as tradingEngine from '../services/tradingEngine';
import * as leaderboardService from '../services/leaderboardService';

const router = Router();

/**
 * Price tick job - runs every 5 seconds.
 * Resolves all pending buy/sell batches and updates prices.
 */
router.post('/internal/scheduler/price-tick', async (_req, res) => {
    try {
        console.log(`[Price Tick] Starting at ${new Date().toISOString()}`);

        await tradingEngine.resolveBatches();

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
