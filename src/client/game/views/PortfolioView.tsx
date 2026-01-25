/**
 * Portfolio View - Displays user's holdings and P/L.
 */

import { useState, useEffect } from 'react';

interface Holding {
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

interface PortfolioData {
    walletBalance: number;
    totalValue: number;
    totalProfitLoss: number;
    totalProfitLossPercent: number;
    holdings: Holding[];
}

interface PortfolioViewProps {
    onStonkClick: (stonkId: string) => void;
}

export const PortfolioView = ({ onStonkClick }: PortfolioViewProps) => {
    const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPortfolio();
        const interval = setInterval(fetchPortfolio, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchPortfolio = async () => {
        try {
            const res = await fetch('/api/portfolio');
            if (!res.ok) throw new Error('Failed to fetch portfolio');
            const data = await res.json();
            setPortfolio(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading portfolio...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-red-500">Error: {error}</div>
            </div>
        );
    }

    if (!portfolio) return null;

    const totalNetWorth = portfolio.walletBalance + portfolio.totalValue;

    return (
        <div className="p-4">
            {/* Summary Card */}
            <div className="bg-[#1A1A1B] rounded-lg p-4 mb-4">
                <div className="text-gray-400 text-sm">Total Value</div>
                <div className="text-2xl font-bold text-white mt-1">
                    ₿{(totalNetWorth / 100).toFixed(2)}
                </div>
                <div
                    className={`text-sm mt-1 ${portfolio.totalProfitLoss >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                        }`}
                >
                    {portfolio.totalProfitLoss >= 0 ? '+' : ''}
                    ₿{(portfolio.totalProfitLoss / 100).toFixed(2)} (
                    {portfolio.totalProfitLossPercent.toFixed(2)}%)
                </div>
            </div>

            {/* Holdings Header */}
            <div className="text-sm font-medium text-gray-400 mb-2">Holdings</div>

            {/* Holdings List */}
            <div className="space-y-2">
                {portfolio.holdings.map((holding) => (
                    <button
                        key={holding.stonkId}
                        onClick={() => onStonkClick(holding.stonkId)}
                        className="w-full bg-[#1A1A1B] rounded-lg p-4 hover:bg-[#252525] transition-colors"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">{holding.icon}</span>
                                <div className="text-left">
                                    <div className="font-bold text-white">{holding.ticker}</div>
                                    <div className="text-xs text-gray-400">
                                        {holding.quantity} shares
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium text-white">
                                    ₿{(holding.currentValue / 100).toFixed(2)}
                                </div>
                                <div
                                    className={`text-xs ${holding.profitLoss >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                                        }`}
                                >
                                    {holding.profitLoss >= 0 ? '+' : ''}
                                    ₿{(holding.profitLoss / 100).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {portfolio.holdings.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                    <div className="text-3xl mb-2">💼</div>
                    <div>No holdings yet</div>
                    <div className="text-sm mt-1">Start trading to build your portfolio!</div>
                </div>
            )}
        </div>
    );
};
