/**
 * TypeScript types for the Meme Stonks game.
 * Shared between client and server.
 */

// ============================================
// STONK TYPES
// ============================================

/**
 * Stonk state stored in Redis
 * Uses AMM (Automated Market Maker) with constant-product formula: k = x * y
 */
export interface StonkState {
    id: string;
    name: string;
    ticker: string;
    icon: string;
    imageUrl?: string;  // i.redd.it URL for stock logo

    // AMM Reserve State
    xVirt: number;      // Virtual cash reserve (base liquidity)
    yVirt: number;      // Virtual stock reserve (base liquidity)
    xReal: number;      // Real cash added from trades
    yReal: number;      // Real stock added from trades

    // Derived values (calculated, not stored)
    // xTotal = xVirt + xReal
    // yTotal = yVirt + yReal
    // k = xTotal * yTotal
    // spotPrice = xTotal / yTotal

    // Price tracking
    basePrice: number;       // Initial price at creation (cents)
    currentPrice: number;    // Current spot price (cents)

    // Volume tracking
    totalVolume: number;     // Lifetime trading volume (cents)

    // Metadata
    createdBy: string;       // Mod user ID
    createdAt: number;       // Unix timestamp
    active: boolean;
}

/** Stonk data for client display */
export interface StonkDisplay {
    id: string;
    name: string;
    ticker: string;
    icon: string;
    imageUrl?: string;
    currentPrice: number;
    priceChange: number;         // Absolute change
    priceChangePercent: number;  // Percentage change
}

/** Price history entry */
export interface PriceHistoryEntry {
    t: number;  // Timestamp (ms)
    p: number;  // Price (cents)
    v: number;  // Volume (cents)
}

// ============================================
// USER TYPES
// ============================================

/** User portfolio holding */
export interface Holding {
    qty: number;       // Quantity owned (can be fractional for AMM)
    avgPrice: number;  // Average buy price (cents)
}

/** User portfolio map */
export interface Portfolio {
    [stonkId: string]: Holding;
}

/** User data stored in Redis */
export interface UserData {
    walletBalance: number;  // Available coins (cents)
    portfolio: Portfolio;   // Stonk holdings
    joinedAt: number;       // Unix timestamp
    lastTradeAt: number;    // Unix timestamp
    tourCompleted: boolean; // Whether user has completed the guided tour
    chatConsent: boolean;   // Whether user has opted in to posting chat comments
    /** Per-stock buy spend tracking. Key = stonkId, value = { bucket: minute bucket, amount: cents spent } */
    spendData: Record<string, { bucket: number; amount: number }>;
}

/** Portfolio display for client */
export interface PortfolioDisplay {
    walletBalance: number;
    totalValue: number;
    totalProfitLoss: number;
    totalProfitLossPercent: number;
    holdings: HoldingDisplay[];
}

/** Holding display for client */
export interface HoldingDisplay {
    stonkId: string;
    ticker: string;
    icon: string;
    imageUrl?: string;
    quantity: number;
    avgBuyPrice: number;
    currentPrice: number;
    currentValue: number;
    profitLoss: number;
    profitLossPercent: number;
}

// ============================================
// TRADE TYPES
// ============================================

/** Trade action type */
export type TradeAction = 'buy' | 'sell';

/** Trade request from client */
export interface TradeRequest {
    stonkId: string;
    action: TradeAction;
    amount: number;  // Coins for buy, quantity for sell
}

/** Trade response to client */
export interface TradeResponse {
    success: boolean;
    message: string;
    pendingTickId?: number;
    estimatedPrice?: number;
    estimatedQuantity?: number;
}

/** Cooldown check result */
export interface SpendLimitResult {
    allowed: boolean;
    remaining: number;      // Remaining allowance in cents
    spent: number;          // Already spent this window in cents
    cappedAmount?: number;  // If partially allowed, max amount user can spend
}

// ============================================
// AMM TYPES
// ============================================

/** AMM state for calculations */
export interface AMMState {
    xVirt: number;
    yVirt: number;
    xReal: number;
    yReal: number;
}

/** Batch order for AMM processing */
export interface BatchOrder {
    userId: string;
    type: 'buy' | 'sell';
    amount: number;  // Cents for buy, shares for sell
}

/** Result of batch execution */
export interface BatchExecutionResult {
    tick: number;
    preBatchPrice: number;
    postBatchPrice: number;
    totalBuyVolume: number;
    totalSellVolume: number;
    priceChange: number;       // Percentage change
    newK: number;
    liquidityScaled: boolean;
    buyExecution: {
        cashAdded: number;
        stockDistributed: number;
        avgBuyPrice: number;
    } | null;
    sellExecution: {
        sharesAdded: number;
        cashPaidOut: number;
        avgSellPrice: number;
    } | null;
}

// ============================================
// LEADERBOARD TYPES
// ============================================

/** Leaderboard entry */
export interface LeaderboardEntry {
    rank: number;
    userId: string;
    username: string;
    netWorth: number;
    isCurrentUser: boolean;
}

/** Leaderboard response */
export interface LeaderboardResponse {
    topTraders: LeaderboardEntry[];
    userRank: LeaderboardEntry | null;
    totalParticipants: number;
}

// ============================================
// GAME STATE TYPES
// ============================================

/** Game configuration stored in Redis */
export interface GameConfig {
    eventActive: boolean;
    eventLocked: boolean; // When true, users can't access app (only mods can)
    eventStartTime: number | null; // Scheduled start time (null = no timer)
    tickInterval: number;
    startingBalance: number;
    flairsEnabled: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/** Market data response */
export interface MarketResponse {
    stonks: StonkDisplay[];
    walletBalance: number;
    lastUpdate: number;
}

/** Stonk detail response */
export interface StonkDetailResponse {
    stonk: StonkState;
    priceHistory: PriceHistoryEntry[];
    userHolding: Holding | null;
    spendLimit: SpendLimitResult;  // User's remaining buy/sell allowance
}

// ============================================
// CHAT TYPES
// ============================================

/** Chat message structure */
export interface ChatMessage {
    id: string;
    userId: string;
    username: string;
    text: string;
    time: number; // Unix timestamp
    permalink?: string; // Reddit comment permalink for edit/delete/report
}

/** Chat API response */
export interface ChatResponse {
    messages: ChatMessage[];
    nextCursor?: number; // For possible future pagination, currently using timestamp
}

// ============================================
// IPO TYPES
// ============================================

export type IpoStatus = 'pending' | 'listed' | 'expired';

/** IPO state stored in Redis */
export interface IpoState {
    id: string;
    name: string;
    ticker: string;
    icon: string;
    imageUrl?: string;              // optional uploaded logo url
    proposedBy: string;         // userId of proposer
    proposerName: string;       // display name of proposer
    status: IpoStatus;
    totalPot: number;           // cents collected so far
    potTarget: number;          // cents needed to list
    subscriberCount: number;    // slots filled
    maxSubscribers: number;     // total slots
    createdAt: number;          // Unix timestamp
    expiresAt: number;          // Unix timestamp (createdAt + 48h)
}

/** IPO list API response */
export interface IpoListResponse {
    ipos: IpoState[];
    userSubscriptions: string[];  // ipoIds the current user has subscribed to
    canPropose: boolean;          // false if user is on 24h cooldown or insufficient balance
    nextProposalAt: number | null; // timestamp when user can propose again
}
