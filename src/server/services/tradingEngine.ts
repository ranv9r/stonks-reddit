/**
 * Trading engine service for Meme Stonks.
 * Handles trade execution with AMM pricing and cooldown protection.
 * 
 * Key features:
 * - Constant-product AMM (k = x * y)
 * - Sell-first, buy-later execution order
 * - $10,000/min cooldown per user per stonk
 */

import { USER_SPEND_LIMIT } from '../../shared/config';
import type { Portfolio, AMMState, BatchOrder, SpendLimitResult } from '../../shared/types/stonks';
import * as redisService from './redis';
import * as ammEngine from './ammEngine';

// ============================================
// PRICE ESTIMATION (for UI previews)
// ============================================

/**
 * Estimates the price after a potential trade.
 * Used for showing users estimated outcomes before submitting.
 */
export async function estimateTradePrice(
    stonkId: string,
    action: 'buy' | 'sell',
    amount: number
): Promise<{ estimatedPrice: number; estimatedQuantity: number; priceImpact: number }> {
    const state = await redisService.getAMMState(stonkId);
    if (!state) {
        throw new Error('Stonk not found');
    }

    if (action === 'buy') {
        const estimate = ammEngine.estimateBuy(state, amount);
        return {
            estimatedPrice: estimate.estimatedPrice,
            estimatedQuantity: estimate.estimatedShares,
            priceImpact: estimate.priceImpact,
        };
    } else {
        const estimate = ammEngine.estimateSell(state, amount);
        return {
            estimatedPrice: estimate.estimatedPrice,
            estimatedQuantity: amount,
            priceImpact: estimate.priceImpact,
        };
    }
}

// ============================================
// TRADE EXECUTION WITH COOLDOWN
// ============================================

/**
 * Executes a buy order by adding to the batch.
 * Enforces per-stonk cooldown limits.
 * Deducts from user wallet immediately but shares are credited after tick.
 */
export async function executeBuy(
    userId: string,
    stonkId: string,
    amount: number, // Amount in coins (cents)
    startingBalance: number
): Promise<{ success: boolean; message: string; actualAmount?: number }> {
    // Check cooldown limit first (uses in-memory cache, 0 Redis calls on cache hit)
    const limitCheck = await redisService.checkSpendLimitCached(userId, stonkId, amount);

    let actualAmount = amount;
    if (!limitCheck.allowed) {
        if (limitCheck.cappedAmount && limitCheck.cappedAmount > 0) {
            // Partial order - cap to remaining
            actualAmount = limitCheck.cappedAmount;
        } else {
            // No remaining allowance
            const remainingSeconds = 60; // Approximate, actual TTL unknown
            return {
                success: false,
                message: `Cooldown active. You've spent $${(limitCheck.spent / 100).toFixed(2)} of $${(USER_SPEND_LIMIT / 100).toFixed(2)} on this stonk. Try again in ~${remainingSeconds}s.`,
            };
        }
    }

    // 1. Get User & Stonk (stonk from cache for optimization)
    const user = await redisService.getOrCreateUser(userId, startingBalance);
    const stonk = redisService.getStonkFromCache(stonkId) || await redisService.getStonk(stonkId);

    if (!stonk) return { success: false, message: 'Stonk not found.' };
    if (!stonk.active) return { success: false, message: 'Market closed for this stonk.' };

    // 2. Balance Check (reuse limitCheck.remaining from earlier - no extra Redis call)
    actualAmount = Math.min(actualAmount, user.walletBalance, limitCheck.remaining);

    if (actualAmount <= 0) {
        return { success: false, message: 'Insufficient funds or spend limit reached.' };
    }

    // --- INSTANT EXECUTION (Fixed Price) ---

    // 1. Calculate result using CURRENT price (No slippage for user)
    const currentPrice = stonk.currentPrice;
    const stockDistributed = actualAmount / currentPrice;

    // 2. Add to Batch (direct Redis write for reliability)
    await redisService.addBuyVolume(stonk.id, actualAmount);

    // 3. Build updated portfolio
    const updatedPortfolio: Portfolio = { ...user.portfolio };
    const existingHolding = updatedPortfolio[stonkId];

    if (existingHolding) {
        // Calculate new weighted moving average price
        const totalCost = (existingHolding.qty * existingHolding.avgPrice) + actualAmount;
        const totalQty = existingHolding.qty + stockDistributed;

        updatedPortfolio[stonkId] = {
            qty: totalQty,
            avgPrice: totalCost / totalQty
        };
    } else {
        // New holding
        updatedPortfolio[stonkId] = {
            qty: stockDistributed,
            avgPrice: currentPrice // User bought at current price
        };
    }

    // 4. Update wallet and portfolio (OPTIMIZED: single HSET with currentBalance)
    await redisService.atomicUpdateUserTrade(userId, -actualAmount, updatedPortfolio, user.walletBalance);

    // 5. Record spending for cooldown (local accumulator, 0 Redis calls!)
    redisService.recordSpendingLocal(userId, stonkId, actualAmount);

    const message = actualAmount < amount
        ? `Partial buy for $${(actualAmount / 100).toFixed(2)} (${stockDistributed.toFixed(4)} shares).`
        : `Bought ${stockDistributed.toFixed(4)} shares for $${(actualAmount / 100).toFixed(2)}.`;

    return {
        success: true,
        message,
        actualAmount,
    };
}

/**
 * Executes a sell order by adding to the batch.
 * Enforces per-stonk cooldown limits based on sell value.
 * Shares are deducted immediately but coins are credited after tick.
 */
export async function executeSell(
    userId: string,
    stonkId: string,
    quantity: number, // Number of shares to sell
    startingBalance: number
): Promise<{ success: boolean; message: string; actualQuantity?: number }> {
    // Get or create user
    const user = await redisService.getOrCreateUser(userId, startingBalance);

    // Check stonk exists and is active (from cache for optimization)
    const cachedStonk = redisService.getStonkFromCache(stonkId);
    const stonk = cachedStonk || await redisService.getStonk(stonkId);

    if (!stonk || !stonk.active) {
        return {
            success: false,
            message: 'Stonk not found or not active.',
        };
    }

    // Check user has enough shares
    const holding = user.portfolio[stonkId];
    if (!holding || holding.qty < quantity) {
        const owned = holding?.qty || 0;
        const val = (owned * stonk.currentPrice) / 100;
        return {
            success: false,
            message: `Insufficient shares. You own ${owned.toFixed(2)} ($${val.toFixed(2)}).`,
        };
    }

    // Sell Limit: REMOVED. Users can always sell.
    // We only verify they have the shares.
    const actualQuantity = quantity;

    if (actualQuantity <= 0) {
        return {
            success: false,
            message: `Sell amount too small.`,
        };
    }

    // --- INSTANT EXECUTION (Fixed Price) ---
    // Batching: We pay the user NOW at current price, but update AMM state LATER in tick.

    // 1. Calculate Value (No Slippage)
    const currentPrice = stonk.currentPrice;
    const actualValue = actualQuantity * currentPrice;

    // 2. Add to Batch (direct Redis write for reliability)
    await redisService.addSellVolume(stonkId, actualQuantity);

    // 3. Build updated portfolio (Remove Shares)
    const updatedPortfolio: Portfolio = { ...user.portfolio };
    updatedPortfolio[stonkId] = {
        ...holding,
        qty: holding.qty - actualQuantity,
    };

    // Remove from portfolio if zero (or near zero) shares
    if (updatedPortfolio[stonkId].qty <= 0.0001) {
        delete updatedPortfolio[stonkId];
    }

    // 4. Update wallet and portfolio (OPTIMIZED: single HSET with currentBalance)
    await redisService.atomicUpdateUserTrade(userId, Math.round(actualValue), updatedPortfolio, user.walletBalance);

    // 5. Record spending: SKIPPED for Sell.
    // Sells do not consume the Buy limit.

    const message = actualQuantity < quantity
        ? `Partial sell for ${actualQuantity.toFixed(4)} shares ($${(actualValue / 100).toFixed(2)}).`
        : `Sold ${actualQuantity.toFixed(4)} shares for $${(actualValue / 100).toFixed(2)}.`;

    return {
        success: true,
        message,
        actualQuantity,
    };
}

// ============================================
// BATCH RESOLUTION (Called by scheduler job)
// ============================================

/**
 * Resolves all pending batches using AMM engine.
 * This should be called by the 5-second tick job.
 * 
 * Execution order: SELL-FIRST, BUY-LATER
 */
/**
 * Resolves all pending batches using AMM engine.
 * This should be called by the 5-second tick job.
 * 
 * Aggregates all buy/sell volume since last tick and updates the price.
 */
export async function resolveBatches(): Promise<void> {
    const stonks = await redisService.getAllStonks();

    await Promise.all(stonks.map(async (stonk) => {
        const { buyVolume, sellVolume } = await redisService.getAndResetBatch(stonk.id);

        // Skip if no volume
        if (buyVolume === 0 && sellVolume === 0) return;

        const preBatchPrice = stonk.currentPrice;

        // --- CRITICAL FIX: Match AMM state to ACTUAL traded amounts ---
        // Users traded at FIXED PRICE, so we must update reserves based on
        // what actually happened, not what the AMM curve would have given.

        // At fixed price P:
        // - Buys: users paid buyVolume cash, got buyVolume/P shares
        // - Sells: users gave sellVolume shares, got sellVolume*P cash

        const sharesFromBuys = buyVolume / preBatchPrice;  // Shares distributed to buyers
        const cashFromSells = sellVolume * preBatchPrice; // Cash paid to sellers

        // Net effect on reserves (from the pool's perspective):
        // - Cash: +buyVolume (from buyers) -cashFromSells (to sellers)
        // - Shares: -sharesFromBuys (to buyers) +sellVolume (from sellers)

        const netCashChange = buyVolume - cashFromSells;
        const netShareChange = sellVolume - sharesFromBuys;

        // Build new AMM state with direct reserve update
        const newState: AMMState = {
            xVirt: stonk.xVirt,
            yVirt: stonk.yVirt,
            xReal: stonk.xReal + netCashChange,
            yReal: stonk.yReal + netShareChange,
        };

        // New price from updated reserves
        const newPrice = ammEngine.getSpotPrice(newState);
        const totalVol = Math.abs(buyVolume) + Math.abs(cashFromSells);

        await redisService.updateStonkAMMState(
            stonk.id,
            newState,
            newPrice,
            Math.round(totalVol)
        );

        console.log(`[Batch] ${stonk.ticker}: Buys=$${buyVolume / 100} (${sharesFromBuys.toFixed(4)}sh), Sells=${sellVolume.toFixed(4)}sh ($${cashFromSells / 100}) -> Price: $${preBatchPrice / 100} -> $${newPrice / 100}`);
    }));
}

// ============================================
// PORTFOLIO CALCULATIONS
// ============================================

/**
 * Calculates the current value and P/L for a user's portfolio.
 */
export async function calculatePortfolioValue(
    userId: string,
    startingBalance: number
): Promise<{
    totalValue: number;
    holdings: Array<{
        stonkId: string;
        quantity: number;
        currentValue: number;
        profitLoss: number;
    }>;
}> {
    const user = await redisService.getOrCreateUser(userId, startingBalance);
    const holdings: Array<{
        stonkId: string;
        quantity: number;
        currentValue: number;
        profitLoss: number;
    }> = [];

    let totalValue = 0;

    for (const [stonkId, holding] of Object.entries(user.portfolio)) {
        const stonk = await redisService.getStonk(stonkId);
        if (!stonk || !holding) continue;

        const qty = holding.qty || 0;
        const avgPrice = holding.avgPrice || 0;

        const currentValue = qty * stonk.currentPrice;
        const costBasis = qty * avgPrice;
        const profitLoss = currentValue - costBasis;

        holdings.push({
            stonkId,
            quantity: qty,
            currentValue,
            profitLoss,
        });

        totalValue += currentValue;
    }

    return { totalValue, holdings };
}

/**
 * Calculates net worth (wallet + portfolio value).
 */
export async function calculateNetWorth(
    userId: string,
    startingBalance: number
): Promise<number> {
    const user = await redisService.getOrCreateUser(userId, startingBalance);
    const { totalValue } = await calculatePortfolioValue(userId, startingBalance);

    return user.walletBalance + totalValue;
}

/**
 * Gets user's spend limit status for a specific stonk.
 */
export async function getUserSpendLimit(
    userId: string,
    stonkId: string
): Promise<SpendLimitResult> {
    const { spent, remaining } = await redisService.getUserSpending(userId, stonkId);
    return {
        allowed: remaining > 0,
        remaining,
        spent,
    };
}
