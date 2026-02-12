import { Router } from 'express';
import { context, realtime } from '@devvit/web/server';
import * as discussionThreadService from '../services/discussionThreadService';
import * as redisService from '../services/redis';
import type { ChatResponse } from '../../shared/types/stonks';

const router = Router();

/**
 * GET /api/chat/:stonkId - Get chat messages from Reddit discussion thread.
 */
router.get('/api/chat/:stonkId', async (req, res) => {
    try {
        const { stonkId } = req.params;
        
        // Fetch comments from discussion thread (returns empty array if no thread exists yet)
        const messages = await discussionThreadService.getComments(stonkId);

        const response: ChatResponse = {
            messages,
        };

        res.json(response);
    } catch (error) {
        console.error('[Chat API] Error fetching comments:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/chat - Post a message as a Reddit comment (runAs: 'USER').
 */
router.post('/api/chat', async (req, res) => {
    try {
        const { userId, username } = context;

        if (!userId || !username) {
            res.status(401).json({ error: 'Must be logged in to chat' });
            return;
        }

        const { stonkId, text } = req.body;

        if (!stonkId || !text) {
            res.status(400).json({ error: 'Missing stonkId or text' });
            return;
        }

        // Validate text
        if (!text.trim()) {
            res.status(400).json({ error: 'Message cannot be empty' });
            return;
        }

        // Get stonk to retrieve ticker
        const stonk = await redisService.getStonk(stonkId);
        if (!stonk) {
            res.status(404).json({ error: 'Stock not found' });
            return;
        }

        // Submit comment to Reddit on behalf of the user
        const message = await discussionThreadService.submitComment(
            stonkId,
            stonk.ticker,
            text,
            userId,
            username
        );

        // Broadcast to all clients for instant updates
        await realtime.send('chat', { ...message, stonkId });

        res.json(message);
    } catch (error) {
        console.error('[Chat API] Error posting comment:', error);
        
        // Check for specific error messages
        const errorMessage = error instanceof Error ? error.message : 'Failed to post message';
        
        if (errorMessage.includes('wait')) {
            // Cooldown error
            res.status(429).json({ error: errorMessage });
        } else {
            res.status(500).json({ error: errorMessage });
        }
    }
});

export default router;
