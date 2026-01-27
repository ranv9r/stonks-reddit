/**
 * Portfolio View - Displays user's holdings and P/L.
 */

import { useState, useEffect } from 'react';
import { TrendingUpIcon, TrendingDownIcon, CoinIcon } from '../components/Icons';

interface Holding {
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
        <div className="px-4 py-4 sm:px-6 sm:py-6 fade-in mx-2">
            {/* Summary Card */}
            {/* Summary Card */}
            <div className="glass-card-elevated p-5 mb-5 relative overflow-hidden flex items-center justify-between">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF4500] to-transparent opacity-10 blur-2xl rounded-full"></div>
                <div className="relative z-10 w-full text-center">
                    <div className="text-[#a1a1aa] text-[13px] font-medium mb-2 flex items-center justify-center gap-2">
                        <CoinIcon size={16} />
                        Total Portfolio Value
                    </div>
                    <div className="text-[30px] sm:text-[35px] font-bold text-white mb-2">
                        ${(totalNetWorth / 100).toFixed(2)}
                    </div>
                </div>
                <div className={`absolute right-5 top-1/2 -translate-y-1/2 flex flex-col items-end gap-1 text-[16px] font-semibold ${portfolio.totalProfitLoss >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
                    }`}>
                    <div className="flex items-center gap-1">
                        {portfolio.totalProfitLoss >= 0 ? (
                            <TrendingUpIcon size={20} />
                        ) : (
                            <TrendingDownIcon size={20} />
                        )}
                        {portfolio.totalProfitLoss >= 0 ? '+' : ''}
                        ${(portfolio.totalProfitLoss / 100).toFixed(2)}
                    </div>
                    <div className="text-[14px] opacity-80">
                        ({portfolio.totalProfitLossPercent.toFixed(2)}%)
                    </div>
                </div>
            </div>

            {/* Holdings Header */}
            <div className="px-1 pb-3 text-[11px] text-[#71717a] font-semibold uppercase tracking-wider">
                Your Holdings
            </div>

            {/* Holdings List */}
            <div className="flex flex-col gap-3">
                {portfolio.holdings.map((holding) => (
                    <button
                        key={holding.stonkId}
                        onClick={() => onStonkClick(holding.stonkId)}
                        className="w-full card p-4 hover:border-[#FF4500] hover:shadow-lg transition-all duration-200 group"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {holding.imageUrl ? (
                                    <img
                                        src={holding.imageUrl}
                                        alt={holding.ticker}
                                        className="w-10 h-10 rounded-lg object-cover"
                                    />
                                ) : (
                                    <span className="text-3xl">{holding.icon}</span>
                                )}
                                <div className="text-left">
                                    <div className="font-bold text-white text-[15px] group-hover:text-[#FF4500] transition-colors">{holding.ticker}</div>
                                    <div className="text-[13px] text-[#71717a]">
                                        {holding.quantity.toFixed(2)} shares @ ${(holding.avgBuyPrice / 100).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-semibold text-white text-[15px]">
                                    ${(holding.currentValue / 100).toFixed(2)}
                                </div>
                                <div className={`flex items-center gap-1 justify-end text-[13px] font-semibold mt-1 ${holding.profitLoss >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
                                    }`}>
                                    {holding.profitLoss >= 0 ? <TrendingUpIcon size={14} /> : <TrendingDownIcon size={14} />}
                                    {holding.profitLoss >= 0 ? '+' : ''}
                                    ${(holding.profitLoss / 100).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {portfolio.holdings.length === 0 && (
                <div className="text-center text-[#71717a] mt-12 p-8">
                    <div className="text-[35px] mb-3">💼</div>
                    <div className="text-[15px] font-medium">No holdings yet</div>
                    <div className="text-[13px] mt-2">Start trading to build your portfolio!</div>
                </div>
            )}
        </div>
    );
};
