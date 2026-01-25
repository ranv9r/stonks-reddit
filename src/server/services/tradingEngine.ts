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
    // Check cooldown limit first
    const limitCheck = await redisService.checkSpendLimit(userId, stonkId, amount);
    
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

    // Get or create user
    const user = await redisService.getOrCreateUser(userId, startingBalance);

    // Check sufficient balance
    if (user.walletBalance < actualAmount) {
        return {
            success: false,
            message: `Insufficient balance. You have $${(user.walletBalance / 100).toFixed(2)}.`,
        };
    }

    // Check stonk exists and is active
    const stonk = await redisService.getStonk(stonkId);
    if (!stonk || !stonk.active) {
        return {
            success: false,
            message: 'Stonk not found or not active.',
        };
    }

    // --- INSTANT EXECUTION ---

    // 1. Calculate result using AMM engine
    const currentState: AMMState = {
        xVirt: stonk.xVirt,
        yVirt: stonk.yVirt,
        xReal: stonk.xReal,
        yReal: stonk.yReal,
    };

    const { newState, stockDistributed, avgBuyPrice } = ammEngine.executeBuyBatch(
        currentState,
        actualAmount
    );

    // 2. Update Stonk State in Redis
    const newPrice = ammEngine.getSpotPrice(newState);
    await redisService.updateStonkAMMState(
        stonk.id,
        newState,
        newPrice,
        actualAmount // Add to volume
    );

    // 3. Update User Wallet (Deduct Cash)
    await redisService.updateWalletBalance(userId, -actualAmount);

    // 4. Update User Portfolio (Add Shares)
    const updatedPortfolio: Portfolio = { ...user.portfolio };
    const existingHolding = updatedPortfolio[stonkId];

    if (existingHolding) {
        // Calculate new weighted moving average price
        const totalCost = (existingHolding.qty * existingHolding.avgPrice) + (stockDistributed * avgBuyPrice);
        const totalQty = existingHolding.qty + stockDistributed;
        
        updatedPortfolio[stonkId] = {
            qty: totalQty,
            avgPrice: totalCost / totalQty
        };
    } else {
        // New holding
        updatedPortfolio[stonkId] = {
            qty: stockDistributed,
            avgPrice: avgBuyPrice
        };
    }
    
    await redisService.updatePortfolio(userId, updatedPortfolio);

    // 5. Record spending for cooldown
    await redisService.recordSpending(userId, stonkId, actualAmount);

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

    // Check stonk exists and is active
    const stonk = await redisService.getStonk(stonkId);
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

    // Calculate estimated sell value for cooldown check
    // Note: Actual value might differ slightly after execution due to price impact
    const estimatedValue = Math.round(quantity * stonk.currentPrice);
    
    // Check cooldown limit (sell limits based on estimated value)
    const limitCheck = await redisService.checkSpendLimit(userId, stonkId, estimatedValue);
    
    let actualQuantity = quantity;
    
    if (!limitCheck.allowed) {
        if (limitCheck.cappedAmount && limitCheck.cappedAmount > 0) {
            // Partial order - cap based on allowed value
            // We approximate shares: allowedValue / currentPrice
            actualQuantity = limitCheck.cappedAmount / stonk.currentPrice;
        } else {
            // No remaining allowance
            return {
                success: false,
                message: `Cooldown active. You've traded $${(limitCheck.spent / 100).toFixed(2)} of $${(USER_SPEND_LIMIT / 100).toFixed(2)} on this stonk. Try again soon.`,
            };
        }
    }

    // Verify we can still sell the capped quantity
    if (actualQuantity > holding.qty) {
        actualQuantity = holding.qty;
    }

    if (actualQuantity <= 0) {
         return {
            success: false,
            message: `Sell amount too small.`,
        };
    }

    // --- INSTANT EXECUTION ---

    // 1. Calculate result using AMM engine
    const currentState: AMMState = {
        xVirt: stonk.xVirt,
        yVirt: stonk.yVirt,
        xReal: stonk.xReal,
        yReal: stonk.yReal,
    };

    // Calculate actual shares to sell (rounding/types check if needed, but number is fine)
    
    const { newState, cashPaidOut, avgSellPrice } = ammEngine.executeSellBatch(
        currentState,
        actualQuantity
    );
    
    const actualValue = cashPaidOut;

    // 2. Update Stonk State in Redis
    const newPrice = ammEngine.getSpotPrice(newState);
    await redisService.updateStonkAMMState(
        stonk.id,
        newState,
        newPrice,
        Math.round(actualValue) // Add to volume
    );

    // 3. Update User Wallet (Credit Cash)
    await redisService.updateWalletBalance(userId, Math.round(actualValue));

    // 4. Update User Portfolio (Remove Shares)
    const updatedPortfolio: Portfolio = { ...user.portfolio };
    updatedPortfolio[stonkId] = {
        ...holding,
        qty: holding.qty - actualQuantity,
    };

    // Remove from portfolio if zero (or near zero) shares
    if (updatedPortfolio[stonkId].qty <= 0.0001) {
        delete updatedPortfolio[stonkId];
    }

    await redisService.updatePortfolio(userId, updatedPortfolio);

    // 5. Record spending for cooldown
    await redisService.recordSpending(userId, stonkId, Math.round(actualValue));

    const message = actualQuantity < quantity
        ? `Partial sell for ${actualQuantity.toFixed(4)} shares ($${(actualValue/100).toFixed(2)}).`
        : `Sold ${actualQuantity.toFixed(4)} shares for $${(actualValue/100).toFixed(2)}.`;

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
export async function resolveBatches(): Promise<void> {
    // Disabled. Trades are now instant.
    // We can clear any stuck batches if we wanted, but ignoring is fine.
    await redisService.setLastTick(Date.now());
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
