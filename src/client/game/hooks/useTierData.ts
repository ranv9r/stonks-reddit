/**
 * Custom hook for managing tiered stock price data cache with smart polling.
 * 
 * Features:
 * - Tier 1: Initial fetch + realtime updates (sliding window)
 * - Tiers 2-5: Fetch once, cache with timestamp-based refresh
 * - GLOBAL cache persists across component unmounts/remounts
 * - Auto-refresh when cache becomes stale while viewing
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// Tier intervals in seconds (must match backend TICKER_TIERS)
const TIER_CONFIG = {
    1: { interval: 5, label: '30m', entries: 360 },
    2: { interval: 30, label: '3h', entries: 360 },
    3: { interval: 300, label: '30h', entries: 360 },
    4: { interval: 1800, label: '7.5d', entries: 360 },
    5: { interval: 7200, label: '30d', entries: 360 },
} as const;

export type TickerTier = 1 | 2 | 3 | 4 | 5;

export interface PriceHistoryEntry {
    t: number; // timestamp
    p: number; // price
    v: number; // volume
}

interface TierCacheEntry {
    data: PriceHistoryEntry[];
    fetchedAt: number;
    nextRefreshAt: number;
}

// ============================================
// GLOBAL CACHE - persists across component lifecycle
// Key format: "stonkId:tier"
// ============================================
const globalTierCache = new Map<string, TierCacheEntry>();
const tier1FetchedFlags = new Set<string>(); // Track which stonks have fetched tier 1

/**
 * Gets cache key for stonk + tier combination.
 */
function getCacheKey(stonkId: string, tier: TickerTier): string {
    return `${stonkId}:${tier}`;
}

/**
 * Gets cached entry from global cache.
 */
function getFromGlobalCache(stonkId: string, tier: TickerTier): TierCacheEntry | undefined {
    return globalTierCache.get(getCacheKey(stonkId, tier));
}

/**
 * Sets entry in global cache.
 */
function setInGlobalCache(stonkId: string, tier: TickerTier, entry: TierCacheEntry): void {
    globalTierCache.set(getCacheKey(stonkId, tier), entry);
}

interface UseTierDataResult {
    currentData: PriceHistoryEntry[];
    selectedTier: TickerTier;
    setSelectedTier: (tier: TickerTier) => void;
    loading: boolean;
    tierLabels: Record<TickerTier, string>;
}

/**
 * Hook for managing tiered price data with intelligent global caching.
 * @param stonkId - The stock ID to fetch data for
 * @param currentPrice - Current price from realtime updates (for tier 1 sliding window)
 */
export function useTierData(stonkId: string, currentPrice: number): UseTierDataResult {
    const [selectedTier, setSelectedTier] = useState<TickerTier>(1);
    const [currentData, setCurrentData] = useState<PriceHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastPriceUpdate, setLastPriceUpdate] = useState(0);

    /**
     * Fetches tier data from API and caches it globally.
     */
    const fetchTierData = useCallback(async (tier: TickerTier): Promise<PriceHistoryEntry[]> => {
        try {
            console.log(`[TierData] Fetching tier ${tier} for ${stonkId}`);
            const res = await fetch(`/api/stonk/${stonkId}/${tier}`);
            if (!res.ok) throw new Error(`Failed to fetch tier ${tier} data`);
            const result = await res.json();

            const now = Date.now();
            const intervalMs = TIER_CONFIG[tier].interval * 1000;

            // Cache with next refresh timestamp
            const cacheEntry: TierCacheEntry = {
                data: result.priceHistory || [],
                fetchedAt: now,
                nextRefreshAt: now + intervalMs,
            };
            setInGlobalCache(stonkId, tier, cacheEntry);

            console.log(`[TierData] Cached tier ${tier} with ${cacheEntry.data.length} entries, refresh at ${new Date(cacheEntry.nextRefreshAt).toISOString()}`);
            return cacheEntry.data;
        } catch (error) {
            console.error(`[TierData] Failed to fetch tier ${tier}:`, error);
            return [];
        }
    }, [stonkId]);

    /**
     * Gets cached data or fetches if stale.
     */
    const getTierDataWithCache = useCallback(async (tier: TickerTier, forceRefresh = false): Promise<PriceHistoryEntry[]> => {
        const cached = getFromGlobalCache(stonkId, tier);
        const now = Date.now();
        const tier1Key = `${stonkId}:1`;

        // For tier 1: only fetch once initially, then update via realtime
        if (tier === 1 && !forceRefresh) {
            if (tier1FetchedFlags.has(tier1Key) && cached) {
                return cached.data;
            }
            const data = await fetchTierData(tier);
            tier1FetchedFlags.add(tier1Key);
            return data;
        }

        // For tiers 2-5: check if cache is still valid
        if (cached && now < cached.nextRefreshAt && !forceRefresh) {
            console.log(`[TierData] Using cached tier ${tier} (expires in ${Math.round((cached.nextRefreshAt - now) / 1000)}s)`);
            return cached.data;
        }

        // Cache expired or missing - fetch new data
        return await fetchTierData(tier);
    }, [stonkId, fetchTierData]);

    /**
     * Updates tier 1 data with new price tick using sliding window.
     */
    const updateTier1WithRealtimePrice = useCallback((price: number) => {
        const tier1Key = `${stonkId}:1`;
        if (!tier1FetchedFlags.has(tier1Key)) return;

        const cached = getFromGlobalCache(stonkId, 1);
        if (!cached || cached.data.length === 0) return;

        const newEntry: PriceHistoryEntry = {
            t: Date.now(),
            p: price,
            v: 0,
        };

        // Sliding window: remove oldest, add newest
        let newData = [...cached.data];
        if (newData.length >= TIER_CONFIG[1].entries) {
            newData = newData.slice(1); // Remove oldest
        }
        newData.push(newEntry);

        // Update global cache
        setInGlobalCache(stonkId, 1, {
            ...cached,
            data: newData,
        });

        // Update display if tier 1 is selected - trigger re-render
        if (selectedTier === 1) {
            setCurrentData([...newData]); // Create new array reference to trigger re-render
        }
    }, [stonkId, selectedTier]);

    // Initial fetch for selected tier on mount/stonk change
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            const data = await getTierDataWithCache(selectedTier);
            setCurrentData(data);
            setLoading(false);
        };
        loadInitialData();
    }, [stonkId]); // Only re-run on stonk change

    // Handle tier selection change - use cached if available
    useEffect(() => {
        const loadSelectedTier = async () => {
            const cached = getFromGlobalCache(stonkId, selectedTier);
            const now = Date.now();

            // If we have valid cache, use it immediately without loading state
            if (cached && (selectedTier === 1 || now < cached.nextRefreshAt)) {
                setCurrentData(cached.data);
                return;
            }

            // Need to fetch
            setLoading(true);
            const data = await getTierDataWithCache(selectedTier);
            setCurrentData(data);
            setLoading(false);
        };
        loadSelectedTier();
    }, [selectedTier, stonkId, getTierDataWithCache]);

    // Handle realtime price updates for tier 1 sliding window
    useEffect(() => {
        if (currentPrice > 0 && currentPrice !== lastPriceUpdate) {
            setLastPriceUpdate(currentPrice);
            updateTier1WithRealtimePrice(currentPrice);
        }
    }, [currentPrice, lastPriceUpdate, updateTier1WithRealtimePrice]);

    // Auto-refresh interval - check if current tier's cache is stale and refresh
    useEffect(() => {
        // Only auto-refresh for tiers 2-5 while viewing them
        if (selectedTier === 1) return;

        const checkAndRefresh = async () => {
            const cached = getFromGlobalCache(stonkId, selectedTier);
            const now = Date.now();

            if (cached && now >= cached.nextRefreshAt) {
                console.log(`[TierData] Auto-refreshing stale tier ${selectedTier}`);
                const data = await fetchTierData(selectedTier);
                setCurrentData(data);
            }
        };

        // Check every 5 seconds if cache is stale
        const interval = setInterval(checkAndRefresh, 5000);
        return () => clearInterval(interval);
    }, [selectedTier, stonkId, fetchTierData]);

    const tierLabels = useMemo<Record<TickerTier, string>>(() => ({
        1: TIER_CONFIG[1].label,
        2: TIER_CONFIG[2].label,
        3: TIER_CONFIG[3].label,
        4: TIER_CONFIG[4].label,
        5: TIER_CONFIG[5].label,
    }), []);

    return {
        currentData,
        selectedTier,
        setSelectedTier,
        loading,
        tierLabels,
    };
}
