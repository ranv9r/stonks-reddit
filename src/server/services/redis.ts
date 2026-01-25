/**
 * Redis utility functions for Meme Stonks game.
 * Provides typed wrappers around Redis operations.
 */

import { redis } from '@devvit/web/server';
import { REDIS_KEYS } from '../../shared/config';
import type {
    StonkState,
    UserData,
    Portfolio,
    PriceHistoryEntry,
    GameConfig,
} from '../../shared/types/stonks';

// ============================================
// STONK OPERATIONS
// ============================================

/**
 * Creates a new stonk in the database.
 */
export async function createStonk(
    id: string,
    name: string,
    ticker: string,
    icon: string,
    basePrice: number,
    virtualLiquidity: number,
    createdBy: string
): Promise<StonkState> {
    const now = Date.now();
    const stonk: StonkState = {
        id,
        name,
        ticker,
        icon,
        basePrice,
        currentPrice: basePrice,
        virtualLiquidity,
        totalVolume: 0,
        createdBy,
        createdAt: now,
        active: true,
    };

    // Store stonk state as hash
    await redis.hSet(REDIS_KEYS.stonkState(id), {
        id,
        name,
        ticker,
        icon,
        basePrice: String(basePrice),
        currentPrice: String(basePrice),
        virtualLiquidity: String(virtualLiquidity),
        totalVolume: '0',
        createdBy,
        createdAt: String(now),
        active: 'true',
    });

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
 * Gets a stonk by ID.
 */
export async function getStonk(stonkId: string): Promise<StonkState | null> {
    const data = await redis.hGetAll(REDIS_KEYS.stonkState(stonkId));
    if (!data || !data.id) return null;

    return {
        id: data.id,
        name: data.name || '',
        ticker: data.ticker || '',
        icon: data.icon || '',
        basePrice: parseInt(data.basePrice || '0'),
        currentPrice: parseInt(data.currentPrice || '0'),
        virtualLiquidity: parseInt(data.virtualLiquidity || '0'),
        totalVolume: parseInt(data.totalVolume || '0'),
        createdBy: data.createdBy || '',
        createdAt: parseInt(data.createdAt || '0'),
        active: data.active === 'true',
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

    const stonks: StonkState[] = [];
    for (const id of stonkIds) {
        const stonk = await getStonk(id);
        if (stonk && stonk.active) {
            stonks.push(stonk);
        }
    }
    return stonks;
}

/**
 * Updates a stonk's current price.
 */
export async function updateStonkPrice(
    stonkId: string,
    newPrice: number,
    volume: number
): Promise<void> {
    const now = Date.now();

    // Update current price
    await redis.hSet(REDIS_KEYS.stonkState(stonkId), {
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
 * Adds sell volume to the current batch.
 */
export async function addSellVolume(stonkId: string, amount: number): Promise<number> {
    return await redis.hIncrBy(REDIS_KEYS.stonkBatch(stonkId), 'sellVolume', amount);
}

/**
 * Gets and resets the batch volumes for a stonk.
 */
export async function getAndResetBatch(
    stonkId: string
): Promise<{ buyVolume: number; sellVolume: number }> {
    const batch = await redis.hGetAll(REDIS_KEYS.stonkBatch(stonkId));
    const buyVolume = parseInt(batch?.buyVolume || '0');
    const sellVolume = parseInt(batch?.sellVolume || '0');

    // Reset batch
    await redis.hSet(REDIS_KEYS.stonkBatch(stonkId), {
        buyVolume: '0',
        sellVolume: '0',
    });

    return { buyVolume, sellVolume };
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
