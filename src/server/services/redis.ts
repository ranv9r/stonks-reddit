/**
 * Redis utility functions for Meme Stonks game.
 * Provides typed wrappers around Redis operations.
 * 
 * Optimized for scalability:
 * - Cooldowns use TTL for automatic cleanup
 * - Efficient hash operations for state storage
 * - Minimal memory footprint per user
 */

import { redis } from '@devvit/web/server';
import {
    REDIS_KEYS,
    DEFAULT_X_VIRT,
    DEFAULT_Y_VIRT,
    DEFAULT_BASE_PRICE,
    USER_SPEND_LIMIT,
    COOLDOWN_WINDOW_SECONDS,
} from '../../shared/config';
import type {
    StonkState,
    UserData,
    Portfolio,
    PriceHistoryEntry,
    GameConfig,
    SpendLimitResult,
    AMMState,
} from '../../shared/types/stonks';

// ============================================
// STONK OPERATIONS
// ============================================

/**
 * Creates a new stonk with AMM initial state.
 */
export async function createStonk(
    id: string,
    name: string,
    ticker: string,
    icon: string,
    basePrice: number = DEFAULT_BASE_PRICE,
    xVirt: number = DEFAULT_X_VIRT,
    yVirt: number = DEFAULT_Y_VIRT,
    createdBy: string,
    imageUrl?: string
): Promise<StonkState> {
    const now = Date.now();

    // Calculate initial price from reserves
    const initialPrice = Math.round(xVirt / yVirt);

    const stonk: StonkState = {
        id,
        name,
        ticker,
        icon,
        ...(imageUrl ? { imageUrl } : {}),
        xVirt,
        yVirt,
        xReal: 0,
        yReal: 0,
        basePrice: initialPrice,
        currentPrice: initialPrice,
        totalVolume: 0,
        createdBy,
        createdAt: now,
        active: true,
    };

    // Store stonk state as hash
    const hashData: Record<string, string> = {
        id,
        name,
        ticker,
        icon,
        xVirt: String(xVirt),
        yVirt: String(yVirt),
        xReal: '0',
        yReal: '0',
        basePrice: String(initialPrice),
        currentPrice: String(initialPrice),
        totalVolume: '0',
        createdBy,
        createdAt: String(now),
        active: 'true',
    };
    if (imageUrl) {
        hashData.imageUrl = imageUrl;
    }
    await redis.hSet(REDIS_KEYS.stonkState(id), hashData);

    // Add to stonks list (using sorted set with score 0 since Devvit only supports sorted sets)
    await redis.zAdd(REDIS_KEYS.STONKS_LIST, { member: id, score: 0 });

    // Initialize batch counters
    await redis.hSet(REDIS_KEYS.stonkBatch(id), {
        buyVolume: '0',
        sellVolume: '0',
    });

    return stonk;
}

/**
 * Gets a stonk by ID with full AMM state.
 */
export async function getStonk(stonkId: string): Promise<StonkState | null> {
    const data = await redis.hGetAll(REDIS_KEYS.stonkState(stonkId));
    if (!data || !data.id) return null;

    const result: StonkState = {
        id: data.id,
        name: data.name || '',
        ticker: data.ticker || '',
        icon: data.icon || '',
        xVirt: parseInt(data.xVirt || String(DEFAULT_X_VIRT)),
        yVirt: parseFloat(data.yVirt || String(DEFAULT_Y_VIRT)),
        xReal: parseInt(data.xReal || '0'),
        yReal: parseFloat(data.yReal || '0'),
        basePrice: parseInt(data.basePrice || String(DEFAULT_BASE_PRICE)),
        currentPrice: parseInt(data.currentPrice || String(DEFAULT_BASE_PRICE)),
        totalVolume: parseInt(data.totalVolume || '0'),
        createdBy: data.createdBy || '',
        createdAt: parseInt(data.createdAt || '0'),
        active: data.active === 'true',
    };
    if (data.imageUrl) {
        result.imageUrl = data.imageUrl;
    }
    return result;
}

/**
 * Gets AMM state only (for calculations).
 */
export async function getAMMState(stonkId: string): Promise<AMMState | null> {
    const data = await redis.hGetAll(REDIS_KEYS.stonkState(stonkId));
    if (!data || !data.id) return null;

    return {
        xVirt: parseInt(data.xVirt || String(DEFAULT_X_VIRT)),
        yVirt: parseFloat(data.yVirt || String(DEFAULT_Y_VIRT)),
        xReal: parseInt(data.xReal || '0'),
        yReal: parseFloat(data.yReal || '0'),
    };
}

/**
 * Gets all stonks in the subreddit.
 */
export async function getAllStonks(): Promise<StonkState[]> {
    // Use zRange since Devvit only supports sorted sets
    const entries = await redis.zRange(REDIS_KEYS.STONKS_LIST, 0, -1, { by: 'rank' });
    const stonkIds = entries.map(e => e.member);
    if (!stonkIds || stonkIds.length === 0) return [];

    // Fetch all stonks in parallel for performance
    const stonkPromises = stonkIds.map(id => getStonk(id));
    const stonksRaw = await Promise.all(stonkPromises);

    // Filter out null/inactive stonks
    return stonksRaw.filter((s): s is StonkState => s !== null && s.active);
}

/**
 * Updates stonk AMM state and price after batch execution.
 */
export async function updateStonkAMMState(
    stonkId: string,
    newState: AMMState,
    newPrice: number,
    volume: number
): Promise<void> {
    const now = Date.now();

    // Update AMM state and price
    await redis.hSet(REDIS_KEYS.stonkState(stonkId), {
        xVirt: String(Math.round(newState.xVirt)),
        yVirt: String(newState.yVirt),
        xReal: String(Math.round(newState.xReal)),
        yReal: String(newState.yReal),
        currentPrice: String(newPrice),
    });

    // Increment total volume
    await redis.hIncrBy(REDIS_KEYS.stonkState(stonkId), 'totalVolume', volume);

    // Add to price history
    const historyEntry: PriceHistoryEntry = {
        t: now,
        p: newPrice,
        v: volume,
    };
    await redis.zAdd(REDIS_KEYS.stonkHistory(stonkId), {
        score: now,
        member: JSON.stringify(historyEntry),
    });
}

/**
 * Gets price history for a stonk.
 */
export async function getPriceHistory(
    stonkId: string,
    limit: number = 100
): Promise<PriceHistoryEntry[]> {
    const entries = await redis.zRange(REDIS_KEYS.stonkHistory(stonkId), 0, limit - 1, {
        by: 'rank',
        reverse: true,
    });

    return entries.map((entry) => JSON.parse(entry.member) as PriceHistoryEntry).reverse();
}

/**
 * Deletes price history for a stonk.
 */
export async function deletePriceHistory(stonkId: string): Promise<void> {
    await redis.del(REDIS_KEYS.stonkHistory(stonkId));
}

/**
 * Updates a stonk's editable fields (name, icon, imageUrl).
 */
export async function updateStonk(
    stonkId: string,
    updates: { name?: string; icon?: string; imageUrl?: string }
): Promise<StonkState | null> {
    const existing = await getStonk(stonkId);
    if (!existing) return null;

    const hashUpdates: Record<string, string> = {};
    if (updates.name !== undefined) hashUpdates.name = updates.name;
    if (updates.icon !== undefined) hashUpdates.icon = updates.icon;
    if (updates.imageUrl !== undefined) hashUpdates.imageUrl = updates.imageUrl;

    if (Object.keys(hashUpdates).length > 0) {
        await redis.hSet(REDIS_KEYS.stonkState(stonkId), hashUpdates);
    }

    return await getStonk(stonkId);
}

/**
 * Deletes a stonk entirely.
 */
export async function deleteStonk(stonkId: string): Promise<boolean> {
    console.log(`[Redis] Force deleting stonk: ${stonkId}`);
    
    // Just force delete everything related to this ID
    const removedCount = await redis.zRem(REDIS_KEYS.STONKS_LIST, [stonkId]);
    console.log(`[Redis] zRem removed ${removedCount} from list for ${stonkId}`);
    
    await redis.del(REDIS_KEYS.stonkState(stonkId));
    await redis.del(REDIS_KEYS.stonkBatch(stonkId));
    await deletePriceHistory(stonkId);

    return true;
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Adds buy volume to the current batch.
 */
export async function addBuyVolume(stonkId: string, amount: number): Promise<number> {
    return await redis.hIncrBy(REDIS_KEYS.stonkBatch(stonkId), 'buyVolume', amount);
}

/**
 * Adds sell volume to the current batch (in shares, not cents).
 */
export async function addSellVolume(stonkId: string, shares: number): Promise<number> {
    // Store as scaled integer to avoid floating point issues
    const scaledShares = Math.round(shares * 10000);
    return await redis.hIncrBy(REDIS_KEYS.stonkBatch(stonkId), 'sellVolume', scaledShares);
}

/**
 * Gets and resets the batch volumes for a stonk.
 */
export async function getAndResetBatch(
    stonkId: string
): Promise<{ buyVolume: number; sellVolume: number }> {
    const batch = await redis.hGetAll(REDIS_KEYS.stonkBatch(stonkId));
    const buyVolume = parseInt(batch?.buyVolume || '0');
    // Unscale the sell volume
    const sellVolume = parseInt(batch?.sellVolume || '0') / 10000;

    // Reset batch
    await redis.hSet(REDIS_KEYS.stonkBatch(stonkId), {
        buyVolume: '0',
        sellVolume: '0',
    });

    return { buyVolume, sellVolume };
}

// ============================================
// COOLDOWN OPERATIONS (Per-stonk rate limiting)
// ============================================

/**
 * Check if user can spend the requested amount on a stonk.
 * Returns remaining allowance and whether the full amount is allowed.
 */
export async function checkSpendLimit(
    userId: string,
    stonkId: string,
    requestedAmount: number
): Promise<SpendLimitResult> {
    // Use time-bucketed key (1 minute buckets) to ensure strict window enforcement
    // and preventing keys from getting stuck forever if TTL fails.
    const bucket = Math.floor(Date.now() / (COOLDOWN_WINDOW_SECONDS * 1000));
    const key = `${REDIS_KEYS.userSpend(userId, stonkId)}:${bucket}`;

    const currentSpent = await redis.get(key);

    const spent = currentSpent ? parseInt(currentSpent) : 0;
    const remaining = USER_SPEND_LIMIT - spent;

    if (requestedAmount <= remaining) {
        return {
            allowed: true,
            remaining,
            spent,
        };
    }

    // Partial allowance - cap to remaining
    if (remaining > 0) {
        return {
            allowed: false,
            remaining,
            spent,
            cappedAmount: remaining,
        };
    }

    return {
        allowed: false,
        remaining: 0,
        spent,
    };
}

/**
 * Record user spending on a stonk.
 * Uses Redis TTL for automatic expiry (60 seconds).
 */
export async function recordSpending(
    userId: string,
    stonkId: string,
    amount: number
): Promise<void> {
    const bucket = Math.floor(Date.now() / (COOLDOWN_WINDOW_SECONDS * 1000));
    const key = `${REDIS_KEYS.userSpend(userId, stonkId)}:${bucket}`;

    // Atomically increment the bucket
    await redis.incrBy(key, amount);

    // Set expiry for cleanup (2x window is plenty safe)
    // We don't care if we set it repeatedly, as long as it eventually expires.
    await redis.expire(key, COOLDOWN_WINDOW_SECONDS * 2);
}

/**
 * Get user's current spending on a stonk (for display).
 */
export async function getUserSpending(
    userId: string,
    stonkId: string
): Promise<{ spent: number; remaining: number }> {
    const bucket = Math.floor(Date.now() / (COOLDOWN_WINDOW_SECONDS * 1000));
    const key = `${REDIS_KEYS.userSpend(userId, stonkId)}:${bucket}`;

    const currentSpent = await redis.get(key);

    const spent = currentSpent ? parseInt(currentSpent) : 0;
    return {
        spent,
        remaining: Math.max(0, USER_SPEND_LIMIT - spent),
    };
}

// ============================================
// USER OPERATIONS
// ============================================

/**
 * Gets or creates a user.
 */
export async function getOrCreateUser(userId: string, startingBalance: number): Promise<UserData> {
    const existing = await redis.hGetAll(REDIS_KEYS.userData(userId));

    if (existing && existing.walletBalance) {
        return {
            walletBalance: parseInt(existing.walletBalance),
            portfolio: JSON.parse(existing.portfolio || '{}'),
            joinedAt: parseInt(existing.joinedAt || '0'),
            lastTradeAt: parseInt(existing.lastTradeAt || '0'),
        };
    }

    // Create new user
    const now = Date.now();
    const userData: UserData = {
        walletBalance: startingBalance,
        portfolio: {},
        joinedAt: now,
        lastTradeAt: 0,
    };

    await redis.hSet(REDIS_KEYS.userData(userId), {
        walletBalance: String(startingBalance),
        portfolio: '{}',
        joinedAt: String(now),
        lastTradeAt: '0',
    });

    return userData;
}

/**
 * Gets a user's data.
 */
export async function getUser(userId: string): Promise<UserData | null> {
    const data = await redis.hGetAll(REDIS_KEYS.userData(userId));
    if (!data || !data.walletBalance) return null;

    return {
        walletBalance: parseInt(data.walletBalance),
        portfolio: JSON.parse(data.portfolio || '{}'),
        joinedAt: parseInt(data.joinedAt || '0'),
        lastTradeAt: parseInt(data.lastTradeAt || '0'),
    };
}

/**
 * Updates a user's wallet balance.
 */
export async function updateWalletBalance(userId: string, delta: number): Promise<number> {
    return await redis.hIncrBy(REDIS_KEYS.userData(userId), 'walletBalance', delta);
}

/**
 * Updates a user's portfolio.
 */
export async function updatePortfolio(userId: string, portfolio: Portfolio): Promise<void> {
    await redis.hSet(REDIS_KEYS.userData(userId), {
        portfolio: JSON.stringify(portfolio),
        lastTradeAt: String(Date.now()),
    });
}

/**
 * Resets a user's data - wallet to starting balance, clear portfolio.
 */
export async function resetUser(userId: string, startingBalance: number): Promise<void> {
    await redis.hSet(REDIS_KEYS.userData(userId), {
        walletBalance: String(startingBalance),
        portfolio: '{}',
        lastTradeAt: '0',
    });
}

/**
 * Get all user IDs from leaderboard (to reset all users).
 */
export async function getAllUserIds(): Promise<string[]> {
    const entries = await redis.zRange(REDIS_KEYS.LEADERBOARD, 0, -1, { by: 'rank' });
    return entries.map(e => e.member);
}

// ============================================
// LEADERBOARD OPERATIONS
// ============================================

/**
 * Updates a user's score on the leaderboard.
 */
export async function updateLeaderboardScore(userId: string, netWorth: number): Promise<void> {
    await redis.zAdd(REDIS_KEYS.LEADERBOARD, { member: userId, score: netWorth });
}

/**
 * Gets the top N users from the leaderboard.
 */
export async function getTopLeaderboard(limit: number): Promise<{ userId: string; score: number }[]> {
    const entries = await redis.zRange(REDIS_KEYS.LEADERBOARD, 0, limit - 1, {
        by: 'rank',
        reverse: true,
    });

    return entries.map((entry) => ({
        userId: entry.member,
        score: entry.score,
    }));
}

/**
 * Gets a user's rank on the leaderboard.
 */
export async function getUserRank(userId: string): Promise<number | null> {
    const rank = await redis.zRank(REDIS_KEYS.LEADERBOARD, userId);
    return rank !== undefined ? rank : null;
}

/**
 * Gets total number of users on the leaderboard.
 */
export async function getLeaderboardCount(): Promise<number> {
    return await redis.zCard(REDIS_KEYS.LEADERBOARD);
}

// ============================================
// GAME CONFIG OPERATIONS
// ============================================

/**
 * Gets the game configuration.
 */
export async function getGameConfig(): Promise<GameConfig> {
    const data = await redis.hGetAll(REDIS_KEYS.GAME_CONFIG);

    return {
        eventActive: data?.eventActive === 'true',
        eventStartTime: data?.eventStartTime ? parseInt(data.eventStartTime) : null,
        tickInterval: parseInt(data?.tickInterval || '5000'),
        startingBalance: parseInt(data?.startingBalance || '1000000'),
    };
}

/**
 * Sets the game configuration.
 */
export async function setGameConfig(config: Partial<GameConfig>): Promise<void> {
    const updates: Record<string, string> = {};

    if (config.eventActive !== undefined) {
        updates.eventActive = String(config.eventActive);
    }
    if (config.eventStartTime !== undefined) {
        updates.eventStartTime = String(config.eventStartTime);
    }
    if (config.tickInterval !== undefined) {
        updates.tickInterval = String(config.tickInterval);
    }
    if (config.startingBalance !== undefined) {
        updates.startingBalance = String(config.startingBalance);
    }

    if (Object.keys(updates).length > 0) {
        await redis.hSet(REDIS_KEYS.GAME_CONFIG, updates);
    }
}

/**
 * Gets the last tick timestamp.
 */
export async function getLastTick(): Promise<number> {
    const tick = await redis.get(REDIS_KEYS.LAST_TICK);
    return tick ? parseInt(tick) : 0;
}

/**
 * Sets the last tick timestamp.
 */
export async function setLastTick(timestamp: number): Promise<void> {
    await redis.set(REDIS_KEYS.LAST_TICK, String(timestamp));
}
