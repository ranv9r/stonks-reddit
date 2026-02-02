/**
 * React hook for subscribing to the shared portfolio store.
 * Ensures splash and game screens stay in sync.
 */

import { useState, useEffect } from 'react';
import {
    subscribePortfolio,
    setPortfolioData,
    updatePortfolioFromPrices,
    type PortfolioState,
    type PortfolioHolding,
} from './portfolioStore';

/** Hook to subscribe to portfolio state changes */
export function usePortfolioStore() {
    const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);

    useEffect(() => {
        const unsubscribe = subscribePortfolio((state) => {
            setPortfolio(state);
        });
        return unsubscribe;
    }, []);

    return portfolio;
}

/** Initialize portfolio from API response */
export function initializePortfolio(apiResponse: {
    walletBalance: number;
    totalValue: number;
    holdings: Array<{
        stonkId: string;
        quantity: number;
        avgBuyPrice?: number;
        currentPrice?: number;
    }>;
}) {
    const holdings: PortfolioHolding[] = (apiResponse.holdings || []).map(h => ({
        stonkId: h.stonkId,
        quantity: h.quantity,
        avgBuyPrice: h.avgBuyPrice || h.currentPrice || 0,
        currentPrice: h.currentPrice,
    }));

    setPortfolioData({
        walletBalance: apiResponse.walletBalance,
        totalValue: apiResponse.totalValue,
        holdings,
    });
}

/** Update portfolio from realtime ticker payload */
export function updatePortfolioFromTicker(stonks: Array<{ id: string; currentPrice: number }>) {
    updatePortfolioFromPrices(stonks);
}

// Re-export store functions for convenience
export { updateWalletBalance, updateHolding, clearPortfolio, getPortfolioState } from './portfolioStore';
