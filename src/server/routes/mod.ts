/**
 * Moderator routes for Meme Stonks.
 * Handles stonk creation, event management, and admin controls.
 */

import { Router } from 'express';
import { context } from '@devvit/web/server';
import { STARTING_BALANCE, DEFAULT_BASE_PRICE, DEFAULT_X_VIRT } from '../../shared/config';
import * as redisService from '../services/redis';
import * as stressTestService from '../services/stressTestService';
import { createPost } from '../core/post';

const router = Router();

/**
 * POST /internal/menu/create-game-post - Create a new stonks trading post.
 */
router.post('/internal/menu/create-game-post', async (_req, res) => {
    try {
        const post = await createPost();

        res.json({
            navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
        });
    } catch (error) {
        console.error('[Create Game Post] Error:', error);
        res.status(400).json({
            status: 'error',
            message: 'Failed to create game post',
        });
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
                DEFAULT_BASE_PRICE,  // $100
                DEFAULT_X_VIRT,      // $1M virtual cash
                DEFAULT_X_VIRT / DEFAULT_BASE_PRICE, // yVirt for $100 price
                'system'
            );
            console.log(`[Manage Stonks] Created/Reset: ${stock.ticker}`);
        }

        // Return toast notification format
        res.json({
            success: true,
            effects: [{
                type: 'showToast',
                text: `✅ ${testStocks.length} stocks created at $100 each!`
            }]
        });
    } catch (error) {
        console.error('[Manage Stonks] Error:', error);
        res.json({
            success: false,
            effects: [{
                type: 'showToast',
                text: '❌ Failed to create stocks'
            }]
        });
    }
});

/**
 * POST /api/mod/stonks - Create a new stonk.
 */
router.post('/api/mod/stonks', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        // TODO: Add moderator check
        // const user = await reddit.getCurrentUser();
        // if (!user?.isModerator) ...

        const { name, ticker, icon, basePrice } = req.body;

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
            targetPrice,
            xVirt,
            yVirt,
            userId
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
 * POST /internal/menu/start-event - Start a trading event.
 */
router.post('/internal/menu/start-event', async (_req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        // Set event as active
        await redisService.setGameConfig({
            eventActive: true,
            eventStartTime: Date.now(),
            startingBalance: STARTING_BALANCE,
        });

        console.log(`[Mod] Trading event started by ${userId}`);
        res.json({
            success: true,
            message: 'Trading event started! All users will receive starting balance on first interaction.'
        });
    } catch (error) {
        console.error('[Start Event] Error:', error);
        res.status(500).json({ error: 'Failed to start event' });
    }
});

/**
 * POST /internal/menu/reset-game - Reset all game data.
 * Resets all stocks to $100 with fresh liquidity.
 * Resets all user wallets to $10,000 and clears portfolios.
 * Clears the leaderboard completely.
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

        // Recreate stocks with fresh liquidity
        const testStocks = [
            { id: 'CSK', name: 'Chennai Super Kings', ticker: 'CSK', icon: '🦁' },
            { id: 'MI', name: 'Mumbai Indians', ticker: 'MI', icon: '🔵' },
            { id: 'RCB', name: 'Royal Challengers', ticker: 'RCB', icon: '🔴' },
            { id: 'KKR', name: 'Knight Riders', ticker: 'KKR', icon: '💜' },
            { id: 'DC', name: 'Delhi Capitals', ticker: 'DC', icon: '🦅' },
        ];

        for (const stock of testStocks) {
            // Delete old price history
            await redisService.deletePriceHistory(stock.id);
            
            await redisService.createStonk(
                stock.id,
                stock.name,
                stock.ticker,
                stock.icon,
                DEFAULT_BASE_PRICE,  // $100
                DEFAULT_X_VIRT,      // $1M virtual cash
                DEFAULT_X_VIRT / DEFAULT_BASE_PRICE, // yVirt for $100 price
                'system'
            );
            console.log(`[Reset] Recreated: ${stock.ticker} at $100`);
        }

        // Return toast notification
        res.json({
            success: true,
            effects: [{
                type: 'showToast',
                text: `🔄 Full reset! ${allUserIds.length} users, ${testStocks.length} stocks at $100.`
            }]
        });
    } catch (error) {
        console.error('[Reset] Error:', error);
        res.json({
            success: false,
            effects: [{
                type: 'showToast',
                text: '❌ Failed to reset game'
            }]
        });
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
                    DEFAULT_BASE_PRICE,  // $100
                    DEFAULT_X_VIRT,      // 100K virtual cash
                    DEFAULT_X_VIRT / DEFAULT_BASE_PRICE, // yVirt to achieve $100 price
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
 * POST /internal/menu/stress/start - Start stress test.
 */
router.post('/internal/menu/stress/start', async (req, res) => {
    try {
        const { bots, minutes } = req.body;
        const numBots = bots || 100;
        const duration = minutes || 5;
        await stressTestService.startStressTest(numBots, duration);
        
        res.json({
            success: true,
            effects: [{
                type: 'showToast',
                text: `🚀 Stress Test Started: ${numBots} bots for ${duration} mins.`
            }]
        });
    } catch (e) {
        console.error(e);
        res.json({
            success: false,
            effects: [{
                type: 'showToast',
                text: `❌ Error: ${String(e)}`
            }]
        });
    }
});

/**
 * POST /internal/menu/stress/stop - Stop stress test.
 */
router.post('/internal/menu/stress/stop', async (_req, res) => {
    await stressTestService.stopStressTest();
    res.json({
        success: true,
        effects: [{
            type: 'showToast',
            text: '🛑 Stress Test Stopped.'
        }]
    });
});

export default router;
