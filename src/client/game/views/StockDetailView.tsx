/**
 * Stock Detail View - Shows price chart and buy/sell controls for a specific stonk.
 */

import { useState, useEffect } from 'react';

interface PriceHistoryEntry {
    t: number; // timestamp
    p: number; // price
    v: number; // volume
}

interface Holding {
    qty: number;
    avgPrice: number;
}

interface StonkState {
    id: string;
    name: string;
    ticker: string;
    icon: string;
    basePrice: number;
    currentPrice: number;
    virtualLiquidity: number;
    totalVolume: number;
    createdBy: string;
    createdAt: number;
    active: boolean;
}

interface StockDetailData {
    stonk: StonkState;
    priceHistory: PriceHistoryEntry[];
    userHolding: Holding | null;
}

interface StockDetailViewProps {
    stonkId: string;
    onBack: () => void;
}

export const StockDetailView = ({ stonkId, onBack }: StockDetailViewProps) => {
    const [data, setData] = useState<StockDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [action, setAction] = useState<'buy' | 'sell'>('buy');
    const [amount, setAmount] = useState('');
    const [trading, setTrading] = useState(false);
    const [tradeMessage, setTradeMessage] = useState<string | null>(null);

    useEffect(() => {
        fetchStockDetail();
        const interval = setInterval(fetchStockDetail, 5000);
        return () => clearInterval(interval);
    }, [stonkId]);

    const fetchStockDetail = async () => {
        try {
            const res = await fetch(`/api/stonk/${stonkId}`);
            if (!res.ok) throw new Error('Failed to fetch stonk details');
            const stockData = await res.json();
            setData(stockData);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleTrade = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setTradeMessage('Please enter a valid amount');
            return;
        }

        setTrading(true);
        setTradeMessage(null);

        try {
            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stonkId,
                    action,
                    amount: Math.floor(parseFloat(amount) * 100), // Convert to cents
                }),
            });

            const result = await res.json();

            if (result.success) {
                setTradeMessage(`✅ ${result.message}`);
                setAmount('');
                fetchStockDetail(); // Refresh data
            } else {
                setTradeMessage(`❌ ${result.message}`);
            }
        } catch (err) {
            setTradeMessage(`❌ Trade failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setTrading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-4">
                <button
                    onClick={onBack}
                    className="text-[#FF4500] mb-4"
                >
                    ← Back
                </button>
                <div className="text-red-500">Error: {error || 'No data'}</div>
            </div>
        );
    }

    const { stonk, priceHistory, userHolding } = data;
    const priceChange = priceHistory.length > 1
        ? stonk.currentPrice - priceHistory[0].p
        : 0;
    const priceChangePercent = priceHistory.length > 1 && priceHistory[0].p > 0
        ? ((priceChange / priceHistory[0].p) * 100)
        : 0;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#2d2d2d]">
                <button
                    onClick={onBack}
                    className="text-[#FF4500] mb-2"
                >
                    ← Back
                </button>
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{stonk.icon}</span>
                    <div>
                        <h2 className="text-xl font-bold text-white">{stonk.ticker}</h2>
                        <p className="text-sm text-gray-400">{stonk.name}</p>
                    </div>
                </div>
            </div>

            {/* Price */}
            <div className="px-4 py-4 border-b border-[#2d2d2d]">
                <div className="text-3xl font-bold text-white">
                    ${(stonk.currentPrice / 100).toFixed(2)}
                </div>
                <div
                    className={`text-sm mt-1 ${priceChange >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                        }`}
                >
                    {priceChange >= 0 ? '+' : ''}${(priceChange / 100).toFixed(2)} (
                    {priceChangePercent.toFixed(2)}%)
                </div>
            </div>

            {/* Chart Placeholder */}
            <div className="px-4 py-6 flex-1 overflow-auto">
                <div className="bg-[#1A1A1B] rounded-lg p-4 h-48 flex items-center justify-center">
                    <div className="text-gray-500 text-sm">📈 Price chart coming soon</div>
                </div>

                {/* User Holding */}
                {userHolding && userHolding.qty > 0 && (
                    <div className="mt-4 bg-[#1A1A1B] rounded-lg p-4">
                        <div className="text-gray-400 text-sm mb-2">Your Position</div>
                        <div className="flex justify-between">
                            <div>
                                <div className="text-white font-medium">{userHolding.qty} shares</div>
                                <div className="text-gray-400 text-sm">
                                    Avg: ${(userHolding.avgPrice / 100).toFixed(2)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-white font-medium">
                                    ${((userHolding.qty * stonk.currentPrice) / 100).toFixed(2)}
                                </div>
                                <div
                                    className={`text-sm ${stonk.currentPrice >= userHolding.avgPrice
                                            ? 'text-[#00D084]'
                                            : 'text-[#FF4444]'
                                        }`}
                                >
                                    {stonk.currentPrice >= userHolding.avgPrice ? '+' : ''}
                                    ${(((stonk.currentPrice - userHolding.avgPrice) * userHolding.qty) / 100).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Trading Controls */}
            <div className="px-4 py-4 border-t border-[#2d2d2d] bg-black">
                {/* Action Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setAction('buy')}
                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${action === 'buy'
                                ? 'bg-[#FF4500] text-white'
                                : 'bg-[#1A1A1B] text-gray-400'
                            }`}
                    >
                        Buy
                    </button>
                    <button
                        onClick={() => setAction('sell')}
                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${action === 'sell'
                                ? 'bg-[#1A1A1B] text-[#FF4444] border border-[#FF4444]'
                                : 'bg-[#1A1A1B] text-gray-400'
                            }`}
                    >
                        Sell
                    </button>
                </div>

                {/* Amount Input */}
                <div className="mb-4">
                    <label className="block text-gray-400 text-sm mb-2">
                        {action === 'buy' ? 'Amount (coins)' : 'Quantity (shares)'}
                    </label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={action === 'buy' ? '100.00' : '10'}
                        className="w-full bg-[#1A1A1B] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#FF4500]"
                        disabled={trading}
                    />
                </div>

                {/* Trade Message */}
                {tradeMessage && (
                    <div className="mb-4 text-sm text-center">
                        {tradeMessage}
                    </div>
                )}

                {/* Submit Button */}
                <button
                    onClick={handleTrade}
                    disabled={trading || !amount}
                    className={`w-full py-3 rounded-lg font-medium transition-colors ${action === 'buy'
                            ? 'bg-[#FF4500] text-white hover:bg-[#ff5722] disabled:opacity-50'
                            : 'bg-[#1A1A1B] text-[#FF4444] border border-[#FF4444] hover:bg-[#252525] disabled:opacity-50'
                        }`}
                >
                    {trading ? 'Processing...' : action === 'buy' ? 'Buy' : 'Sell'}
                </button>
            </div>
        </div>
    );
};
