/**
 * Stock Detail View - Shows price chart and buy/sell controls for a specific stonk.
 */

import { useState, useEffect } from 'react';
import { ArrowLeftIcon, TrendingUpIcon, TrendingDownIcon } from '../components/Icons';

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

const SimpleChart = ({ data }: { data: PriceHistoryEntry[] }) => {
    if (!data || data.length < 2) return <div className="text-gray-500 text-sm flex items-center justify-center h-full">Not enough data</div>;

    const prices = data.map(d => d.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    // SVG Dimensions (viewBox units)
    const width = 100;
    const height = 100;

    // Create points
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const normalizedY = (d.p - min) / range;
        const y = height - (normalizedY * height * 0.8) - (height * 0.1); // Add padding
        return `${x},${y}`;
    }).join(' ');

    const isPositive = (prices[prices.length - 1] ?? 0) >= (prices[0] ?? 0);
    const color = isPositive ? '#00D084' : '#FF4444';

    // Create fill area (closed path)
    const fillPoints = `${points} ${width},${height} 0,${height}`;

    return (
        <div className="relative w-full h-full pr-10">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon
                    points={fillPoints}
                    fill="url(#chartGradient)"
                />
                <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    points={points}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            {/* Y-Axis Labels */}
            <div className="absolute top-0 right-0 text-xs text-gray-500 font-mono">
                ${(max / 100).toFixed(2)}
            </div>
            <div className="absolute bottom-4 right-0 text-xs text-gray-500 font-mono">
                ${(min / 100).toFixed(2)}
            </div>
        </div>
    );
};

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
            let payloadAmount = 0;
            if (action === 'buy') {
                // Buy: Input is in Dollars -> Convert to cents
                payloadAmount = Math.floor(parseFloat(amount) * 100);
            } else {
                // Sell: Input is in Dollars -> Convert to shares
                // data.stonk.currentPrice is in cents
                if (data && data.stonk.currentPrice > 0) {
                    const priceDollars = data.stonk.currentPrice / 100;
                    payloadAmount = parseFloat(amount) / priceDollars;
                }
            }

            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stonkId,
                    action,
                    amount: payloadAmount,
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
            <div className="px-4 py-4 border-b border-[#27272a] bg-[#0f0f0f]">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-[#FF4500] mb-3 hover:text-[#ff5722] transition-colors"
                >
                    <ArrowLeftIcon size={20} />
                    <span className="font-medium">Back</span>
                </button>
                <div className="flex items-center gap-3">
                    <span className="text-4xl">{stonk.icon}</span>
                    <div>
                        <h2 className="text-2xl font-bold text-white">{stonk.ticker}</h2>
                        <p className="text-sm text-[#a1a1aa]">{stonk.name}</p>
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

            {/* Price Chart */}
            <div className="px-4 py-6 flex-1 overflow-auto">
                <div className="bg-[#1A1A1B] rounded-lg p-4 h-48 mb-4">
                    <SimpleChart data={priceHistory} />
                </div>

                {/* User Holding */}
                {userHolding && userHolding.qty > 0 && (
                    <div className="mt-4 bg-[#1A1A1B] rounded-lg p-4">
                        <div className="text-gray-400 text-sm mb-2">Your Position</div>
                        <div className="flex justify-between">
                            <div>
                                <div className="text-white font-medium">{userHolding.qty.toFixed(2)} shares</div>
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
                        {/* Exit Position Button */}
                        <button
                            onClick={() => {
                                setAction('sell');
                                // Calculate total value in dollars, truncating to 2 decimals (floor)
                                // to avoid rounding up and exceeding actual share balance.
                                const val = (userHolding.qty * stonk.currentPrice) / 100;
                                const safeVal = Math.floor(val * 100) / 100;
                                setAmount(safeVal.toFixed(2));
                            }}
                            className="mt-3 w-full py-2 bg-[#2d1a1a] border border-[#FF4444] text-[#FF4444] rounded text-sm hover:bg-[#3d2a2a] transition-colors"
                        >
                            Exit Position (Sell All)
                        </button>
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
                        {action === 'buy' ? 'Amount ($)' : 'Amount ($ to sell)'}
                    </label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="100.00"
                        className="w-full bg-[#1A1A1B] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#FF4500]"
                        disabled={trading}
                    />
                    {/* Est. Shares Helper */}
                    {amount && !isNaN(parseFloat(amount)) && (
                        <div className="text-xs text-gray-500 mt-2 text-right">
                            {action === 'buy'
                                ? `Est. Shares: ~${(parseFloat(amount) / (stonk.currentPrice / 100)).toFixed(2)}`
                                : `Est. Shares to Sell: ~${(parseFloat(amount) / (stonk.currentPrice / 100)).toFixed(2)}`
                            }
                        </div>
                    )}
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
