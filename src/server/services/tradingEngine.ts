/**
 * Trading engine service for Meme Stonks.
 * Handles price calculation and trade execution.
 */

import { MIN_PRICE } from '../../shared/config';
import type { Portfolio } from '../../shared/types/stonks';
import * as redisService from './redis';

// ============================================
// PRICE CALCULATION
// ============================================

/**
 * Calculates new price based on buy/sell volume imbalance.
 * Uses the placeholder linear formula from requirements.
 * 
 * Formula: New_Price = Old_Price * (1 + (Buy_Vol - Sell_Vol) / Virtual_Liquidity)
 */
export function calculateNewPrice(
    oldPrice: number,
    buyVolume: number,
    sellVolume: number,
    virtualLiquidity: number
): number {
    // Handle edge case of zero liquidity
    if (virtualLiquidity <= 0) {
        return oldPrice;
    }

    const imbalance = (buyVolume - sellVolume) / virtualLiquidity;
    const newPrice = Math.round(oldPrice * (1 + imbalance));

    // Ensure minimum price floor
    return Math.max(newPrice, MIN_PRICE);
}

/**
 * Estimates the price after a potential trade.
 * Used for showing users estimated outcomes before submitting.
 */
export async function estimateTradePrice(
    stonkId: string,
    action: 'buy' | 'sell',
    amount: number
): Promise<{ estimatedPrice: number; estimatedQuantity: number }> {
    const stonk = await redisService.getStonk(stonkId);
    if (!stonk) {
        throw new Error('Stonk not found');
    }

    // For estimation, assume current batch is empty (worst case)
    const buyVol = action === 'buy' ? amount : 0;
    const sellVol = action === 'sell' ? amount * stonk.currentPrice : 0;

    const estimatedPrice = calculateNewPrice(
        stonk.currentPrice,
        buyVol,
        sellVol,
        stonk.virtualLiquidity
    );

    // Calculate estimated quantity for buy orders
    const estimatedQuantity = action === 'buy'
        ? Math.floor(amount / estimatedPrice)
        : amount;

    return { estimatedPrice, estimatedQuantity };
}

// ============================================
// TRADE EXECUTION
// ============================================

/**
 * Executes a buy order by adding to the batch.
 * Deducts from user wallet immediately but shares are credited after tick.
 */
export async function executeBuy(
    userId: string,
    stonkId: string,
    amount: number, // Amount in coins (cents)
    startingBalance: number
): Promise<{ success: boolean; message: string }> {
    // Get or create user
    const user = await redisService.getOrCreateUser(userId, startingBalance);

    // Check sufficient balance
    if (user.walletBalance < amount) {
        return {
            success: false,
            message: `Insufficient balance. You have ${user.walletBalance / 100} coins.`,
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

    // Deduct from wallet
    await redisService.updateWalletBalance(userId, -amount);

    // Add to batch buy volume
    await redisService.addBuyVolume(stonkId, amount);

    return {
        success: true,
        message: `Buy order for ${amount / 100} coins submitted. Will execute on next tick.`,
    };
}

/**
 * Executes a sell order by adding to the batch.
 * Shares are deducted immediately but coins are credited after tick.
 */
export async function executeSell(
    userId: string,
    stonkId: string,
    quantity: number, // Number of shares to sell
    startingBalance: number
): Promise<{ success: boolean; message: string }> {
    // Get or create user
    const user = await redisService.getOrCreateUser(userId, startingBalance);

    // Check user has enough shares
    const holding = user.portfolio[stonkId];
    if (!holding || holding.qty < quantity) {
        const owned = holding?.qty || 0;
        return {
            success: false,
            message: `Insufficient shares. You own ${owned}.`,
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

    // Deduct shares from portfolio
    const updatedPortfolio: Portfolio = { ...user.portfolio };
    updatedPortfolio[stonkId] = {
        ...holding,
        qty: holding.qty - quantity,
    };

    // Remove from portfolio if zero shares
    if (updatedPortfolio[stonkId].qty <= 0) {
        delete updatedPortfolio[stonkId];
    }

    await redisService.updatePortfolio(userId, updatedPortfolio);

    // Add to batch sell volume (convert to coin value at current price)
    const sellValue = quantity * stonk.currentPrice;
    await redisService.addSellVolume(stonkId, sellValue);

    return {
        success: true,
        message: `Sell order for ${quantity} shares submitted. Will execute on next tick.`,
    };
}

// ============================================
// BATCH RESOLUTION (Called by scheduler job)
// ============================================

/**
 * Resolves all pending batches and updates prices.
 * This should be called by the 5-second tick job.
 */
export async function resolveBatches(): Promise<void> {
    const stonks = await redisService.getAllStonks();

    for (const stonk of stonks) {
        const { buyVolume, sellVolume } = await redisService.getAndResetBatch(stonk.id);

        // Skip if no activity
        if (buyVolume === 0 && sellVolume === 0) {
            continue;
        }

        // Calculate new price
        const newPrice = calculateNewPrice(
            stonk.currentPrice,
            buyVolume,
            sellVolume,
            stonk.virtualLiquidity
        );

        // Update stonk price and history
        const totalVolume = buyVolume + sellVolume;
        await redisService.updateStonkPrice(stonk.id, newPrice, totalVolume);

        console.log(
            `[Tick] ${stonk.ticker}: ${stonk.currentPrice / 100} -> ${newPrice / 100} ` +
            `(buy: ${buyVolume / 100}, sell: ${sellVolume / 100})`
        );
    }

    // Update last tick timestamp
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
        if (!stonk) continue;

        const currentValue = holding.qty * stonk.currentPrice;
        const costBasis = holding.qty * holding.avgPrice;
        const profitLoss = currentValue - costBasis;

        holdings.push({
            stonkId,
            quantity: holding.qty,
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
