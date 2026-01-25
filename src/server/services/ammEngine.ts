/**
 * AMM (Automated Market Maker) Engine
 * Implements constant-product formula: k = x * y
 * 
 * Execution order: SELL-FIRST, BUY-LATER
 * This prevents sandwich attacks and ensures fair pricing.
 */

import {
    MIN_PRICE,
    LIQUIDITY_SCALE_ALPHA,
    LIQUIDITY_SCALE_THRESHOLD,
} from '../../shared/config';
import type {
    AMMState,
    BatchOrder,
    BatchExecutionResult,
} from '../../shared/types/stonks';

// ============================================
// CORE AMM CALCULATIONS
// ============================================

/**
 * Calculate total reserves (virtual + real)
 */
export function getTotals(state: AMMState): { xTotal: number; yTotal: number } {
    return {
        xTotal: state.xVirt + state.xReal,
        yTotal: state.yVirt + state.yReal,
    };
}

/**
 * Calculate spot price from reserves
 * Formula: price = x / y
 */
export function getSpotPrice(state: AMMState): number {
    const { xTotal, yTotal } = getTotals(state);
    if (yTotal <= 0) return MIN_PRICE;
    return Math.max(Math.round(xTotal / yTotal), MIN_PRICE);
}

/**
 * Calculate invariant k
 * Formula: k = x * y
 */
export function calculateK(state: AMMState): number {
    const { xTotal, yTotal } = getTotals(state);
    return xTotal * yTotal;
}

/**
 * Check if liquidity scaling should be triggered
 */
export function shouldScaleLiquidity(buyVolume: number): boolean {
    return buyVolume > LIQUIDITY_SCALE_THRESHOLD;
}

/**
 * Scale virtual liquidity when volume exceeds threshold
 * This prevents the market from "breaking" on large orders
 */
export function scaleLiquidity(state: AMMState): AMMState {
    return {
        ...state,
        xVirt: Math.round(state.xVirt * (1 + LIQUIDITY_SCALE_ALPHA)),
        yVirt: state.yVirt * (1 + LIQUIDITY_SCALE_ALPHA),
    };
}

// ============================================
// BATCH EXECUTION
// ============================================

/**
 * Execute sell orders first (adds shares to pool, removes cash)
 * 
 * Formula for selling:
 * - New y = y + sellShares
 * - New x = k / newY
 * - Cash out = oldX - newX
 */
export function executeSellBatch(
    state: AMMState,
    totalSellShares: number
): { newState: AMMState; cashPaidOut: number; avgSellPrice: number } {
    if (totalSellShares <= 0) {
        return { newState: state, cashPaidOut: 0, avgSellPrice: 0 };
    }

    const { xTotal, yTotal } = getTotals(state);
    const k = xTotal * yTotal;

    // New reserves after adding shares
    const newYTotal = yTotal + totalSellShares;
    const newXTotal = k / newYTotal;
    const cashPaidOut = xTotal - newXTotal;

    // Calculate how this affects real reserves
    // Sellers add real stock, we pay out from virtual/real cash
    const newState: AMMState = {
        ...state,
        yReal: state.yReal + totalSellShares,
        xReal: state.xReal - cashPaidOut,
    };

    const avgSellPrice = totalSellShares > 0 ? cashPaidOut / totalSellShares : 0;

    return { newState, cashPaidOut, avgSellPrice };
}

/**
 * Execute buy orders second (adds cash to pool, removes shares)
 * 
 * Formula for buying:
 * - New x = x + buyCash
 * - New y = k / newX
 * - Shares out = oldY - newY
 */
export function executeBuyBatch(
    state: AMMState,
    totalBuyCash: number
): { newState: AMMState; stockDistributed: number; avgBuyPrice: number } {
    if (totalBuyCash <= 0) {
        return { newState: state, stockDistributed: 0, avgBuyPrice: 0 };
    }

    const { xTotal, yTotal } = getTotals(state);
    const k = xTotal * yTotal;

    // New reserves after adding cash
    const newXTotal = xTotal + totalBuyCash;
    const newYTotal = k / newXTotal;
    const stockDistributed = yTotal - newYTotal;

    // Calculate how this affects real reserves
    // Buyers add real cash, we distribute real/virtual stock
    const newState: AMMState = {
        ...state,
        xReal: state.xReal + totalBuyCash,
        yReal: state.yReal - stockDistributed,
    };

    const avgBuyPrice = stockDistributed > 0 ? totalBuyCash / stockDistributed : 0;

    return { newState, stockDistributed, avgBuyPrice };
}

/**
 * Process a complete batch of orders
 * Execution order: SELL-FIRST, BUY-LATER
 * 
 * This order is important because:
 * 1. Sells first → price dips
 * 2. Buys execute at dipped price → more favorable for buyers
 * 3. This prevents sellers from frontrunning buyers
 */
export function resolveBatch(
    initialState: AMMState,
    orders: BatchOrder[],
    tick: number
): { newState: AMMState; result: BatchExecutionResult } {
    const preBatchPrice = getSpotPrice(initialState);
    
    // Aggregate orders by type
    const totalBuyCash = orders
        .filter(o => o.type === 'buy')
        .reduce((sum, o) => sum + o.amount, 0);
    
    const totalSellShares = orders
        .filter(o => o.type === 'sell')
        .reduce((sum, o) => sum + o.amount, 0);

    let currentState = { ...initialState };
    let liquidityScaled = false;

    // Step 1: Check for liquidity scaling (Anti-Break Mechanism)
    if (shouldScaleLiquidity(totalBuyCash)) {
        currentState = scaleLiquidity(currentState);
        liquidityScaled = true;
    }

    // Step 2: Execute SELLS first (price dips)
    const sellResult = executeSellBatch(currentState, totalSellShares);
    currentState = sellResult.newState;

    // Step 3: Execute BUYS second (price pumps)
    const buyResult = executeBuyBatch(currentState, totalBuyCash);
    currentState = buyResult.newState;

    // Calculate final state
    const postBatchPrice = getSpotPrice(currentState);
    const priceChange = preBatchPrice > 0 
        ? ((postBatchPrice - preBatchPrice) / preBatchPrice) * 100 
        : 0;

    const result: BatchExecutionResult = {
        tick,
        preBatchPrice,
        postBatchPrice,
        totalBuyVolume: totalBuyCash,
        totalSellVolume: Math.round(totalSellShares * preBatchPrice), // Convert to cents
        priceChange,
        newK: calculateK(currentState),
        liquidityScaled,
        sellExecution: totalSellShares > 0 ? {
            sharesAdded: totalSellShares,
            cashPaidOut: sellResult.cashPaidOut,
            avgSellPrice: sellResult.avgSellPrice,
        } : null,
        buyExecution: totalBuyCash > 0 ? {
            cashAdded: totalBuyCash,
            stockDistributed: buyResult.stockDistributed,
            avgBuyPrice: buyResult.avgBuyPrice,
        } : null,
    };

    return { newState: currentState, result };
}

// ============================================
// ESTIMATION (for UI previews)
// ============================================

/**
 * Estimate the result of a buy order without executing
 * Used to show users expected outcome before submitting
 */
export function estimateBuy(
    state: AMMState,
    cashAmount: number
): { estimatedShares: number; estimatedPrice: number; priceImpact: number } {
    const currentPrice = getSpotPrice(state);
    const { xTotal, yTotal } = getTotals(state);
    const k = xTotal * yTotal;

    const newXTotal = xTotal + cashAmount;
    const newYTotal = k / newXTotal;
    const sharesOut = yTotal - newYTotal;

    const estimatedPrice = sharesOut > 0 ? cashAmount / sharesOut : currentPrice;
    const priceImpact = ((estimatedPrice - currentPrice) / currentPrice) * 100;

    return {
        estimatedShares: sharesOut,
        estimatedPrice: Math.round(estimatedPrice),
        priceImpact,
    };
}

/**
 * Estimate the result of a sell order without executing
 */
export function estimateSell(
    state: AMMState,
    shareAmount: number
): { estimatedCash: number; estimatedPrice: number; priceImpact: number } {
    const currentPrice = getSpotPrice(state);
    const { xTotal, yTotal } = getTotals(state);
    const k = xTotal * yTotal;

    const newYTotal = yTotal + shareAmount;
    const newXTotal = k / newYTotal;
    const cashOut = xTotal - newXTotal;

    const estimatedPrice = shareAmount > 0 ? cashOut / shareAmount : currentPrice;
    const priceImpact = ((estimatedPrice - currentPrice) / currentPrice) * 100;

    return {
        estimatedCash: Math.round(cashOut),
        estimatedPrice: Math.round(estimatedPrice),
        priceImpact,
    };
}
