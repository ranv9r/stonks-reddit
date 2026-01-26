/**
 * Market View - Displays all available stonks with prices and changes.
 * Uses Reddit Realtime for live price updates.
 */

import { useState, useEffect, useRef } from 'react';
import { connectRealtime } from '@devvit/web/client';

interface Stonk {
    id: string;
    name: string;
    ticker: string;
    icon: string;
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
        <div className="p-4">
            {/* Wallet Balance Card */}
            <div className="bg-[#1A1A1B] rounded-lg p-4 mb-4">
                <div className="text-gray-400 text-sm">Wallet Balance</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mt-1">
                    ₿{(marketData.walletBalance / 100).toFixed(2)}
                </div>
            </div>

            {/* Stonks List Header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-2 pb-2 text-xs text-gray-500 font-medium">
                <div>Ticker</div>
                <div className="text-right">Current Price</div>
                <div className="text-right">% Change</div>
            </div>

            {/* Stonks List */}
            <div className="space-y-2">
                {marketData.stonks.map((stonk) => (
                    <button
                        key={stonk.id}
                        onClick={() => onStonkClick(stonk.id)}
                        className="w-full bg-[#1A1A1B] rounded-lg p-4 hover:bg-[#252525] transition-colors"
                    >
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center">
                            <div className="text-2xl">{stonk.icon}</div>
                            <div className="text-left">
                                <div className="font-bold text-white">{stonk.ticker}</div>
                                <div className="text-xs text-gray-400">{stonk.name}</div>
                            </div>
                            <div className="text-right text-white font-medium">
                                ${(stonk.currentPrice / 100).toFixed(2)}
                            </div>
                            <div
                                className={`text-right text-sm font-medium ${stonk.priceChangePercent >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                                    }`}
                            >
                                {stonk.priceChangePercent >= 0 ? '+' : ''}
                                {stonk.priceChangePercent.toFixed(2)}%
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {marketData.stonks.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                    No stonks available yet. Check back later!
                </div>
            )}
        </div>
    );
};
