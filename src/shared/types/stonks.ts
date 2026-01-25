/**
 * TypeScript types for the Meme Stonks game.
 * Shared between client and server.
 */

// ============================================
// STONK TYPES
// ============================================

/** Stonk state stored in Redis */
export interface StonkState {
    id: string;
    name: string;
    ticker: string;
    icon: string;
    basePrice: number;       // Initial price (cents)
    currentPrice: number;    // Current price (cents)
    virtualLiquidity: number; // Controls volatility
    totalVolume: number;     // Lifetime trading volume
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
    qty: number;       // Quantity owned
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
    eventStartTime: number | null;
    tickInterval: number;
    startingBalance: number;
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
}
