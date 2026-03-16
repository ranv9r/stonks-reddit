/**
 * IPO Service for Meme Stonks.
 * Handles IPO proposals, subscriptions, listing on fill, and expiry refunds.
 */

import { redis, reddit, realtime } from '@devvit/web/server';
import {
    REDIS_KEYS,
    DEFAULT_X_VIRT,
    DEFAULT_Y_VIRT,
    STARTING_BALANCE,
    IPO_POT_TARGET,
    IPO_MAX_SUBSCRIBERS,
} from '../../shared/config';
import type { IpoState, IpoStatus } from '../../shared/types/stonks';
import * as redisService from './redis';
import { createPost } from '../core/post';

// ============================================
// HELPERS
// ============================================

function parseIpo(data: Record<string, string>): IpoState | null {
    if (!data || !data.id) return null;
    return {
        id: data.id,
        name: data.name || '',
        ticker: data.ticker || '',
        icon: data.icon || '📈',
        ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
        proposedBy: data.proposedBy || '',
        proposerName: data.proposerName || 'Unknown',
        status: (data.status as IpoStatus) || 'pending',
        totalPot: parseInt(data.totalPot || '0'),
        potTarget: parseInt(data.potTarget || String(IPO_POT_TARGET)),
        subscriberCount: parseInt(data.subscriberCount || '0'),
        maxSubscribers: parseInt(data.maxSubscribers || String(IPO_MAX_SUBSCRIBERS)),
        createdAt: parseInt(data.createdAt || '0'),
        expiresAt: parseInt(data.expiresAt || '0'),
    };
}

async function getProposerName(userId: string): Promise<string> {
    try {
        const user = await reddit.getUserById(userId as `t2_${string}`);
        return user?.username || userId;
    } catch {
        return userId;
    }
}

// ============================================
// READ OPERATIONS
// ============================================

export async function getIpo(ipoId: string): Promise<IpoState | null> {
    const data = await redis.hGetAll(REDIS_KEYS.ipoState(ipoId));
    return parseIpo(data);
}

export async function getAllPendingIpos(): Promise<IpoState[]> {
    const entries = await redis.zRange(REDIS_KEYS.IPO_LIST, 0, -1, { by: 'rank' });
    if (!entries || entries.length === 0) return [];

    const ipos = await Promise.all(entries.map(e => getIpo(e.member)));
    return ipos.filter((ipo): ipo is IpoState => ipo !== null && ipo.status === 'pending');
}

export async function getUserSubscriptions(userId: string): Promise<string[]> {
    const ipos = await getAllPendingIpos();
    const results: string[] = [];

    await Promise.all(ipos.map(async (ipo) => {
        const score = await redis.zScore(REDIS_KEYS.ipoSubscribers(ipo.id), userId);
        if (score !== null && score !== undefined) {
            results.push(ipo.id);
        }
    }));

    return results;
}

export async function getLastProposalTime(userId: string): Promise<number | null> {
    const val = await redis.get(REDIS_KEYS.userLastIpoProposal(userId));
    return val ? parseInt(val) : null;
}

// ============================================
// CREATE IPO
// ============================================

export async function createIpo(
    userId: string,
    name: string,
    ticker: string,
    icon: string,
    imageUrl?: string,
): Promise<{ success: boolean; message: string; ipo?: IpoState }> {
    const tickerUpper = ticker.toUpperCase().trim();
    const config = await redisService.getIpoConfig();

    // 1. Validate ticker format
    if (!/^[A-Z]{1,5}$/.test(tickerUpper)) {
        return { success: false, message: 'Ticker must be 1-5 uppercase letters.' };
    }

    // 2. Check active market for duplicate ticker
    const existingStonk = await redisService.getStonk(tickerUpper);
    if (existingStonk && existingStonk.active) {
        return { success: false, message: `Ticker ${tickerUpper} is already listed on the market.` };
    }

    // 3. Check for duplicate pending IPO ticker
    const pendingIpos = await getAllPendingIpos();
    if (pendingIpos.some(ipo => ipo.ticker === tickerUpper)) {
        return { success: false, message: `An IPO for ${tickerUpper} is already pending.` };
    }

    // 4. Check proposal cooldown
    const lastProposal = await getLastProposalTime(userId);
    if (lastProposal && Date.now() - lastProposal < config.proposalCooldownMs) {
        const hoursLeft = Math.ceil((config.proposalCooldownMs - (Date.now() - lastProposal)) / 3600000);
        return { success: false, message: `You can only propose one IPO per day. Try again in ~${hoursLeft}h.` };
    }

    // 5. Check wallet balance — must cover non-refundable creation fee AND subscription
    const totalRequired = config.creationFee + config.subscriptionCost;
    const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
    if (!user || user.walletBalance < totalRequired) {
        const needed = (totalRequired / 100).toLocaleString();
        const has = ((user?.walletBalance ?? 0) / 100).toLocaleString();
        return { success: false, message: `Insufficient funds. You need $${needed} to propose an IPO ($${(config.creationFee / 100).toLocaleString()} creation fee + $${(config.subscriptionCost / 100).toLocaleString()} subscription). You have $${has}.` };
    }

    // 6. Create IPO record
    const now = Date.now();
    const ipoId = `ipo_${tickerUpper}_${now}`;
    const expiresAt = now + config.expiryMs;
    const proposerName = await getProposerName(userId);

    const ipo: IpoState = {
        id: ipoId,
        name: name.trim(),
        ticker: tickerUpper,
        icon: icon || '📈',
        ...(imageUrl ? { imageUrl } : {}),
        proposedBy: userId,
        proposerName,
        status: 'pending',
        totalPot: config.subscriptionCost,
        potTarget: config.potTarget,
        subscriberCount: 1,
        maxSubscribers: config.maxSubscribers,
        createdAt: now,
        expiresAt,
    };

    // 7. Debit creation fee (burned — not added to pot, not refunded on expiry)
    await redisService.updateWalletBalance(userId, -config.creationFee);

    // 8. Create Reddit post — blocking; roll back both fees on failure
    try {
        await createPost({
            ticker: tickerUpper,
            name: name.trim(),
            icon: icon || '📈',
            proposerName,
            imageUrl,
        });
    } catch (error) {
        console.error('[IPO] Failed to create Reddit post:', error);
        // Roll back the creation fee since we haven't committed anything to Redis yet
        await redisService.updateWalletBalance(userId, config.creationFee);
        return { success: false, message: 'Failed to create the Reddit post for this IPO. Please try again.' };
    }

    // 9. Write IPO hash, subscriber set, update list
    const hashData: Record<string, string> = {
        id: ipoId,
        name: ipo.name,
        ticker: ipo.ticker,
        icon: ipo.icon,
        proposedBy: userId,
        proposerName,
        status: 'pending',
        totalPot: String(config.subscriptionCost),
        potTarget: String(config.potTarget),
        subscriberCount: '1',
        maxSubscribers: String(config.maxSubscribers),
        createdAt: String(now),
        expiresAt: String(expiresAt),
    };
    if (imageUrl) hashData.imageUrl = imageUrl;
    await redis.hSet(REDIS_KEYS.ipoState(ipoId), hashData);

    await redis.zAdd(REDIS_KEYS.ipoSubscribers(ipoId), { member: userId, score: now });
    await redis.zAdd(REDIS_KEYS.IPO_LIST, { member: ipoId, score: now });

    // 10. Debit subscription cost (goes into pot, refunded if IPO expires)
    await redisService.updateWalletBalance(userId, -config.subscriptionCost);

    // 11. Set proposal cooldown (TTL so Redis auto-cleans it)
    await redis.set(REDIS_KEYS.userLastIpoProposal(userId), String(now));
    await redis.expire(REDIS_KEYS.userLastIpoProposal(userId), Math.ceil(config.proposalCooldownMs / 1000));

    // 12. Broadcast so all clients see new IPO
    await realtime.send('ipo_update', { type: 'new', ipoId, ticker: tickerUpper });

    return { success: true, message: `IPO for ${tickerUpper} created! Others can now subscribe.`, ipo };
}

// ============================================
// SUBSCRIBE TO IPO
// ============================================

export async function subscribeToIpo(
    userId: string,
    ipoId: string,
): Promise<{ success: boolean; message: string; listed?: boolean }> {
    const config = await redisService.getIpoConfig();
    const ipo = await getIpo(ipoId);
    if (!ipo) return { success: false, message: 'IPO not found.' };
    if (ipo.status !== 'pending') return { success: false, message: 'This IPO is no longer open.' };
    if (ipo.subscriberCount >= config.maxSubscribers) return { success: false, message: 'This IPO is already fully subscribed.' };
    if (Date.now() > ipo.expiresAt) return { success: false, message: 'This IPO has expired.' };

    // Check already subscribed
    const existing = await redis.zScore(REDIS_KEYS.ipoSubscribers(ipoId), userId);
    if (existing !== null && existing !== undefined) {
        return { success: false, message: 'You are already subscribed to this IPO.' };
    }

    // Check wallet
    const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
    if (!user || user.walletBalance < config.subscriptionCost) {
        return { success: false, message: `Insufficient funds. You need $${(config.subscriptionCost / 100).toFixed(0)} to subscribe.` };
    }

    const now = Date.now();
    const newSubscriberCount = ipo.subscriberCount + 1;
    const newTotalPot = ipo.totalPot + config.subscriptionCost;

    // Add subscriber and update state
    await redis.zAdd(REDIS_KEYS.ipoSubscribers(ipoId), { member: userId, score: now });
    await redis.hSet(REDIS_KEYS.ipoState(ipoId), {
        subscriberCount: String(newSubscriberCount),
        totalPot: String(newTotalPot),
    });

    // Debit wallet
    await redisService.updateWalletBalance(userId, -config.subscriptionCost);

    // Broadcast progress update
    await realtime.send('ipo_update', {
        type: 'progress',
        ipoId,
        subscriberCount: newSubscriberCount,
        totalPot: newTotalPot,
    });

    // If pot is full — list the stock!
    if (newSubscriberCount >= config.maxSubscribers) {
        await listIpo(ipo);
        return { success: true, message: `🚀 The pot is full! ${ipo.ticker} is now live on the market!`, listed: true };
    }

    const remaining = ipo.maxSubscribers - newSubscriberCount;
    return {
        success: true,
        message: `Subscribed! ${remaining} slot${remaining !== 1 ? 's' : ''} remaining.`,
        listed: false,
    };
}

// ============================================
// LIST IPO (called when pot fills)
// ============================================

async function listIpo(ipo: IpoState): Promise<void> {
    const config = await redisService.getIpoConfig();

    // Inject the targeted pot as xReal so price = (xVirt + xReal) / yVirt
    const xVirt = DEFAULT_X_VIRT;
    const yVirt = DEFAULT_Y_VIRT;
    const xReal = config.potTarget; // Inject dynamic pot target

    // Create the stock with boosted reserves
    await redisService.createStonk(
        ipo.ticker,
        ipo.name,
        ipo.ticker,
        ipo.icon,
        xVirt,
        yVirt,
        ipo.proposedBy,
        ipo.imageUrl,
    );

    // Inject the pot as xReal directly into the stonk hash
    const listingPrice = Math.round((xVirt + xReal) / yVirt);
    await redis.hSet(REDIS_KEYS.stonkState(ipo.ticker), {
        xReal: String(xReal),
        currentPrice: String(listingPrice),
        basePrice: String(listingPrice),
    });

    // Distribute shares to each subscriber
    const subEntries = await redis.zRange(REDIS_KEYS.ipoSubscribers(ipo.id), 0, -1, { by: 'rank' });
    const subUserIds = subEntries.map(e => e.member);

    await Promise.all(subUserIds.map(async (uid) => {
        const user = await redisService.getOrCreateUser(uid, STARTING_BALANCE);
        if (!user) return;

        const updatedPortfolio = { ...user.portfolio };
        const existing = updatedPortfolio[ipo.ticker];
        if (existing) {
            const totalQty = existing.qty + config.sharesPerSub;
            const totalCost = existing.qty * existing.avgPrice + config.sharesPerSub * listingPrice;
            updatedPortfolio[ipo.ticker] = { qty: totalQty, avgPrice: totalCost / totalQty };
        } else {
            updatedPortfolio[ipo.ticker] = { qty: config.sharesPerSub, avgPrice: listingPrice };
        }

        await redisService.atomicUpdateUserTrade(uid, 0, updatedPortfolio, user.walletBalance);
    }));

    // Mark IPO as listed, remove from pending list
    await redis.hSet(REDIS_KEYS.ipoState(ipo.id), { status: 'listed' });
    await redis.zRem(REDIS_KEYS.IPO_LIST, [ipo.id]);

    // Broadcast listing event
    await realtime.send('ipo_update', {
        type: 'listed',
        ipoId: ipo.id,
        stonkId: ipo.ticker,
        ticker: ipo.ticker,
        name: ipo.name,
        listingPrice,
    });
}

// ============================================
// EXPIRE IPOs (called from scheduler)
// ============================================

export async function expireStaleIpos(): Promise<void> {
    const config = await redisService.getIpoConfig();
    const now = Date.now();
    const pendingIpos = await getAllPendingIpos();

    for (const ipo of pendingIpos) {
        if (now < ipo.expiresAt) continue;

        // Refund all subscribers (only subscription cost, not creation fee)
        const subEntries = await redis.zRange(REDIS_KEYS.ipoSubscribers(ipo.id), 0, -1, { by: 'rank' });
        const subUserIds = subEntries.map(e => e.member);

        await Promise.all(subUserIds.map(uid => redisService.updateWalletBalance(uid, config.subscriptionCost)));

        // Mark expired
        await redis.hSet(REDIS_KEYS.ipoState(ipo.id), { status: 'expired' });
        await redis.zRem(REDIS_KEYS.IPO_LIST, [ipo.id]);

        // Broadcast expiry
        await realtime.send('ipo_update', {
            type: 'expired',
            ipoId: ipo.id,
            ticker: ipo.ticker,
            refundCount: subUserIds.length,
        });

        console.log(`[IPO] ⏰ Expired IPO ${ipo.ticker} — refunded ${subUserIds.length} subscribers`);
    }
}
