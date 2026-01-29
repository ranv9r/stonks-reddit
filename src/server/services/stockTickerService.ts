/**
 * Stock Ticker Service - Manages multi-tier price history with cache helper.
 * Uses Redis sorted sets for storage and cache helper for efficient serving.
 * 
 * Architecture:
 * - 5 tiers with different intervals (5s, 30s, 5m, 30m, 2h)
 * - Each tier stores up to 360 entries
 * - Higher tiers aggregate averages from lower tiers
 * - Cache helper provides efficient read access
 */

import { redis, cache } from '@devvit/web/server';
import { REDIS_KEYS, TICKER_TIERS, type TickerTier } from '../../shared/config';
import type { PriceHistoryEntry } from '../../shared/types/stonks';

const MAX_ENTRIES = 360;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Gets current price from stonk state.
 */
async function getCurrentPrice(stonkId: string): Promise<number | null> {
    const data = await redis.hGet(REDIS_KEYS.stonkState(stonkId), 'currentPrice');
    if (!data) return null;
    return parseInt(data);
}

/**
 * Gets the count of entries in a tier's sorted set.
 */
async function getTierCount(stonkId: string, tier: TickerTier): Promise<number> {
    const key = REDIS_KEYS.stonkHistoryTier(stonkId, tier);
    return await redis.zCard(key);
}

/**
 * Gets the latest N entries from a tier's Redis sorted set.
 * Returns entries in chronological order (oldest first).
 */
async function getLatestFromTier(
    stonkId: string,
    tier: TickerTier,
    count: number
): Promise<PriceHistoryEntry[]> {
    const key = REDIS_KEYS.stonkHistoryTier(stonkId, tier);
    // Get latest entries (reverse order = newest first)
    const entries = await redis.zRange(key, 0, count - 1, { by: 'rank', reverse: true });
    if (!entries || entries.length === 0) return [];
    // Parse and reverse to get chronological order
    return entries.map(e => JSON.parse(e.member) as PriceHistoryEntry).reverse();
}

/**
 * Appends a new tick to tier. Only removes oldest if exceeds MAX_ENTRIES.
 */
async function appendToTier(
    stonkId: string,
    tier: TickerTier,
    entry: PriceHistoryEntry
): Promise<void> {
    const key = REDIS_KEYS.stonkHistoryTier(stonkId, tier);
    const now = Date.now();

    // Add new entry with timestamp as score
    await redis.zAdd(key, { score: now, member: JSON.stringify(entry) });

    // Only trim if exceeding 360 entries (accumulate until then)
    const count = await redis.zCard(key);
    if (count > MAX_ENTRIES) {
        // Remove oldest entries (lowest scores = oldest timestamps)
        await redis.zRemRangeByRank(key, 0, count - MAX_ENTRIES - 1);
    }
}

// ============================================
// TIER UPDATE FUNCTIONS
// ============================================

/**
 * Updates Tier 1 - fetches current price directly from state.
 * Called every 5 seconds by scheduler.
 */
export async function updateTier1(stonkId: string): Promise<boolean> {
    const price = await getCurrentPrice(stonkId);

    // Skip if no price data available
    if (price === null || price === 0) {
        console.log(`[Ticker] Skipping tier 1 for ${stonkId} - no price data`);
        return false;
    }

    const entry: PriceHistoryEntry = { t: Date.now(), p: price, v: 0 };
    await appendToTier(stonkId, 1, entry);
    return true;
}

/**
 * Updates higher tier by averaging N entries from source tier.
 * Only runs if source tier has enough data.
 * Called on tier-specific intervals by scheduler.
 */
export async function updateHigherTier(
    stonkId: string,
    tier: 2 | 3 | 4 | 5
): Promise<boolean> {
    const config = TICKER_TIERS[tier];
    if (!config.sourceTier || !config.avgCount) return false;

    // Check if source tier has enough data
    const sourceCount = await getTierCount(stonkId, config.sourceTier);
    if (sourceCount < config.avgCount) {
        console.log(
            `[Ticker] Skipping tier ${tier} for ${stonkId} - source tier ${config.sourceTier} has ${sourceCount}/${config.avgCount} required entries`
        );
        return false;
    }

    // Fetch latest entries from source tier
    const sourceEntries = await getLatestFromTier(stonkId, config.sourceTier, config.avgCount);
    if (sourceEntries.length < config.avgCount) {
        console.log(
            `[Ticker] Skipping tier ${tier} for ${stonkId} - only got ${sourceEntries.length} entries`
        );
        return false;
    }

    // Calculate average price
    const avgPrice = Math.round(
        sourceEntries.reduce((sum, e) => sum + e.p, 0) / sourceEntries.length
    );
    const totalVolume = sourceEntries.reduce((sum, e) => sum + e.v, 0);

    const entry: PriceHistoryEntry = { t: Date.now(), p: avgPrice, v: totalVolume };
    await appendToTier(stonkId, tier, entry);
    return true;
}

// ============================================
// DATA ACCESS FUNCTIONS
// ============================================

/**
 * Gets tier data from cache, falling back to Redis if cache miss.
 * Returns array of price history entries for the specified tier.
 */
export async function getTierData(
    stonkId: string,
    tier: TickerTier
): Promise<PriceHistoryEntry[]> {
    const config = TICKER_TIERS[tier];
    const cacheKey = `ticker:${stonkId}:${tier}`;

    const result = await cache(
        async () => {
            // Cache miss - fetch from Redis
            const key = REDIS_KEYS.stonkHistoryTier(stonkId, tier);
            const count = await redis.zCard(key);

            // Return empty if no data
            if (count === 0) return [];

            // Get all entries sorted by score (timestamp) ascending
            const entries = await redis.zRange(key, 0, MAX_ENTRIES - 1, { by: 'rank' });
            return entries.map(e => JSON.parse(e.member));
        },
        { key: cacheKey, ttl: config.ttl }
    );

    // Cache returns JsonValue, so we cast to our expected type
    return (result as PriceHistoryEntry[]) || [];
}

/**
 * Gets all stonk IDs from the registry for batch processing by schedulers.
 */
export async function getAllStonkIds(): Promise<string[]> {
    const entries = await redis.zRange(REDIS_KEYS.STONKS_LIST, 0, -1, { by: 'rank' });
    if (!entries || entries.length === 0) return [];
    return entries.map(e => e.member);
}

/**
 * Checks if a tier has any data for a specific stonk.
 */
export async function hasTierData(stonkId: string, tier: TickerTier): Promise<boolean> {
    const count = await getTierCount(stonkId, tier);
    return count > 0;
}

/**
 * Gets the entry count for a tier (for debugging/monitoring).
 */
export async function getTierEntryCount(stonkId: string, tier: TickerTier): Promise<number> {
    return await getTierCount(stonkId, tier);
}
