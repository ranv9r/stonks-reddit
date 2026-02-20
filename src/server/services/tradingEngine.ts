/**
 * Trading engine service for Meme Stonks.
 * Handles trade execution with AMM pricing and cooldown protection.
 * 
 * Key features:
 * - Constant-product AMM (k = x * y)
 * - Sell-first, buy-later execution order
 * - $10,000/min cooldown per user per stonk
 */

import { USER_SPEND_LIMIT, SELL_SPEND_LIMIT, SELL_COOLDOWN_WINDOW_MS, RESERVE_FLOOR_PRICE } from '../../shared/config';
import type { Portfolio, AMMState, SpendLimitResult } from '../../shared/types/stonks';
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

    // 1. Get user first — spendData is embedded in the user hash, so this is 0 extra Redis calls
    const user = await redisService.getOrCreateUser(userId, startingBalance);

    // 2. Inline spend limit check using user.spendData (no separate Redis call needed)
    const currentBucket = Math.floor(Date.now() / 60000); // Changes every 60 seconds
    const stonkSpend = user.spendData?.[stonkId];
    const spentThisBucket = (stonkSpend?.bucket === currentBucket) ? stonkSpend.amount : 0;
    const remaining = USER_SPEND_LIMIT - spentThisBucket;

    let actualAmount = amount;

    if (remaining <= 0) {
        // Fully blocked — calculate accurate seconds left in this minute window
        const secsLeft = 60 - (Math.floor(Date.now() / 1000) % 60);
        return {
            success: false,
            message: `Cooldown active. You've spent $${(spentThisBucket / 100).toFixed(2)} of $${(USER_SPEND_LIMIT / 100).toFixed(2)} on this stonk. Try again in ~${secsLeft}s.`,
        };
    }

    // Cap to remaining allowance if needed (partial order)
    if (amount > remaining) {
        actualAmount = remaining;
    }

    // 3. Get Stonk (from cache for optimization)
    const stonk = redisService.getStonkFromCache(stonkId) || await redisService.getStonk(stonkId);

    if (!stonk) return { success: false, message: 'Stonk not found.' };
    if (!stonk.active) return { success: false, message: 'Market closed for this stonk.' };

    // 4. Balance check — cap to what user can actually afford
    actualAmount = Math.min(actualAmount, user.walletBalance);

    if (actualAmount <= 0) {
        return { success: false, message: 'Insufficient funds or spend limit reached.' };
    }

    // --- INSTANT EXECUTION (Fixed Price) ---

    // 5. Calculate result using CURRENT price (No slippage for user)
    const currentPrice = stonk.currentPrice;
    const stockDistributed = actualAmount / currentPrice;

    // 6. Add to Batch (direct Redis write for reliability)
    await redisService.addBuyVolume(stonk.id, actualAmount);

    // 7. Build updated portfolio
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

    // 8. Build updated spendData — update this bucket's spend for the stonk
    const updatedSpendData = {
        ...user.spendData,
        [stonkId]: { bucket: currentBucket, amount: spentThisBucket + actualAmount },
    };

    // 9. Update wallet, portfolio, and spendData atomically in a single HSET (no extra Redis call)
    await redisService.atomicUpdateUserTrade(userId, -actualAmount, updatedPortfolio, user.walletBalance, updatedSpendData);

    const message = actualAmount < amount
        ? `Partial buy for $${(actualAmount / 100).toFixed(2)} (${stockDistributed.toFixed(4)} shares). Spend limit reached.`
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

    const currentPrice = stonk.currentPrice;

    // --- SELL COOLDOWN CHECK ---
    // Uses a separate 'sell:' prefixed key in spendData to not interfere with buy limits
    // Sell uses 1-hour buckets (vs 1-minute for buys)
    const sellBucketMs = SELL_COOLDOWN_WINDOW_MS;
    const currentSellBucket = Math.floor(Date.now() / sellBucketMs);
    const sellSpendKey = `sell:${stonkId}`;
    const sellSpend = user.spendData?.[sellSpendKey];
    const sellSpentThisBucket = (sellSpend?.bucket === currentSellBucket) ? sellSpend.amount : 0;
    const sellRemaining = SELL_SPEND_LIMIT - sellSpentThisBucket;

    if (sellRemaining <= 0) {
        const msLeft = sellBucketMs - (Date.now() % sellBucketMs);
        const minsLeft = Math.ceil(msLeft / 60000);
        return {
            success: false,
            message: `Sell cooldown active. You've sold $${(sellSpentThisBucket / 100).toFixed(2)} of $${(SELL_SPEND_LIMIT / 100).toFixed(2)} on this stonk this hour. Try again in ~${minsLeft}min.`,
        };
    }

    // Cap quantity by sell spend limit
    const maxSellValue = sellRemaining;
    const maxSellQty = maxSellValue / currentPrice;
    let actualQuantity = Math.min(quantity, maxSellQty);

    // Also cap to what user actually owns
    actualQuantity = Math.min(actualQuantity, holding.qty);

    if (actualQuantity <= 0) {
        return {
            success: false,
            message: `Sell amount too small or sell limit reached.`,
        };
    }

    // --- INSTANT EXECUTION (Fixed Price) ---
    const actualValue = actualQuantity * currentPrice;

    // Add to Batch (direct Redis write for reliability)
    await redisService.addSellVolume(stonkId, actualQuantity);

    // Build updated portfolio (Remove Shares)
    const updatedPortfolio: Portfolio = { ...user.portfolio };
    updatedPortfolio[stonkId] = {
        ...holding,
        qty: holding.qty - actualQuantity,
    };

    // Remove from portfolio if zero (or near zero) shares
    if (updatedPortfolio[stonkId].qty <= 0.0001) {
        delete updatedPortfolio[stonkId];
    }

    // Build updated spendData — track sell spending in separate 'sell:' key
    const updatedSpendData = {
        ...user.spendData,
        [sellSpendKey]: { bucket: currentSellBucket, amount: sellSpentThisBucket + Math.round(actualValue) },
    };

    // Update wallet, portfolio, and spendData atomically
    await redisService.atomicUpdateUserTrade(userId, Math.round(actualValue), updatedPortfolio, user.walletBalance, updatedSpendData);

    const message = actualQuantity < quantity
        ? `Partial sell for ${actualQuantity.toFixed(4)} shares ($${(actualValue / 100).toFixed(2)}). Sell limit reached.`
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

        // --- RESERVE FLOOR: Prevent price from crashing below RESERVE_FLOOR_PRICE ---
        // If the new reserves would produce a price below the floor,
        // clamp xReal so that price = RESERVE_FLOOR_PRICE
        const xTotal = newState.xVirt + newState.xReal;
        const yTotal = newState.yVirt + newState.yReal;
        if (yTotal > 0) {
            const unclamped = xTotal / yTotal;
            if (unclamped < RESERVE_FLOOR_PRICE) {
                // Clamp: xVirt + xReal = RESERVE_FLOOR_PRICE * yTotal
                newState.xReal = (RESERVE_FLOOR_PRICE * yTotal) - newState.xVirt;
                console.log(`[Batch] ⚠️ Reserve floor activated for ${stonk.ticker}: clamped price to $${(RESERVE_FLOOR_PRICE / 100).toFixed(2)}`);
            }
        }

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
