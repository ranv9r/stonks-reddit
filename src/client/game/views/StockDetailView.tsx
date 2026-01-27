/**
 * Stock Detail View - Shows interactive price chart and buy/sell modal for a specific stonk.
 * Redesigned to match Groww's modern trading app UI.
 */

import { useState, useEffect, useRef } from 'react';
import { ArrowLeftIcon } from '../components/Icons';

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

interface TooltipData {
    x: number;
    y: number;
    price: number;
    time: string;
}

/**
 * Interactive chart component with hover/touch tooltip showing price at any point.
 */
const InteractiveChart = ({ data }: { data: PriceHistoryEntry[] }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);

    if (!data || data.length < 2) {
        return (
            <div className="text-gray-500 text-sm flex items-center justify-center h-full">
                Not enough data
            </div>
        );
    }

    const prices = data.map(d => d.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    // SVG Dimensions (viewBox units)
    const width = 100;
    const height = 100;
    const padding = 5;

    // Create points for polyline
    const points = data.map((d, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const normalizedY = (d.p - min) / range;
        const y = height - padding - normalizedY * (height - 2 * padding);
        return { x, y, price: d.p, time: d.t };
    });

    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const isPositive = (prices[prices.length - 1] ?? 0) >= (prices[0] ?? 0);
    const color = isPositive ? '#00D084' : '#FF4444';

    // Create fill area
    const fillPoints = `${polylinePoints} ${width - padding},${height - padding} ${padding},${height - padding}`;

    /**
     * Handles mouse/touch movement to show tooltip at nearest data point.
     */
    const handleInteraction = (clientX: number) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const percentX = relativeX / rect.width;

        // Find nearest point
        const index = Math.min(
            Math.max(0, Math.round(percentX * (points.length - 1))),
            points.length - 1
        );
        const point = points[index];
        if (!point) return;

        setTooltip({
            x: (point.x / width) * 100,
            y: (point.y / height) * 100,
            price: point.price,
            time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => handleInteraction(e.clientX);
    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches[0]) handleInteraction(e.touches[0].clientX);
    };
    const handleMouseLeave = () => setTooltip(null);
    const handleTouchEnd = () => setTooltip(null);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id="chartGradientFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.05" />
                    </linearGradient>
                </defs>

                {/* Fill area */}
                <polygon
                    points={fillPoints}
                    fill="url(#chartGradientFill)"
                />

                {/* Line */}
                <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    points={polylinePoints}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            </svg>

            {/* HTML-based tooltip indicator (outside SVG to prevent stretching) */}
            {tooltip && (
                <>
                    {/* Vertical line */}
                    <div
                        className="absolute top-0 bottom-0 w-px bg-[#FF4500] opacity-40 pointer-events-none"
                        style={{ left: `${tooltip.x}%` }}
                    />
                    {/* Small circle dot */}
                    <div
                        className="absolute w-2 h-2 rounded-full bg-[#FF4500] opacity-80 pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${tooltip.x}%`, top: `${tooltip.y}%` }}
                    />
                </>
            )}

            {/* Tooltip box */}
            {tooltip && (
                <div
                    className="absolute pointer-events-none bg-[#1f1f1f] border border-[#333] rounded-lg px-3 py-2 shadow-lg z-10 transform -translate-x-1/2"
                    style={{
                        left: `${tooltip.x}%`,
                        top: `${tooltip.y}%`,
                        marginTop: '-50px'
                    }}
                >
                    <div className="text-white font-bold text-sm">
                        ${(tooltip.price / 100).toFixed(2)}
                    </div>
                    <div className="text-gray-400 text-xs">
                        {tooltip.time}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Trade modal component for buy/sell actions with quantity slider.
 */
interface TradeModalProps {
    isOpen: boolean;
    action: 'buy' | 'sell';
    stonk: StonkState;
    userHolding: Holding | null;
    walletBalance: number;
    isPositiveTrend: boolean;
    onClose: () => void;
    onTrade: (amount: number) => Promise<{ success: boolean; message: string }>;
}

const TradeModal = ({ isOpen, action, stonk, userHolding, walletBalance, isPositiveTrend, onClose, onTrade }: TradeModalProps) => {
    const [quantity, setQuantity] = useState(1);
    const [trading, setTrading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // Calculate max quantity
    const maxBuyQty = walletBalance > 0 && stonk.currentPrice > 0
        ? Math.floor(walletBalance / stonk.currentPrice)
        : 0;
    const maxSellQty = userHolding ? Math.floor(userHolding.qty) : 0;
    const maxQty = action === 'buy' ? maxBuyQty : maxSellQty;

    // Reset quantity when modal opens or action changes
    useEffect(() => {
        setQuantity(maxQty > 0 ? 1 : 0);
        setMessage(null);
    }, [isOpen, action, maxQty]);

    if (!isOpen) return null;

    const totalCost = quantity * stonk.currentPrice;
    const totalCostDollars = totalCost / 100;

    const handleSubmit = async () => {
        if (quantity <= 0) {
            setMessage('Please select a valid quantity');
            return;
        }

        setTrading(true);
        setMessage(null);

        // For buy: amount is in cents (totalCost)
        // For sell: amount is quantity (shares)
        const payloadAmount = action === 'buy' ? totalCost : quantity;
        const result = await onTrade(payloadAmount / 100); // Convert to dollars for buy

        if (result.success) {
            setMessage(`✅ ${result.message}`);
            setTimeout(() => {
                onClose();
                setMessage(null);
            }, 1200);
        } else {
            setMessage(`❌ ${result.message}`);
        }

        setTrading(false);
    };

    const glowColor = isPositiveTrend ? 'rgba(0, 208, 132, 0.4)' : 'rgba(255, 68, 68, 0.4)';
    const borderColor = isPositiveTrend ? '#00D084' : '#FF4444';

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop - NO BLUR */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-[#1A1A1B] rounded-t-2xl animate-slide-up">
                {/* Handle */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-600 rounded-full" />

                {/* Modal Content with proper padding */}
                <div className="px-6 pt-8 pb-6">
                    {/* Header with glowing price box */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">{stonk.icon}</span>
                            <div>
                                <div className="text-white font-bold text-lg">{stonk.ticker}</div>
                                <div className="text-gray-400 text-sm">{stonk.name}</div>
                            </div>
                        </div>
                        {/* Glowing Price Box */}
                        <div
                            className="px-4 py-2 rounded-xl border-2"
                            style={{
                                borderColor: borderColor,
                                boxShadow: `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`,
                                background: `linear-gradient(135deg, ${glowColor} 0%, transparent 100%)`
                            }}
                        >
                            <div className="text-white font-bold text-xl">${(stonk.currentPrice / 100).toFixed(2)}</div>
                            <div className="text-gray-300 text-xs text-center">Current Price</div>
                        </div>
                    </div>

                    {/* Wallet Balance */}
                    <div className="bg-[#0f0f0f] rounded-xl p-4 mb-5 border border-[#333]">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">💰 Wallet Balance</span>
                            <span className="text-white font-bold">${(walletBalance / 100).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Action Label */}
                    <div className={`text-center py-3 rounded-xl mb-5 font-bold text-lg ${action === 'buy'
                        ? 'bg-[#00D084]/15 text-[#00D084] border border-[#00D084]/30'
                        : 'bg-[#FF4444]/15 text-[#FF4444] border border-[#FF4444]/30'
                        }`}>
                        {action === 'buy' ? 'Buy' : 'Sell'} {stonk.ticker}
                    </div>

                    {/* Quantity Slider */}
                    <div className="mb-5">
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-gray-400 text-sm">Quantity</label>
                            <span className="text-white font-bold text-2xl">{quantity}</span>
                        </div>

                        {maxQty > 0 ? (
                            <>
                                <input
                                    type="range"
                                    min="1"
                                    max={maxQty}
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                                    className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer slider-thumb"
                                    style={{
                                        background: `linear-gradient(to right, ${action === 'buy' ? '#00D084' : '#FF4444'} 0%, ${action === 'buy' ? '#00D084' : '#FF4444'} ${(quantity / maxQty) * 100}%, #333 ${(quantity / maxQty) * 100}%, #333 100%)`
                                    }}
                                    disabled={trading}
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-2">
                                    <span>1</span>
                                    <span>Max: {maxQty}</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-4 text-gray-500 text-sm">
                                {action === 'buy' ? 'Insufficient balance' : 'No shares to sell'}
                            </div>
                        )}
                    </div>

                    {/* Total Cost / Value */}
                    <div className="bg-[#0f0f0f] rounded-xl p-4 mb-5 border border-[#333]">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">{action === 'buy' ? 'Total Cost' : 'Total Value'}</span>
                            <span className="text-white font-bold text-lg">${totalCostDollars.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className="text-center text-sm mb-4 py-2">{message}</div>
                    )}

                    {/* Confirm Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={trading || quantity <= 0 || maxQty <= 0}
                        className={`w-full py-4 rounded-xl font-bold text-white text-lg transition-all ${action === 'buy'
                            ? 'bg-[#00D084] hover:bg-[#00b874] disabled:opacity-40'
                            : 'bg-[#FF4444] hover:bg-[#e63d3d] disabled:opacity-40'
                            }`}
                    >
                        {trading ? 'Processing...' : `Confirm ${action === 'buy' ? 'Buy' : 'Sell'}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const StockDetailView = ({ stonkId, onBack }: StockDetailViewProps) => {
    const [data, setData] = useState<StockDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'buy' | 'sell'>('buy');
    const [walletBalance, setWalletBalance] = useState(0);

    useEffect(() => {
        fetchStockDetail();
        fetchWalletBalance();
        const interval = setInterval(() => {
            fetchStockDetail();
            fetchWalletBalance();
        }, 5000);
        return () => clearInterval(interval);
    }, [stonkId]);

    /**
     * Fetches stock detail data from the API.
     */
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

    /**
     * Fetches wallet balance from the API.
     */
    const fetchWalletBalance = async () => {
        try {
            const res = await fetch('/api/wallet');
            if (res.ok) {
                const walletData = await res.json();
                setWalletBalance(walletData.balance || 0);
            }
        } catch (err) {
            console.error('Failed to fetch wallet:', err);
        }
    };

    /**
     * Handles trade execution from the modal.
     */
    const handleTrade = async (amountDollars: number): Promise<{ success: boolean; message: string }> => {
        try {
            let payloadAmount = 0;
            if (modalAction === 'buy') {
                payloadAmount = Math.floor(amountDollars * 100);
            } else {
                // For sell, amountDollars is actually quantity
                payloadAmount = amountDollars;
            }

            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stonkId,
                    action: modalAction,
                    amount: payloadAmount,
                }),
            });

            const result = await res.json();

            if (result.success) {
                fetchStockDetail();
                fetchWalletBalance();
            }

            return { success: result.success, message: result.message };
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : 'Trade failed'
            };
        }
    };

    const openModal = (action: 'buy' | 'sell') => {
        setModalAction(action);
        setModalOpen(true);
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
                <button onClick={onBack} className="text-[#FF4500] mb-4">
                    ← Back
                </button>
                <div className="text-red-500">Error: {error || 'No data'}</div>
            </div>
        );
    }

    const { stonk, priceHistory, userHolding } = data;
    const firstPrice = priceHistory[0]?.p ?? stonk.currentPrice;
    const priceChange = priceHistory.length > 1
        ? stonk.currentPrice - firstPrice
        : 0;
    const priceChangePercent = priceHistory.length > 1 && firstPrice > 0
        ? ((priceChange / firstPrice) * 100)
        : 0;
    const isPositiveTrend = priceChange >= 0;

    // Calculate all-time high/low
    const allPrices = priceHistory.map(p => p.p);
    const allTimeHigh = allPrices.length > 0 ? Math.max(...allPrices) : stonk.currentPrice;
    const allTimeLow = allPrices.length > 0 ? Math.min(...allPrices) : stonk.currentPrice;

    return (
        <div className="flex flex-col h-full bg-[#0f0f0f]">
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-4 mx-2">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-[#1A1A1B] rounded-full transition-colors"
                >
                    <ArrowLeftIcon size={20} className="text-white" />
                </button>
                <div className="flex items-center gap-3 flex-1">
                    <span className="text-3xl">{stonk.icon}</span>
                    <div>
                        <h2 className="text-xl font-bold text-white">{stonk.ticker}</h2>
                        <p className="text-xs text-[#a1a1aa]">{stonk.name}</p>
                    </div>
                </div>
            </div>

            {/* Price Display */}
            <div className="px-4 py-2 mx-2">
                <div className="text-3xl font-bold text-white">
                    ${(stonk.currentPrice / 100).toFixed(2)}
                </div>
                <div className={`text-sm mt-1 flex items-center gap-1 ${priceChange >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                    }`}>
                    {priceChange >= 0 ? '▲' : '▼'} ${Math.abs(priceChange / 100).toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 px-4 py-2 flex flex-col gap-3 overflow-auto mx-2">
                {/* Interactive Chart - 1.8x height (h-64 instead of h-36) */}
                <div className="bg-[#1A1A1B] rounded-xl h-64 p-3">
                    <InteractiveChart data={priceHistory} />
                </div>

                {/* All-Time High/Low */}
                <div className="bg-[#1A1A1B] rounded-xl p-3">
                    <div className="text-gray-400 text-xs mb-2">All-Time Performance</div>
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-gray-500 text-[10px] mb-0.5">Low</div>
                            <div className="text-white font-mono text-sm">${(allTimeLow / 100).toFixed(2)}</div>
                        </div>
                        <div className="flex-1 mx-3 h-1.5 bg-[#333] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-[#FF4444] via-[#FFaa00] to-[#00D084]"
                                style={{
                                    width: allTimeHigh > allTimeLow
                                        ? `${((stonk.currentPrice - allTimeLow) / (allTimeHigh - allTimeLow)) * 100}%`
                                        : '50%'
                                }}
                            />
                        </div>
                        <div className="text-right">
                            <div className="text-gray-500 text-[10px] mb-0.5">High</div>
                            <div className="text-white font-mono text-sm">${(allTimeHigh / 100).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                {/* User Holding */}
                {userHolding && userHolding.qty > 0 && (
                    <div className="bg-[#1A1A1B] rounded-xl p-3">
                        <div className="text-gray-400 text-sm mb-3">Your Position</div>
                        <div className="flex justify-between">
                            <div>
                                <div className="text-white font-medium">{userHolding.qty.toFixed(4)} shares</div>
                                <div className="text-gray-500 text-xs">
                                    Avg: ${(userHolding.avgPrice / 100).toFixed(2)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-white font-medium">
                                    ${((userHolding.qty * stonk.currentPrice) / 100).toFixed(2)}
                                </div>
                                <div className={`text-xs ${stonk.currentPrice >= userHolding.avgPrice
                                    ? 'text-[#00D084]'
                                    : 'text-[#FF4444]'
                                    }`}>
                                    {stonk.currentPrice >= userHolding.avgPrice ? '+' : ''}
                                    ${(((stonk.currentPrice - userHolding.avgPrice) * userHolding.qty) / 100).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Fixed Footer Buy/Sell Buttons */}
            <div className="px-4 py-4 flex gap-3 bg-[#0f0f0f] border-t border-[#222] mt-auto mx-2">
                <button
                    onClick={() => openModal('sell')}
                    className="flex-1 py-4 rounded-xl font-bold text-white border-2 border-white hover:bg-white/10 transition-colors"
                >
                    SELL
                </button>
                <button
                    onClick={() => openModal('buy')}
                    className="flex-1 py-4 rounded-xl font-bold text-white bg-[#00D084] hover:bg-[#00b874] transition-colors"
                >
                    BUY
                </button>
            </div>

            {/* Trade Modal */}
            <TradeModal
                isOpen={modalOpen}
                action={modalAction}
                stonk={stonk}
                userHolding={userHolding}
                walletBalance={walletBalance}
                isPositiveTrend={isPositiveTrend}
                onClose={() => setModalOpen(false)}
                onTrade={handleTrade}
            />
        </div>
    );
};
