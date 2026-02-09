/**
 * Moderator routes for Meme Stonks.
 * Handles stonk creation, event management, and admin controls.
 */

import { Router } from 'express';
import { context, reddit, realtime } from '@devvit/web/server';
import { STARTING_BALANCE, DEFAULT_BASE_PRICE, DEFAULT_X_VIRT } from '../../shared/config';
import * as redisService from '../services/redis';
import * as stressTestService from '../services/stressTestService';
import { createPost } from '../core/post';

const router = Router();

/**
 * Helper function to check if the current user is a moderator.
 */
async function isCurrentUserModerator(): Promise<boolean> {
    const { userId, subredditName } = context;
    if (!userId || !subredditName) return false;

    try {
        const mods = await reddit.getModerators({ subredditName }).all();
        return mods.some(mod => mod.id === userId);
    } catch (error) {
        console.error('[Mod Check] Error checking moderator status:', error);
        return false;
    }
}

/**
 * GET /api/mod/check - Check if current user is a moderator.
 */
router.get('/api/mod/check', async (_req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.json({ isModerator: false });
            return;
        }

        const isMod = await isCurrentUserModerator();
        res.json({ isModerator: isMod });
    } catch (error) {
        console.error('[Mod Check] Error:', error);
        res.json({ isModerator: false });
    }
});

/**
 * POST /internal/menu/create-game-post - Create a new stonks trading post.
 */
router.post('/internal/menu/create-game-post', async (_req, res) => {
    try {
        const post = await createPost();
        console.log(`[Create Game Post] Success! Post ID: ${post.id}`);
        res.json({
            navigateTo: {
                url: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
            },
        });
    } catch (error) {
        console.error('[Create Game Post] Error:', error);
        res.status(500).json({});
    }
});

/**
 * POST /internal/menu/manage-stonks - Seed test stocks.
 * This creates/resets the IPL team test stocks for trading.
 */
router.post('/internal/menu/manage-stonks', async (_req, res) => {
    try {
        // Seed test stocks (IPL Teams) - always recreate
        const testStocks = [
            { id: 'CSK', name: 'Chennai Super Kings', ticker: 'CSK', icon: '🦁' },
            { id: 'MI', name: 'Mumbai Indians', ticker: 'MI', icon: '🔵' },
            { id: 'RCB', name: 'Royal Challengers', ticker: 'RCB', icon: '🔴' },
            { id: 'KKR', name: 'Knight Riders', ticker: 'KKR', icon: '💜' },
            { id: 'DC', name: 'Delhi Capitals', ticker: 'DC', icon: '🦅' },
        ];

        for (const stock of testStocks) {
            await redisService.createStonk(
                stock.id,
                stock.name,
                stock.ticker,
                stock.icon,
                DEFAULT_X_VIRT,      // xVirt: $1M virtual cash
                DEFAULT_X_VIRT / DEFAULT_BASE_PRICE, // yVirt for $100 price
                'system'
            );
            console.log(`[Manage Stonks] Created/Reset: ${stock.ticker}`);
        }

        console.log(`[Manage Stonks] ✅ ${testStocks.length} stocks created at $100 each!`);
        res.json({});
    } catch (error) {
        console.error('[Manage Stonks] ❌ Error:', error);
        res.status(500).json({});
    }
});

/**
 * POST /api/mod/stonks - Create a new stonk. (Frontend API - Keep JSON structure)
 */
router.post('/api/mod/stonks', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        // Check if user is a moderator
        const isMod = await isCurrentUserModerator();
        if (!isMod) {
            res.status(403).json({ error: 'Must be a moderator' });
            return;
        }

        const { name, ticker, icon, basePrice, imageUrl } = req.body;

        // Validate input
        if (!name || !ticker) {
            res.status(400).json({ error: 'Name and ticker are required' });
            return;
        }

        // Generate stonk ID from ticker
        const id = ticker.toUpperCase();

        // Check if stonk already exists
        const existing = await redisService.getStonk(id);
        if (existing) {
            res.status(400).json({ error: 'Stonk with this ticker already exists' });
            return;
        }

        // Calculate xVirt and yVirt to achieve requested base price
        const targetPrice = basePrice || DEFAULT_BASE_PRICE;
        const xVirt = DEFAULT_X_VIRT;
        const yVirt = xVirt / targetPrice; // Adjust yVirt to achieve target price

        const stonk = await redisService.createStonk(
            id,
            name,
            ticker.toUpperCase(),
            icon || '📈',
            xVirt,
            yVirt,
            userId,
            imageUrl
        );

        console.log(`[Mod] Created stonk: ${stonk.ticker} by ${userId}`);
        res.json({ success: true, stonk });
    } catch (error) {
        console.error('[Create Stonk] Error:', error);
        res.status(500).json({ error: 'Failed to create stonk' });
    }
});

/**
 * GET /api/mod/stonks - List all stonks (including inactive).
 */
router.get('/api/mod/stonks', async (_req, res) => {
    try {
        const stonks = await redisService.getAllStonks();
        res.json({ stonks });
    } catch (error) {
        console.error('[List Stonks] Error:', error);
        res.status(500).json({ error: 'Failed to list stonks' });
    }
});

/**
 * PUT /api/mod/stonks/:id - Update a stonk.
 */
router.put('/api/mod/stonks/:id', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const isMod = await isCurrentUserModerator();
        if (!isMod) {
            res.status(403).json({ error: 'Must be a moderator' });
            return;
        }

        const { id } = req.params;
        const { name, icon, imageUrl } = req.body;

        const stonk = await redisService.updateStonk(id, { name, icon, imageUrl });
        if (!stonk) {
            res.status(404).json({ error: 'Stonk not found' });
            return;
        }

        console.log(`[Mod] Updated stonk: ${id} by ${userId}`);
        res.json({ success: true, stonk });
    } catch (error) {
        console.error('[Update Stonk] Error:', error);
        res.status(500).json({ error: 'Failed to update stonk' });
    }
});

/**
 * DELETE /api/mod/stonks/:id - Delete a stonk.
 */
router.delete('/api/mod/stonks/:id', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const isMod = await isCurrentUserModerator();
        if (!isMod) {
            res.status(403).json({ error: 'Must be a moderator' });
            return;
        }

        const { id } = req.params;
        console.log(`[Mod] Received delete request for ID: "${id}"`);

        const stonk = await redisService.getStonk(id);
        if (!stonk) {
            res.status(404).json({ error: 'Stonk not found' });
            return;
        }

        // Liquidation Logic: Refund all holders at current price
        let refundCount = 0;
        let totalRefunded = 0;
        let liquidationError = null;

        try {
            const currentPrice = stonk.currentPrice;
            const allUserIds = await redisService.getAllUserIds();

            console.log(`[Delete Stonk] Liquidation starting for ${stonk.ticker} ($${currentPrice}) - ${allUserIds.length} users`);

            if (allUserIds.length > 0) {
                // Process users in larger batches to avoid timeout
                const BATCH_SIZE = 50;
                for (let i = 0; i < allUserIds.length; i += BATCH_SIZE) {
                    const batch = allUserIds.slice(i, i + BATCH_SIZE);
                    console.log(`[Delete Stonk] Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(allUserIds.length / BATCH_SIZE)}`);

                    await Promise.all(batch.map(async (uid) => {
                        try {
                            const user = await redisService.getUser(uid);
                            // Only proceed if user has the stock in portfolio
                            if (user && user.portfolio && user.portfolio[id]) {
                                const holding = user.portfolio[id];
                                if (holding.qty > 0) {
                                    const refundAmount = Math.round(holding.qty * currentPrice);

                                    if (refundAmount > 0) {
                                        // Update wallet
                                        await redisService.updateWalletBalance(uid, refundAmount);

                                        // Remove from portfolio
                                        const newPortfolio = { ...user.portfolio };
                                        delete newPortfolio[id];
                                        await redisService.updatePortfolio(uid, newPortfolio);

                                        refundCount++;
                                        totalRefunded += refundAmount;
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`[Delete Stonk] Error processing user ${uid}:`, err);
                        }
                    }));
                }
            } else {
                console.warn('[Delete Stonk] No users found in leaderboard to check for holdings.');
            }
        } catch (liqErr) {
            console.error('[Delete Stonk] Liquidation failed (critical):', liqErr);
            liquidationError = String(liqErr);
        }

        console.log(`[Delete Stonk] Liquidation finished. Refunded: ${refundCount}`);

        // Proceed with deletion immediately after liquidation attempt
        try {
            const deleted = await redisService.deleteStonk(id);
            if (!deleted) {
                throw new Error('redisService.deleteStonk returned false');
            }
        } catch (delErr) {
            console.error('[Delete Stonk] Delete operation failed:', delErr);
            res.status(500).json({ error: 'Failed to delete data. Liquidation status: ' + (liquidationError ? 'Errors' : 'OK') });
            return;
        }

        let message = `Deleted ${stonk.ticker}. Liquidated ${refundCount} holdings for $${(totalRefunded / 100).toFixed(2)}.`;
        if (liquidationError) {
            message += ` (Warning: Liquidation had errors: ${liquidationError})`;
        }

        res.json({ success: true, message });
    } catch (error) {
        console.error('[Delete Stonk] Error:', error);
        res.status(500).json({ error: 'Failed to delete stonk' });
    }
});

/**
 * POST /api/mod/reset-game - Reset game data (API version for client).
 */
router.post('/api/mod/reset-game', async (_req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const isMod = await isCurrentUserModerator();
        if (!isMod) {
            res.status(403).json({ error: 'Must be a moderator' });
            return;
        }

        console.log(`[Reset] Game reset initiated by ${userId}`);

        // Get all users from leaderboard and reset them
        const allUserIds = await redisService.getAllUserIds();
        for (const uid of allUserIds) {
            await redisService.resetUser(uid, STARTING_BALANCE);
            await redisService.updateLeaderboardScore(uid, STARTING_BALANCE);
        }
        console.log(`[Reset] Reset ${allUserIds.length} users to $${STARTING_BALANCE / 100}`);

        // Reset all stocks to base price
        const stonks = await redisService.getAllStonks();
        for (const stock of stonks) {
            await redisService.deletePriceHistory(stock.id);
            await redisService.createStonk(
                stock.id,
                stock.name,
                stock.ticker,
                stock.icon,
                DEFAULT_X_VIRT,
                DEFAULT_X_VIRT / DEFAULT_BASE_PRICE,
                'system',
                stock.imageUrl
            );
        }

        res.json({
            success: true,
            message: `Reset ${allUserIds.length} users and ${stonks.length} stocks.`
        });
    } catch (error) {
        console.error('[Reset] Error:', error);
        res.status(500).json({ error: 'Failed to reset game' });
    }
});

/**
 * POST /internal/menu/start-event - Start a trading event.
 */
router.post('/internal/menu/start-event', async (_req, res) => {
    try {
        const { userId } = context;

        // Initialize game config
        await redisService.setGameConfig({
            eventActive: true,
            tickInterval: 5000,
            startingBalance: STARTING_BALANCE,
            eventStartTime: Date.now(),
        });

        // Broadcast market status
        await realtime.send('market_status', { eventActive: true });

        console.log(`[Start Event] 🏁 Event started by ${userId}`);
        res.json({ showToast: { text: '🏁 Trading Event Started!' } });
    } catch (error) {
        console.error('[Start Event] ❌ Error:', error);
        res.status(500).json({});
    }
});

/**
 * POST /internal/menu/stop-event - Pause trading event.
 */
router.post('/internal/menu/stop-event', async (_req, res) => {
    try {
        await redisService.setGameConfig({ eventActive: false });

        // Broadcast market status
        await realtime.send('market_status', { eventActive: false });

        console.log('[Stop Event] 🛑 Event paused by moderator');
        res.json({ showToast: { text: '🛑 Trading Paused' } });
    } catch (error) {
        console.error('[Stop Event] ❌ Error:', error);
        res.status(500).json({});
    }
});

/**
 * POST /internal/menu/reset-game - Reset all game data.
 */
router.post('/internal/menu/reset-game', async (_req, res) => {
    try {
        const { userId } = context;
        console.log(`[Reset] Game reset initiated by ${userId}`);

        // Get all users from leaderboard and reset them
        const allUserIds = await redisService.getAllUserIds();
        for (const uid of allUserIds) {
            // Reset wallet to $10,000 and clear portfolio
            await redisService.resetUser(uid, STARTING_BALANCE);
            // Reset leaderboard score to starting balance
            await redisService.updateLeaderboardScore(uid, STARTING_BALANCE);
        }
        console.log(`[Reset] Reset ${allUserIds.length} users to $${STARTING_BALANCE / 100}`);

        // Reset all existing stocks to base price (no longer recreates default stocks)
        const stonks = await redisService.getAllStonks();
        for (const stock of stonks) {
            await redisService.deletePriceHistory(stock.id);
            await redisService.createStonk(
                stock.id,
                stock.name,
                stock.ticker,
                stock.icon,
                DEFAULT_X_VIRT,
                DEFAULT_X_VIRT / DEFAULT_BASE_PRICE,
                'system',
                stock.imageUrl
            );
        }

        console.log(`[Reset] ✅ Full reset! ${allUserIds.length} users, ${stonks.length} stocks at $100.`);

        // AUTO-PAUSE MARKET ON RESET
        await redisService.setGameConfig({ eventActive: false });
        console.log('[Reset] Market auto-paused.');

        res.json({});
    } catch (error) {
        console.error('[Reset] ❌ Error:', error);
        res.status(500).json({});
    }
});

/**
 * POST /internal/triggers/on-app-install - Handle app installation.
 */
router.post('/internal/triggers/on-app-install', async (_req, res) => {
    try {
        console.log(`[Install] App installed in subreddit ${context.subredditName}`);

        // Initialize game config
        await redisService.setGameConfig({
            eventActive: true, // Start active so users can trade immediately
            tickInterval: 5000,
            startingBalance: STARTING_BALANCE,
            eventStartTime: Date.now(),
        });

        // Seed test stocks (IPL Teams)
        const testStocks = [
            { id: 'CSK', name: 'Chennai Super Kings', ticker: 'CSK', icon: '🦁' },
            { id: 'MI', name: 'Mumbai Indians', ticker: 'MI', icon: '🔵' },
            { id: 'RCB', name: 'Royal Challengers', ticker: 'RCB', icon: '🔴' },
            { id: 'KKR', name: 'Knight Riders', ticker: 'KKR', icon: '💜' },
            { id: 'DC', name: 'Delhi Capitals', ticker: 'DC', icon: '🦅' },
        ];

        for (const stock of testStocks) {
            const existing = await redisService.getStonk(stock.id);
            if (!existing) {
                await redisService.createStonk(
                    stock.id,
                    stock.name,
                    stock.ticker,
                    stock.icon,
                    DEFAULT_X_VIRT,      // xVirt: $1M virtual cash
                    DEFAULT_X_VIRT / DEFAULT_BASE_PRICE, // yVirt for $100 price
                    'system'
                );
                console.log(`[Install] Created test stock: ${stock.ticker}`);
            }
        }

        // Create initial post
        const post = await createPost();

        res.json({
            status: 'success',
            message: `App installed. Post created with id ${post.id}. 5 test stocks created.`,
        });
    } catch (error) {
        console.error('[Install] Error:', error);
        res.status(400).json({
            status: 'error',
            message: 'Failed to initialize app',
        });
    }
});

/**
 * POST /internal/menu/stress/start - Show stress test configuration form.
 */
router.post('/internal/menu/stress/start', async (_req, res) => {
    res.json({
        showForm: {
            name: 'stressTestForm',
            form: {
                title: '⚡ Configure Stress Test',
                fields: [
                    {
                        type: 'select',
                        name: 'mode',
                        label: 'Rally Mode',
                        options: [
                            { label: '🐂 Bull Rally (90% Buy)', value: 'bull' },
                            { label: '🐻 Bear Rally (90% Sell)', value: 'bear' },
                            { label: '⚖️ Neutral (50/50)', value: 'neutral' }
                        ],
                        defaultValue: ['bull']
                    },
                    { type: 'number', name: 'tps', label: 'Trades Per Second (TPS)', defaultValue: 50 },
                    { type: 'number', name: 'concurrent', label: 'Max Concurrent Trades', defaultValue: 10 },
                    { type: 'number', name: 'seconds', label: 'Duration (Seconds)', defaultValue: 20 },
                    { type: 'number', name: 'amountPerTrade', label: 'Fixed $ per Trade', defaultValue: 100 }
                ]
            }
        }
    });
});

/**
 * POST /internal/forms/stress-test - Handle stress test form submission.
 * Now with rate limiting: tradesPerSecond and maxConcurrent.
 */
router.post('/internal/forms/stress-test', async (req, res) => {
    try {
        const values = req.body.values || req.body;
        const mode = (Array.isArray(values.mode) ? values.mode[0] : values.mode) || 'neutral';

        // Rate-limiting params (no upper limits - user can stress test as hard as they want)
        const tradesPerSecond = Math.max(Number(values.tps) || 50, 1);
        const maxConcurrent = Math.max(Number(values.concurrent) || 10, 1);
        const durationSeconds = Math.max(Number(values.seconds) || 20, 1);
        const amountPerTrade = Math.max(Number(values.amountPerTrade) || 100, 1) * 100; // cents

        // Get all stonks for price prediction
        const stonks = await redisService.getAllStonks();

        // Calculate predicted price for each stonk using AMM formula
        const predictions: { ticker: string; predicted: number }[] = [];
        const totalTicks = Math.ceil(durationSeconds / 5); // 5-second ticks
        const tradesPerTick = tradesPerSecond * 5;
        const totalTrades = totalTicks * tradesPerTick;
        const buyRatio = mode === 'bull' ? 0.9 : mode === 'bear' ? 0.1 : 0.5;

        for (const s of stonks) {
            const totalBuyCash = totalTrades * buyRatio * amountPerTrade;
            const totalSellShares = totalTrades * (1 - buyRatio) * (amountPerTrade / s.currentPrice);
            const currentK = (s.xVirt + (s.xReal || 0)) * (s.yVirt + (s.yReal || 0));
            const netCashInflux = totalBuyCash - (totalSellShares * s.currentPrice);
            const newXReal = (s.xReal || 0) + netCashInflux;
            const newYReal = currentK / (s.xVirt + newXReal) - s.yVirt;
            const predictedPrice = (s.xVirt + newXReal) / (s.yVirt + Math.max(newYReal, 0.01));

            predictions.push({
                ticker: s.ticker,
                predicted: Math.round(predictedPrice) / 100
            });
        }

        // Start the stress test with seconds-based duration
        await stressTestService.startStressTest(
            tradesPerSecond,
            maxConcurrent,
            durationSeconds,
            mode,
            amountPerTrade
        );

        const predictionStr = predictions.map(p => `${p.ticker}: $${p.predicted.toFixed(2)}`).join(', ');

        console.log(`[Stress] ✅ Started: ${tradesPerSecond} TPS, max ${maxConcurrent} concurrent, ${durationSeconds}s, mode=${mode}`);
        console.log(`[Stress] 📊 Predicted prices: ${predictionStr}`);

        res.json({
            showToast: {
                text: `🧪 Test started! Predicted: ${predictionStr}`
            }
        });
    } catch (e) {
        console.error('[Stress] ❌ Form handler error:', e);
        res.status(500).json({
            showToast: { text: '❌ Failed to start stress test' }
        });
    }
});

/**
 * POST /internal/menu/stress/stop - Stop stress test.
 */
router.post('/internal/menu/stress/stop', async (_req, res) => {
    await stressTestService.stopStressTest();
    console.log('[Stress] ✅ Stress Test Stopped.');
    res.json({
        showToast: { text: '🛑 Stress Test Stopped' }
    });
});

// ============================================
// FLAIR MANAGEMENT
// ============================================

/**
 * GET /api/mod/flair-status - Get current flair enabled status.
 */
router.get('/api/mod/flair-status', async (_req, res) => {
    try {
        const config = await redisService.getGameConfig();
        res.json({ flairsEnabled: config.flairsEnabled });
    } catch (error) {
        console.error('[Flair Status] Error:', error);
        res.status(500).json({ error: 'Failed to get flair status' });
    }
});

/**
 * POST /api/mod/toggle-flairs - Toggle flairs enabled/disabled.
 */
router.post('/api/mod/toggle-flairs', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const isMod = await isCurrentUserModerator();
        if (!isMod) {
            res.status(403).json({ error: 'Moderator access required' });
            return;
        }

        const { enabled } = req.body;
        await redisService.setGameConfig({ flairsEnabled: enabled });
        console.log(`[Flair] Flairs ${enabled ? 'enabled' : 'disabled'} by ${userId}`);
        res.json({ success: true, flairsEnabled: enabled });
    } catch (error) {
        console.error('[Toggle Flairs] Error:', error);
        res.status(500).json({ error: 'Failed to toggle flairs' });
    }
});

/**
 * POST /api/mod/update-flairs - Manually trigger flair update.
 */
router.post('/api/mod/update-flairs', async (_req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        const isMod = await isCurrentUserModerator();
        if (!isMod) {
            res.status(403).json({ error: 'Moderator access required' });
            return;
        }

        // Import and run flair service
        const flairService = await import('../services/flairService');
        await flairService.updateAllUserFlairs();

        console.log(`[Flair] Manual update triggered by ${userId}`);
        res.json({ success: true, message: 'Flair update triggered' });
    } catch (error) {
        console.error('[Update Flairs] Error:', error);
        res.status(500).json({ error: 'Failed to update flairs' });
    }
});

export default router;

