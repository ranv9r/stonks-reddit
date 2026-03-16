/**
 * IPO API routes for Meme Stonks.
 */

import { Router } from 'express';
import { context } from '@devvit/web/server';
import * as ipoService from '../services/ipoService';
import * as redisService from '../services/redis';
import { STARTING_BALANCE, IPO_SUBSCRIPTION_COST, IPO_PROPOSAL_COOLDOWN_MS } from '../../shared/config';

const router = Router();

/**
 * GET /api/ipos - List all pending IPOs + user metadata.
 */
router.get('/api/ipos', async (_req, res) => {
    try {
        const { userId } = context;
        const [ipos, userSubscriptions] = await Promise.all([
            ipoService.getAllPendingIpos(),
            userId ? ipoService.getUserSubscriptions(userId) : Promise.resolve([]),
        ]);

        let canPropose = false;
        let nextProposalAt: number | null = null;
        let proposeDisabledReason = 'not_logged_in';

        if (userId) {
            const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
            const lastProposal = await ipoService.getLastProposalTime(userId);
            const cooldownMs = IPO_PROPOSAL_COOLDOWN_MS;
            if (lastProposal && Date.now() - lastProposal < cooldownMs) {
                nextProposalAt = lastProposal + cooldownMs;
                canPropose = false;
                proposeDisabledReason = 'cooldown';
            } else if (!user || user.walletBalance < IPO_SUBSCRIPTION_COST) {
                canPropose = false;
                proposeDisabledReason = `insufficient_balance: $${((user?.walletBalance || 0) / 100).toFixed(2)} < $${(IPO_SUBSCRIPTION_COST / 100).toFixed(0)} needed`;
            } else {
                canPropose = true;
                proposeDisabledReason = '';
            }
            console.log(`[IPO] canPropose=${canPropose}, reason=${proposeDisabledReason}, balance=$${((user?.walletBalance || 0) / 100).toFixed(2)}`);
        }

        res.json({ ipos, userSubscriptions, canPropose, nextProposalAt, proposeDisabledReason });
    } catch (error) {
        console.error('[IPO List] Error:', error);
        res.status(500).json({ error: 'Failed to fetch IPOs' });
    }
});

/**
 * GET /api/ipos/:id - Get single IPO detail.
 */
router.get('/api/ipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ipo = await ipoService.getIpo(id);
        if (!ipo) {
            res.status(404).json({ error: 'IPO not found' });
            return;
        }
        res.json({ ipo });
    } catch (error) {
        console.error('[IPO Detail] Error:', error);
        res.status(500).json({ error: 'Failed to fetch IPO' });
    }
});

/**
 * POST /api/ipos - Propose a new IPO.
 * Body: { name, ticker, icon, imageUrl }
 */
router.post('/api/ipos', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Must be logged in' });
            return;
        }

        const { name, ticker, icon, imageUrl } = req.body;
        console.log('[IPO Create] Received:', { name, ticker, icon, imageUrl });
        if (!name || !ticker) {
            res.status(400).json({ success: false, message: 'Name and ticker are required' });
            return;
        }

        const result = await ipoService.createIpo(userId, name, ticker, icon || '📈', imageUrl);
        res.json(result);
    } catch (error) {
        console.error('[IPO Create] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create IPO' });
    }
});

/**
 * POST /api/ipos/:id/subscribe - Subscribe to an IPO.
 */
router.post('/api/ipos/:id/subscribe', async (req, res) => {
    try {
        const { userId } = context;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Must be logged in' });
            return;
        }

        const { id } = req.params;
        const result = await ipoService.subscribeToIpo(userId, id);
        res.json(result);
    } catch (error) {
        console.error('[IPO Subscribe] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to subscribe to IPO' });
    }
});

export default router;
