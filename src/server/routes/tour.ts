/**
 * Tour API routes for guided tour functionality.
 * Handles tour status checking and completion.
 */

import { Router } from 'express';
import { context } from '@devvit/web/server';
import { STARTING_BALANCE } from '../../shared/config';
import * as redisService from '../services/redis';

const router = Router();

/**
 * GET /api/tour/status - Check if user has completed the tour.
 */
router.get('/api/tour/status', async (_req, res) => {
    try {
        const { userId } = context;
        
        // Anonymous users haven't completed tour
        if (!userId) {
            res.json({ tourCompleted: false });
            return;
        }

        const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
        res.json({ tourCompleted: user.tourCompleted });
    } catch (error) {
        console.error('[Tour Status] Error:', error);
        res.status(500).json({ error: 'Failed to fetch tour status' });
    }
});

/**
 * POST /api/tour/complete - Mark the tour as completed for the user.
 */
router.post('/api/tour/complete', async (_req, res) => {
    try {
        const { userId } = context;
        
        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        await redisService.markTourCompleted(userId);
        console.log(`[Tour] User ${userId} completed tour`);
        
        res.json({ success: true, message: 'Tour marked as completed' });
    } catch (error) {
        console.error('[Tour Complete] Error:', error);
        res.status(500).json({ error: 'Failed to mark tour as completed' });
    }
});

export default router;
