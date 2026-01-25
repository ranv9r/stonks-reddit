/**
 * Moderator routes for Meme Stonks.
 * Handles stonk creation, event management, and admin controls.
 */

import { Router } from 'express';
import { context, reddit } from '@devvit/web/server';
import { STARTING_BALANCE, DEFAULT_VIRTUAL_LIQUIDITY, DEFAULT_BASE_PRICE } from '../../shared/config';
import * as redisService from '../services/redis';
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
 * POST /internal/menu/manage-stonks - Show stonk management form.
 * This endpoint triggers a form to add new stonks.
 */
router.post('/internal/menu/manage-stonks', async (_req, res) => {
    try {
        // For now, return a simple response. In production, this would show a form.
        // We'll create a stonk via the API endpoint instead.
        res.json({
            status: 'success',
            message: 'Use /api/mod/stonks to create stonks via API',
        });
    } catch (error) {
        console.error('[Manage Stonks] Error:', error);
        res.status(400).json({
            status: 'error',
            message: 'Failed to open stonk management',
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

        const { name, ticker, icon, basePrice, virtualLiquidity } = req.body;

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

        const stonk = await redisService.createStonk(
            id,
            name,
            ticker.toUpperCase(),
            icon || '📈',
            basePrice || DEFAULT_BASE_PRICE,
            virtualLiquidity || DEFAULT_VIRTUAL_LIQUIDITY,
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
 * POST /internal/triggers/on-app-install - Handle app installation.
 */
router.post('/internal/triggers/on-app-install', async (_req, res) => {
    try {
        console.log(`[Install] App installed in subreddit ${context.subredditName}`);

        // Initialize game config
        await redisService.setGameConfig({
            eventActive: false,
            tickInterval: 5000,
            startingBalance: STARTING_BALANCE,
        });

        // Create initial post
        const post = await createPost();

        res.json({
            status: 'success',
            message: `App installed. Post created with id ${post.id}`,
        });
    } catch (error) {
        console.error('[Install] Error:', error);
        res.status(400).json({
            status: 'error',
            message: 'Failed to initialize app',
        });
    }
});

export default router;
