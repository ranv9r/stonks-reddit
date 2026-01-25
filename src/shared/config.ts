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
export const STARTING_BALANCE = 1000000; // 10,000.00 coins

/** Default virtual liquidity for new stonks (controls volatility) */
export const DEFAULT_VIRTUAL_LIQUIDITY = 10000000; // 100,000.00

/** Minimum price floor for any stonk (in cents) */
export const MIN_PRICE = 1; // 0.01 coins

/** Default base price for new stonks (in cents) */
export const DEFAULT_BASE_PRICE = 100; // 1.00 coin

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

// ============================================
// REDIS KEY PATTERNS
// ============================================

export const REDIS_KEYS = {
  /** Global game configuration */
  GAME_CONFIG: 'game:config',

  /** Last tick timestamp */
  LAST_TICK: 'game:lastTick',

  /** Set of all stonk IDs */
  STONKS_LIST: 'stonks:list',

  /** Stonk state hash - use with stonkId */
  stonkState: (stonkId: string) => `stonk:${stonkId}:state`,

  /** Stonk batch aggregation hash - use with stonkId */
  stonkBatch: (stonkId: string) => `stonk:${stonkId}:batch`,

  /** Stonk price history sorted set - use with stonkId */
  stonkHistory: (stonkId: string) => `stonk:${stonkId}:history`,

  /** User data hash - use with oderId */
  userData: (userId: string) => `user:${userId}`,

  /** Leaderboard sorted set */
  LEADERBOARD: 'leaderboard',
} as const;
