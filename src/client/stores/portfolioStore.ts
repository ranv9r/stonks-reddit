/**
 * Shared Portfolio Store - Syncs portfolio data across splash and game screens.
 * Uses a simple pub-sub pattern to notify all subscribers when portfolio updates.
 * 
 * This module is imported by both splash.tsx and PortfolioView.tsx to ensure
 * they both reflect the same portfolio values when realtime updates arrive.
 */

export interface PortfolioHolding {
    stonkId: string;
    quantity: number;
    avgBuyPrice: number;
    currentPrice?: number;
}

export interface PortfolioState {
    walletBalance: number;
    totalValue: number;
    holdings: PortfolioHolding[];
    lastUpdated: number;
}

type Listener = (state: PortfolioState | null) => void;

// Global state - shared across all imports
let portfolioState: PortfolioState | null = null;
const listeners: Set<Listener> = new Set();

/** Subscribe to portfolio changes. Returns unsubscribe function. */
export function subscribePortfolio(listener: Listener): () => void {
    listeners.add(listener);
    // Immediately call with current state
    listener(portfolioState);
    return () => listeners.delete(listener);
}

/** Notify all listeners of state change */
function notifyListeners() {
    for (const listener of listeners) {
        listener(portfolioState);
    }
}

/** Set initial portfolio data (called after API fetch) */
export function setPortfolioData(data: {
    walletBalance: number;
    totalValue: number;
    holdings: PortfolioHolding[];
}) {
    portfolioState = {
        ...data,
        lastUpdated: Date.now(),
    };
    notifyListeners();
}

/** Update portfolio values using realtime price data */
export function updatePortfolioFromPrices(stonkPrices: { id: string; currentPrice: number }[]) {
    if (!portfolioState || portfolioState.holdings.length === 0) return;

    let newTotalValue = 0;
    const updatedHoldings = portfolioState.holdings.map(holding => {
        const priceData = stonkPrices.find(s => s.id === holding.stonkId);
        const price = priceData?.currentPrice ?? holding.currentPrice ?? holding.avgBuyPrice;
        newTotalValue += holding.quantity * price;
        return { ...holding, currentPrice: price };
    });

    portfolioState = {
        ...portfolioState,
        totalValue: newTotalValue,
        holdings: updatedHoldings,
        lastUpdated: Date.now(),
    };
    notifyListeners();
}

/** Update wallet balance (called after trade execution) */
export function updateWalletBalance(delta: number) {
    if (!portfolioState) return;
    portfolioState = {
        ...portfolioState,
        walletBalance: portfolioState.walletBalance + delta,
        lastUpdated: Date.now(),
    };
    notifyListeners();
}

/** Add or update a holding (called after trade execution) */
export function updateHolding(stonkId: string, quantity: number, avgBuyPrice: number) {
    if (!portfolioState) return;

    const existingIdx = portfolioState.holdings.findIndex(h => h.stonkId === stonkId);
    let newHoldings: PortfolioHolding[];

    if (existingIdx >= 0) {
        if (quantity <= 0) {
            // Remove holding
            newHoldings = portfolioState.holdings.filter((_, i) => i !== existingIdx);
        } else {
            // Update holding
            newHoldings = [...portfolioState.holdings];
            newHoldings[existingIdx] = { ...newHoldings[existingIdx], quantity, avgBuyPrice };
        }
    } else if (quantity > 0) {
        // Add new holding
        newHoldings = [...portfolioState.holdings, { stonkId, quantity, avgBuyPrice }];
    } else {
        return; // No change needed
    }

    // Recalculate total value
    let newTotalValue = 0;
    for (const h of newHoldings) {
        const price = h.currentPrice ?? h.avgBuyPrice;
        newTotalValue += h.quantity * price;
    }

    portfolioState = {
        ...portfolioState,
        holdings: newHoldings,
        totalValue: newTotalValue,
        lastUpdated: Date.now(),
    };
    notifyListeners();
}

/** Get current portfolio state (for non-reactive access) */
export function getPortfolioState(): PortfolioState | null {
    return portfolioState;
}

/** Clear portfolio state (for logout/reset) */
export function clearPortfolio() {
    portfolioState = null;
    notifyListeners();
}
