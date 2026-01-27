/**
 * Market View - Displays all available stonks with prices and changes.
 * Uses Reddit Realtime for live price updates.
 */

import { useState, useEffect, useRef } from 'react';
import { connectRealtime } from '@devvit/web/client';
import { TrendingUpIcon, TrendingDownIcon, CoinIcon } from '../components/Icons';

interface Stonk {
    id: string;
    name: string;
    ticker: string;
    icon: string;
    imageUrl?: string;
    currentPrice: number;
    priceChange: number;
    priceChangePercent: number;
}

interface MarketData {
    stonks: Stonk[];
    walletBalance: number;
    lastUpdate: number;
}

interface RealtimeStonk {
    id: string;
    ticker: string;
    icon: string;
    currentPrice: number;
    priceChangePercent: number;
}

interface MarketTickPayload {
    stonks: RealtimeStonk[];
    timestamp: number;
}

interface MarketViewProps {
    onStonkClick: (stonkId: string) => void;
}

export const MarketView = ({ onStonkClick }: MarketViewProps) => {
    const [marketData, setMarketData] = useState<MarketData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const connectionRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

    useEffect(() => {
        // Initial fetch for full data (including wallet balance)
        fetchMarketData();

        // Subscribe to realtime updates
        const setupRealtime = async () => {
            try {
                connectionRef.current = await connectRealtime({
                    channel: 'global_ticker',
                    onMessage: (data: unknown) => {
                        const payload = data as MarketTickPayload;
                        // Update stonk prices from realtime payload
                        setMarketData(prev => {
                            if (!prev) return prev;
                            const updatedStonks = prev.stonks.map(stonk => {
                                const update = payload.stonks.find(s => s.id === stonk.id);
                                if (update) {
                                    const priceChange = update.currentPrice - stonk.currentPrice;
                                    const priceChangePercent = stonk.currentPrice > 0
                                        ? (priceChange / stonk.currentPrice) * 100
                                        : 0;
                                    return {
                                        ...stonk,
                                        currentPrice: update.currentPrice,
                                        priceChange,
                                        priceChangePercent,
                                    };
                                }
                                return stonk;
                            });
                            return {
                                ...prev,
                                stonks: updatedStonks,
                                lastUpdate: payload.timestamp,
                            };
                        });
                    },
                    onConnect: () => console.log('[MarketView] Connected to global-ticker'),
                    onDisconnect: () => console.log('[MarketView] Disconnected from global-ticker'),
                });
            } catch (err) {
                console.error('[MarketView] Realtime connection failed:', err);
            }
        };

        setupRealtime();

        return () => {
            // Cleanup realtime connection
            connectionRef.current?.disconnect();
        };
    }, []);

    /**
     * Fetches full market data from API (initial load).
     */
    const fetchMarketData = async () => {
        try {
            const res = await fetch('/api/market');
            if (!res.ok) throw new Error('Failed to fetch market data');
            const data = await res.json();
            setMarketData(data);
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
                <div className="text-gray-500">Loading market data...</div>
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

    if (!marketData) return null;

    return (
        <div className="px-4 py-4 sm:px-6 sm:py-6 fade-in">
            {/* Wallet Balance Card */}
            <div className="glass-card-elevated p-5 mb-5 relative overflow-hidden text-center">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF4500] to-transparent opacity-10 blur-2xl rounded-full"></div>
                <div className="relative z-10 flex flex-col items-center">
                    <div className="text-[#a1a1aa] text-[13px] font-medium mb-2 flex items-center gap-2">
                        <CoinIcon size={16} />
                        Wallet Balance
                    </div>
                    <div className="text-[30px] sm:text-[35px] lg:text-[40px] font-bold text-white">
                        ${(marketData.walletBalance / 100).toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Stonks List Header */}
            <div className="px-1 pb-3 text-[11px] text-[#71717a] font-semibold uppercase tracking-wider">
                Available Assets
            </div>

            {/* Stonks List */}
            <div className="flex flex-col gap-3">
                {marketData.stonks.map((stonk) => (
                    <button
                        key={stonk.id}
                        onClick={() => onStonkClick(stonk.id)}
                        className="w-full card p-4 hover:border-[#FF4500] hover:shadow-lg transition-all duration-200 group"
                    >
                        <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
                            {/* Icon + Name */}
                            <div className="flex items-center gap-3">
                                {stonk.imageUrl ? (
                                    <img
                                        src={stonk.imageUrl}
                                        alt={stonk.ticker}
                                        className="w-10 h-10 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="text-3xl">{stonk.icon}</div>
                                )}
                                <div className="text-left">
                                    <div className="font-bold text-white text-[15px] group-hover:text-[#FF4500] transition-colors">{stonk.ticker}</div>
                                    <div className="text-[13px] text-[#71717a]">{stonk.name}</div>
                                </div>
                            </div>

                            {/* Price + Change */}
                            <div className="text-right">
                                <div className="text-white font-semibold text-[15px]">
                                    ${(stonk.currentPrice / 100).toFixed(2)}
                                </div>
                                <div className={`flex items-center gap-1 justify-end text-[13px] font-semibold mt-1 ${stonk.priceChangePercent >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
                                    }`}>
                                    {stonk.priceChangePercent >= 0 ? (
                                        <TrendingUpIcon size={14} />
                                    ) : (
                                        <TrendingDownIcon size={14} />
                                    )}
                                    {stonk.priceChangePercent >= 0 ? '+' : ''}
                                    {stonk.priceChangePercent.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {marketData.stonks.length === 0 && (
                <div className="text-center text-[#71717a] mt-12 p-8">
                    <div className="text-[35px] mb-3">📊</div>
                    <div className="text-[15px] font-medium">No assets available yet</div>
                    <div className="text-[13px] mt-2">Check back later!</div>
                </div>
            )}
        </div>
    );
};
