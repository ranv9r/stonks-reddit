/**
 * Chat consent API routes.
 * Handles checking and setting user's consent for posting chat comments.
 */

import { Router } from 'express';
import { context } from '@devvit/web/server';
import { STARTING_BALANCE } from '../../shared/config';
import * as redisService from '../services/redis';

const router = Router();

/**
 * GET /api/chat/consent - Check if user has consented to chat posting.
 */
router.get('/api/chat/consent', async (_req, res) => {
    try {
        const { userId } = context;

        if (!userId) {
            res.json({ chatConsent: false });
            return;
        }

        const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
        res.json({ chatConsent: user.chatConsent });
    } catch (error) {
        console.error('[Chat Consent] Error checking status:', error);
        res.status(500).json({ error: 'Failed to check chat consent' });
    }
});

/**
 * POST /api/chat/consent - Accept chat consent (opt-in to posting comments).
 */
router.post('/api/chat/consent', async (_req, res) => {
    try {
        const { userId } = context;

        if (!userId) {
            res.status(401).json({ error: 'Must be logged in' });
            return;
        }

        await redisService.markChatConsent(userId);
        console.log(`[Chat Consent] User ${userId} accepted chat consent`);

        res.json({ success: true });
    } catch (error) {
        console.error('[Chat Consent] Error accepting:', error);
        res.status(500).json({ error: 'Failed to save chat consent' });
    }
});

export default router;
