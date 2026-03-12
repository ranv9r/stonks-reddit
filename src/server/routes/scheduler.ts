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
import * as stockTickerService from '../services/stockTickerService';
import * as flairService from '../services/flairService';
import * as ipoService from '../services/ipoService';

const router = Router();

/**
 * Price tick job - runs every 5 seconds.
 * Resolves all pending buy/sell batches, updates prices, and updates tier 1 history.
 * Broadcasts updated market data to all connected clients.
 */
router.post('/internal/scheduler/price-tick', async (_req, res) => {
    try {
        // Check game config
        const config = await redisService.getGameConfig();

        // Check for scheduled event auto-start
        if (config.eventStartTime && Date.now() >= config.eventStartTime && !config.eventActive) {
            console.log('[Scheduler] ⏰ Scheduled event time reached! Auto-starting...');

            // Auto-start event
            await redisService.setGameConfig({
                eventActive: true,
                eventLocked: false,
                eventStartTime: null // Clear the timer
            });

            // Broadcast to all clients - they should immediately unlock
            await realtime.send('market_status', {
                eventActive: true,
                eventLocked: false,
                eventStartTime: null
            });

            console.log('[Scheduler] 🏁 Event auto-started!');
            // Continue to run the price tick
        }

        // Check if market is active
        // Always check for expired IPOs, even if market is paused (so users get refunds)
        ipoService.expireStaleIpos().catch(e => console.error('[Scheduler] IPO expiry check failed:', e));

        if (!config.eventActive && !(config.eventStartTime && Date.now() >= config.eventStartTime)) {
            res.status(200).json({ status: 'skipped', reason: 'market paused' });
            return;
        }

        console.log(`[Price Tick] Starting at ${new Date().toISOString()}`);

        // Capture pre-batch prices for computing priceChangePercent
        const preBatchStonks = await redisService.getAllStonks();
        const preBatchPrices = new Map<string, number>();
        for (const s of preBatchStonks) {
            preBatchPrices.set(s.id, s.currentPrice);
        }

        // CRITICAL: Flush accumulated volumes to Redis BEFORE resolving batches
        // This ensures trades from this tick are included in the current batch resolution
        await redisService.flushPendingVolumes();

        // Step 1: Resolve all pending batches (updates prices in Redis)
        console.log(`[Price Tick] Step 1: Resolving batches...`);
        await tradingEngine.resolveBatches();
        console.log(`[Price Tick] Step 1: Batches resolved.`);

        // Step 2: AFTER batches are resolved, refresh the cache with NEW prices
        console.log(`[Price Tick] Step 2: Refreshing cache...`);
        await redisService.refreshStonkCache();
        console.log(`[Price Tick] Step 2: Cache refreshed.`);

        // Run stress test tick if active
        await stressTestService.tick();

        // Update Tier 1 for all stonks
        const stonkIds = await stockTickerService.getAllStonkIds();
        let tier1Updated = 0;
        await Promise.all(stonkIds.map(async (id) => {
            const success = await stockTickerService.updateTier1(id);
            if (success) tier1Updated++;
        }));
        console.log(`[Price Tick] Updated Tier 1 for ${tier1Updated}/${stonkIds.length} stonks`);

        // Broadcast updated market data to all clients
        const stonks = await redisService.getAllStonks();
        const payload = {
            stonks: stonks.map(s => {
                const prevPrice = preBatchPrices.get(s.id) || s.basePrice;
                const priceChangePercent = prevPrice > 0
                    ? ((s.currentPrice - prevPrice) / prevPrice) * 100
                    : 0;
                return {
                    id: s.id,
                    ticker: s.ticker,
                    icon: s.icon,
                    currentPrice: s.currentPrice,
                    priceChangePercent,
                };
            }),
            timestamp: Date.now(),
        };
        await realtime.send('global_ticker', payload);
        // Detailed log of what global_ticker is sending
        const priceLog = payload.stonks.map(s => `${s.ticker}: $${(s.currentPrice / 100).toFixed(2)}`).join(', ');
        console.log(`[Price Tick] global_ticker payload: [${priceLog}] @ ${new Date(payload.timestamp).toISOString()}`);

        console.log(`[Price Tick] Completed at ${new Date().toISOString()}`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Price Tick] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

/**
 * Ticker Tier 2 update job - runs every 30 seconds.
 * Averages 6 entries from Tier 1 and appends to Tier 2.
 */
router.post('/internal/scheduler/ticker-tier-2', async (_req, res) => {
    try {
        // Check if market is active
        const config = await redisService.getGameConfig();
        if (!config.eventActive) {
            res.status(200).json({ status: 'skipped', reason: 'market paused' });
            return;
        }

        console.log(`[Ticker Tier 2] Starting at ${new Date().toISOString()}`);
        const stonkIds = await stockTickerService.getAllStonkIds();
        let updated = 0;
        await Promise.all(stonkIds.map(async (id) => {
            const success = await stockTickerService.updateHigherTier(id, 2);
            if (success) updated++;
        }));
        console.log(`[Ticker Tier 2] Updated ${updated}/${stonkIds.length} stonks`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Ticker Tier 2] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

/**
 * Ticker Tier 3 update job - runs every 5 minutes.
 * Averages 10 entries from Tier 2 and appends to Tier 3.
 */
router.post('/internal/scheduler/ticker-tier-3', async (_req, res) => {
    try {
        // Check if market is active
        const config = await redisService.getGameConfig();
        if (!config.eventActive) {
            res.status(200).json({ status: 'skipped', reason: 'market paused' });
            return;
        }

        console.log(`[Ticker Tier 3] Starting at ${new Date().toISOString()}`);
        const stonkIds = await stockTickerService.getAllStonkIds();
        let updated = 0;
        await Promise.all(stonkIds.map(async (id) => {
            const success = await stockTickerService.updateHigherTier(id, 3);
            if (success) updated++;
        }));
        console.log(`[Ticker Tier 3] Updated ${updated}/${stonkIds.length} stonks`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Ticker Tier 3] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

/**
 * Ticker Tier 4 update job - runs every 30 minutes.
 * Averages 6 entries from Tier 3 and appends to Tier 4.
 */
router.post('/internal/scheduler/ticker-tier-4', async (_req, res) => {
    try {
        // Check if market is active
        const config = await redisService.getGameConfig();
        if (!config.eventActive) {
            res.status(200).json({ status: 'skipped', reason: 'market paused' });
            return;
        }

        console.log(`[Ticker Tier 4] Starting at ${new Date().toISOString()}`);
        const stonkIds = await stockTickerService.getAllStonkIds();
        let updated = 0;
        await Promise.all(stonkIds.map(async (id) => {
            const success = await stockTickerService.updateHigherTier(id, 4);
            if (success) updated++;
        }));
        console.log(`[Ticker Tier 4] Updated ${updated}/${stonkIds.length} stonks`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Ticker Tier 4] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

/**
 * Ticker Tier 5 update job - runs every 2 hours.
 * Averages 4 entries from Tier 4 and appends to Tier 5.
 */
router.post('/internal/scheduler/ticker-tier-5', async (_req, res) => {
    try {
        // Check if market is active
        const config = await redisService.getGameConfig();
        if (!config.eventActive) {
            res.status(200).json({ status: 'skipped', reason: 'market paused' });
            return;
        }

        console.log(`[Ticker Tier 5] Starting at ${new Date().toISOString()}`);
        const stonkIds = await stockTickerService.getAllStonkIds();
        let updated = 0;
        await Promise.all(stonkIds.map(async (id) => {
            const success = await stockTickerService.updateHigherTier(id, 5);
            if (success) updated++;
        }));
        console.log(`[Ticker Tier 5] Updated ${updated}/${stonkIds.length} stonks`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Ticker Tier 5] Error:', error);
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

        // Update user flairs based on new rankings (if enabled)
        try {
            await flairService.updateAllUserFlairs();
        } catch (flairErr) {
            console.error('[Leaderboard Update] Flair update failed:', flairErr);
        }

        // Broadcast leaderboard update notification to all clients
        await realtime.send('leaderboard_update', { timestamp: Date.now() });
        console.log(`[Leaderboard Update] Broadcast to leaderboard_update`);

        console.log(`[Leaderboard Update] Completed at ${new Date().toISOString()}`);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('[Leaderboard Update] Error:', error);
        res.status(500).json({ status: 'error', message: String(error) });
    }
});

export default router;


