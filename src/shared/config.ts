/**
 * Global configuration for the Meme Stonks game.
 * All game constants and tuneable parameters are defined here.
 */

// ============================================
// TIMING CONFIGURATION
// ============================================

/** Price update interval in milliseconds (5 seconds) */
export const TICK_INTERVAL_MS = 5000;

/** Leaderboard update cron expression (every 30 minutes) */
export const LEADERBOARD_CRON = '*/30 * * * *';

/** Price tick cron expression (every 5 seconds) */
export const PRICE_TICK_CRON = '*/5 * * * * *';

// ============================================
// ECONOMY CONFIGURATION
// ============================================

/** Starting balance for each user when event starts (in cents) */
export const STARTING_BALANCE = 1000000; // $10,000.00

/** Default base price for new stonks (in cents) - $100 */
export const DEFAULT_BASE_PRICE = 10000; // $100.00

/** Minimum price floor for any stonk (in cents) — matches RESERVE_FLOOR_PRICE */
export const MIN_PRICE = 2000; // $20.00 minimum

// ============================================
// AMM (Automated Market Maker) CONFIGURATION
// Constant-product formula: k = x * y
// ============================================

/**
 * Default virtual cash reserve for new stonks
 * Combined with yVirt, this sets the initial liquidity depth
 * Higher values = less volatile price movements
 * 
 * VOLATILITY TARGET: $4,000 buy → ~0.8% price change
 */
export const DEFAULT_X_VIRT = 100000000; // $1,000,000 virtual cash (in cents)

/**
 * Default virtual stock reserve for new stonks
 * Calculated to achieve target base price: price = xVirt / yVirt
 * $1,000,000 / 10,000 = $100 base price
 */
export const DEFAULT_Y_VIRT = 10000; // 10,000 virtual shares

/**
 * Initial k value (product of virtual reserves)
 * k = 1,000,000 * 10,000 = 10 trillion (in cents²)
 * This creates DEEP liquidity = stable prices
 */
export const INITIAL_K = DEFAULT_X_VIRT * DEFAULT_Y_VIRT;

/**
 * Dynamic liquidity scaling dampening factor.
 * Virtual reserves scale proportionally to real reserves:
 *   effectiveVirt = virt × (1 + ALPHA × |real| / virt)
 * Higher alpha = more dampening as stock grows.
 */
export const LIQUIDITY_SCALE_ALPHA = 0.5;

// ============================================
// COOLDOWN / RATE LIMITING CONFIGURATION
// Prevents pump-and-dump exploits
// ============================================

/**
 * Maximum amount a user can spend per stonk per cooldown window (in cents)
 * Applies to BUY orders (cash spent)
 */
export const USER_SPEND_LIMIT = 2000000; // $20,000 per stonk

/**
 * Maximum sell VALUE per stonk per sell cooldown window (in cents)
 * Applies to SELL orders (value at current price)
 * Prevents unlimited dumping that crashes the market
 */
export const SELL_SPEND_LIMIT = 30000000; // $300,000 per stonk per 30 min

/**
 * Sell cooldown window in milliseconds (30 minutes)
 * Separate from buy cooldown to allow different rate limiting
 */
export const SELL_COOLDOWN_WINDOW_MS = 1800000; // 30 minutes

/**
 * Reserve floor price (in cents)
 * The AMM reserves will be clamped so the price never drops below this.
 * Prevents complete market crashes from draining virtual liquidity.
 */
export const RESERVE_FLOOR_PRICE = 2000; // $20.00 minimum

/**
 * Cooldown window duration in milliseconds
 * User's spending on each stonk resets after this period
 */
export const COOLDOWN_WINDOW_MS = 60000; // 1 minute

/**
 * Cooldown window in seconds (for Redis TTL)
 */
export const COOLDOWN_WINDOW_SECONDS = 60;

// ============================================
// LEADERBOARD CONFIGURATION
// ============================================

/** Number of top users shown on leaderboard */
export const LEADERBOARD_TOP_N = 10;

// ============================================
// DATA RETENTION
// ============================================

/** Days to keep price history data */
export const PRICE_HISTORY_RETENTION_DAYS = 7;

/** Max price history entries per stonk */
export const MAX_PRICE_HISTORY_ENTRIES = 10000;

/** Max number of chat messages to fetch and display in the live chat window */
export const CHAT_MAX_MESSAGES = 100;

// ============================================
// REDIS KEY PATTERNS
// ============================================

export const REDIS_KEYS = {
    /** Global game configuration */
    GAME_CONFIG: 'game:config',

    /** Set of all stonk IDs */
    STONKS_LIST: 'stonks:list',

    /** Stonk state hash - use with stonkId */
    stonkState: (stonkId: string) => `stonk:${stonkId}:state`,

    /** Stonk batch aggregation hash - use with stonkId */
    stonkBatch: (stonkId: string) => `stonk:${stonkId}:batch`,

    /** Stonk price history sorted set - use with stonkId */
    stonkHistory: (stonkId: string) => `stonk:${stonkId}:history`,

    /** User data hash - use with userId */
    userData: (userId: string) => `user:${userId}`,

    /** User spending cooldown per stonk - auto-expires with TTL */
    userSpend: (userId: string, stonkId: string) => `user:${userId}:spend:${stonkId}`,

    /** Leaderboard sorted set */
    LEADERBOARD: 'leaderboard',

    /** Stonk tiered price history sorted sets - use with stonkId and tier (1-5) */
    stonkHistoryTier: (stonkId: string, tier: number) => `stonk:${stonkId}:history${tier}`,
} as const;

// ============================================
// STOCK TICKER TIER CONFIGURATION
// Each tier stores 360 ticks at different intervals.
// Higher tiers aggregate from lower tiers.
// ============================================

export const TICKER_TIERS = {
    /** Tier 1: 5s intervals, 360 entries = 30 min coverage. Source: current price */
    1: { interval: 5, entries: 360, ttl: 5, sourceTier: null, avgCount: null },
    /** Tier 2: 30s intervals, 360 entries = 3 hour coverage. Source: avg 6 from tier 1 */
    2: { interval: 30, entries: 360, ttl: 30, sourceTier: 1, avgCount: 6 },
    /** Tier 3: 5m intervals, 360 entries = 30 hour coverage. Source: avg 10 from tier 2 */
    3: { interval: 300, entries: 360, ttl: 300, sourceTier: 2, avgCount: 10 },
    /** Tier 4: 30m intervals, 360 entries = 7.5 day coverage. Source: avg 6 from tier 3 */
    4: { interval: 1800, entries: 360, ttl: 1800, sourceTier: 3, avgCount: 6 },
    /** Tier 5: 2h intervals, 360 entries = 30 day coverage. Source: avg 4 from tier 4 */
    5: { interval: 7200, entries: 360, ttl: 7200, sourceTier: 4, avgCount: 4 },
} as const;

export type TickerTier = keyof typeof TICKER_TIERS;

