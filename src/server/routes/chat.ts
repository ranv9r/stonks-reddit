import { Router } from 'express';
import { context, realtime } from '@devvit/web/server';
import * as chatService from '../services/chatService';
import type { ChatResponse } from '../../shared/types/stonks';

const router = Router();

/**
 * GET /api/chat/:stonkId - Get chat messages.
 */
router.get('/api/chat/:stonkId', async (req, res) => {
    try {
        const { stonkId } = req.params;
        const messages = await chatService.getMessages(stonkId);

        const response: ChatResponse = {
            messages,
        };

        res.json(response);
    } catch (error) {
        console.error('[Chat API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/chat - Post a message.
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

        const message = await chatService.addMessage(
            stonkId,
            { id: userId, username },
            text
        );

        // Broadcast to all clients
        await realtime.send('chat', { ...message, stonkId });

        res.json(message);
    } catch (error) {
        console.error('[Chat API] Error:', error);
        res.status(500).json({ error: 'Failed to post message' });
    }
});

export default router;
