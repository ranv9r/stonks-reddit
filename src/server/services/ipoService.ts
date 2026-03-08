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
    IPO_SUBSCRIPTION_COST,
    IPO_POT_TARGET,
    IPO_MAX_SUBSCRIBERS,
    IPO_SHARES_PER_SUB,
    IPO_PROPOSAL_COOLDOWN_MS,
    IPO_EXPIRY_MS,
} from '../../shared/config';
import type { IpoState, IpoStatus } from '../../shared/types/stonks';
import * as redisService from './redis';

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

    // 4. Check 24h proposal cooldown
    const lastProposal = await getLastProposalTime(userId);
    if (lastProposal && Date.now() - lastProposal < IPO_PROPOSAL_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((IPO_PROPOSAL_COOLDOWN_MS - (Date.now() - lastProposal)) / 3600000);
        return { success: false, message: `You can only propose one IPO per day. Try again in ~${hoursLeft}h.` };
    }

    // 5. Check wallet balance
    const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
    if (!user || user.walletBalance < IPO_SUBSCRIPTION_COST) {
        return { success: false, message: `Insufficient funds. You need $${(IPO_SUBSCRIPTION_COST / 100).toFixed(0)} to propose an IPO.` };
    }

    // 6. Create IPO record
    const now = Date.now();
    const ipoId = `ipo_${tickerUpper}_${now}`;
    const expiresAt = now + IPO_EXPIRY_MS;
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
        totalPot: IPO_SUBSCRIPTION_COST,
        potTarget: IPO_POT_TARGET,
        subscriberCount: 1,
        maxSubscribers: IPO_MAX_SUBSCRIBERS,
        createdAt: now,
        expiresAt,
    };

    // 7. Write IPO hash, subscriber set, update list
    const hashData: Record<string, string> = {
        id: ipoId,
        name: ipo.name,
        ticker: ipo.ticker,
        icon: ipo.icon,
        proposedBy: userId,
        proposerName,
        status: 'pending',
        totalPot: String(IPO_SUBSCRIPTION_COST),
        potTarget: String(IPO_POT_TARGET),
        subscriberCount: '1',
        maxSubscribers: String(IPO_MAX_SUBSCRIBERS),
        createdAt: String(now),
        expiresAt: String(expiresAt),
    };
    if (imageUrl) hashData.imageUrl = imageUrl;
    await redis.hSet(REDIS_KEYS.ipoState(ipoId), hashData);

    await redis.zAdd(REDIS_KEYS.ipoSubscribers(ipoId), { member: userId, score: now });
    await redis.zAdd(REDIS_KEYS.IPO_LIST, { member: ipoId, score: now });

    // 8. Debit wallet
    await redisService.updateWalletBalance(userId, -IPO_SUBSCRIPTION_COST);

    // 9. Set proposal cooldown (24h TTL so Redis auto-cleans it)
    await redis.set(REDIS_KEYS.userLastIpoProposal(userId), String(now));
    await redis.expire(REDIS_KEYS.userLastIpoProposal(userId), Math.ceil(IPO_PROPOSAL_COOLDOWN_MS / 1000));

    // 10. Broadcast so all clients see new IPO
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
    const ipo = await getIpo(ipoId);
    if (!ipo) return { success: false, message: 'IPO not found.' };
    if (ipo.status !== 'pending') return { success: false, message: 'This IPO is no longer open.' };
    if (ipo.subscriberCount >= ipo.maxSubscribers) return { success: false, message: 'This IPO is already fully subscribed.' };
    if (Date.now() > ipo.expiresAt) return { success: false, message: 'This IPO has expired.' };

    // Check already subscribed
    const existing = await redis.zScore(REDIS_KEYS.ipoSubscribers(ipoId), userId);
    if (existing !== null && existing !== undefined) {
        return { success: false, message: 'You are already subscribed to this IPO.' };
    }

    // Check wallet
    const user = await redisService.getOrCreateUser(userId, STARTING_BALANCE);
    if (!user || user.walletBalance < IPO_SUBSCRIPTION_COST) {
        return { success: false, message: `Insufficient funds. You need $${(IPO_SUBSCRIPTION_COST / 100).toFixed(0)} to subscribe.` };
    }

    const now = Date.now();
    const newSubscriberCount = ipo.subscriberCount + 1;
    const newTotalPot = ipo.totalPot + IPO_SUBSCRIPTION_COST;

    // Add subscriber and update state
    await redis.zAdd(REDIS_KEYS.ipoSubscribers(ipoId), { member: userId, score: now });
    await redis.hSet(REDIS_KEYS.ipoState(ipoId), {
        subscriberCount: String(newSubscriberCount),
        totalPot: String(newTotalPot),
    });

    // Debit wallet
    await redisService.updateWalletBalance(userId, -IPO_SUBSCRIPTION_COST);

    // Broadcast progress update
    await realtime.send('ipo_update', {
        type: 'progress',
        ipoId,
        subscriberCount: newSubscriberCount,
        totalPot: newTotalPot,
    });

    // If pot is full — list the stock!
    if (newSubscriberCount >= ipo.maxSubscribers) {
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
    // Inject $100K pot as xReal so price = (xVirt + xReal) / yVirt = $110
    const xVirt = DEFAULT_X_VIRT;
    const yVirt = DEFAULT_Y_VIRT;
    const xReal = IPO_POT_TARGET; // $100K injected — price = 110M/10000 = $110

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

    // Distribute 100 shares to each subscriber
    const subEntries = await redis.zRange(REDIS_KEYS.ipoSubscribers(ipo.id), 0, -1, { by: 'rank' });
    const subUserIds = subEntries.map(e => e.member);

    await Promise.all(subUserIds.map(async (uid) => {
        const user = await redisService.getOrCreateUser(uid, STARTING_BALANCE);
        if (!user) return;

        const updatedPortfolio = { ...user.portfolio };
        const existing = updatedPortfolio[ipo.ticker];
        if (existing) {
            const totalQty = existing.qty + IPO_SHARES_PER_SUB;
            const totalCost = existing.qty * existing.avgPrice + IPO_SHARES_PER_SUB * listingPrice;
            updatedPortfolio[ipo.ticker] = { qty: totalQty, avgPrice: totalCost / totalQty };
        } else {
            updatedPortfolio[ipo.ticker] = { qty: IPO_SHARES_PER_SUB, avgPrice: listingPrice };
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
    const now = Date.now();
    const pendingIpos = await getAllPendingIpos();

    for (const ipo of pendingIpos) {
        if (now < ipo.expiresAt) continue;

        // Refund all subscribers
        const subEntries = await redis.zRange(REDIS_KEYS.ipoSubscribers(ipo.id), 0, -1, { by: 'rank' });
        const subUserIds = subEntries.map(e => e.member);

        await Promise.all(subUserIds.map(uid => redisService.updateWalletBalance(uid, IPO_SUBSCRIPTION_COST)));

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
