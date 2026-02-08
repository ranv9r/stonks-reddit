/**
 * Stock Detail View - Shows interactive price chart and buy/sell modal for a specific stonk.
 * Redesigned to match Groww's modern trading app UI.
 */

import { useState, useEffect, useRef } from 'react';
import { connectRealtime } from '@devvit/web/client';
import { ArrowLeftIcon } from '../components/Icons';
import { useTierData, type TickerTier } from '../hooks/useTierData';
import { StockChat } from '../components/StockChat';

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
    imageUrl?: string;
    basePrice: number;
    currentPrice: number;
    virtualLiquidity: number;
    totalVolume: number;
    createdBy: string;
    createdAt: number;
    active: boolean;
}

interface StockDetailViewProps {
    stonkId: string;
    onBack: () => void;
    isMarketOpen?: boolean;
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

    // Create points for polyline (in SVG viewBox coordinates)
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
     * Key fix: Calculate positions based on the actual chart drawing area,
     * accounting for the SVG padding classes (pb-4 pr-6).
     */
    const handleInteraction = (clientX: number) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();

        // The SVG has pb-4 (1rem = 16px) and pr-6 (1.5rem = 24px) padding via CSS
        // This means the actual chart area is smaller than the container
        const paddingRight = 24; // pr-6 = 1.5rem = 24px
        const paddingBottom = 16; // pb-4 = 1rem = 16px

        const chartWidth = rect.width - paddingRight;
        const chartHeight = rect.height - paddingBottom;

        const relativeX = clientX - rect.left;

        // Calculate percentage within the chart area (not the full container)
        const percentX = Math.max(0, Math.min(1, relativeX / chartWidth));

        // Find nearest point
        const index = Math.min(
            Math.max(0, Math.round(percentX * (points.length - 1))),
            points.length - 1
        );
        const point = points[index];
        if (!point) return;

        // Convert SVG viewBox coordinates to actual container percentages
        // Point.x is in viewBox coordinates (5-95 range for padding=5)
        // We need to convert to chart area percentages, then to container percentages

        // X position: Map from SVG viewBox to chart area, then to container
        const svgXPercent = (point.x - padding) / (width - 2 * padding); // 0-1 in data range
        const chartXPixels = svgXPercent * chartWidth; // Actual pixels in chart area
        const containerXPercent = (chartXPixels / rect.width) * 100; // Percentage of container

        // Y position: Map from SVG viewBox to chart area, then to container
        const svgYPercent = (point.y - padding) / (height - 2 * padding); // 0-1 in viewBox
        const chartYPixels = svgYPercent * chartHeight; // Actual pixels in chart area
        const containerYPercent = (chartYPixels / rect.height) * 100; // Percentage of container

        setTooltip({
            x: containerXPercent,
            y: containerYPercent,
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

    const startTime = new Date(data[0]!.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(data[data.length - 1]!.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full cursor-crosshair group"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Price Labels (Y-axis) */}
            <div className="absolute top-0 right-0 text-[10px] text-gray-500 font-mono pointer-events-none transition-opacity duration-200 group-hover:opacity-0">
                ${(max / 100).toFixed(2)}
            </div>
            <div className="absolute bottom-6 right-0 text-[10px] text-gray-500 font-mono pointer-events-none transition-opacity duration-200 group-hover:opacity-0">
                ${(min / 100).toFixed(2)}
            </div>

            {/* Time Labels (X-axis) */}
            <div className="absolute bottom-0 left-0 text-[10px] text-gray-500 font-mono pointer-events-none">
                {startTime}
            </div>
            <div className="absolute bottom-0 right-0 text-[10px] text-gray-500 font-mono pointer-events-none">
                {endTime}
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-full overflow-visible pb-4 pr-6" // Padding for labels
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
                <div
                    className="absolute top-0 bottom-4 w-px bg-[#FF4500] opacity-60 pointer-events-none"
                    style={{ left: `${tooltip.x}%` }}
                />
            )}

            {/* Tooltip box - single line, clamped to stay in bounds */}
            {tooltip && (
                <div
                    className="absolute pointer-events-none bg-[#1f1f1f]/95 border border-[#444] rounded-md px-2 py-1.5 shadow-lg z-30 whitespace-nowrap"
                    style={{
                        left: `clamp(50px, ${tooltip.x}%, calc(100% - 50px))`,
                        top: '4px',
                        transform: 'translateX(-50%)'
                    }}
                >
                    <span className="text-white font-bold text-sm">${(tooltip.price / 100).toFixed(2)}</span>
                    <span className="text-gray-400 text-xs ml-2">{tooltip.time}</span>
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
    spendLimit?: { allowed: boolean; remaining: number; spent: number } | undefined;
}

const TradeModal = ({ isOpen, action, stonk, userHolding, walletBalance, isPositiveTrend, onClose, onTrade, spendLimit }: TradeModalProps) => {
    const [quantity, setQuantity] = useState(1);
    const [trading, setTrading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // Calculate max quantity
    // For Buy: Min of Wallet Limit and Spend Limit
    let maxBuyQty = 0;
    if (walletBalance > 0 && stonk.currentPrice > 0) {
        const walletMax = walletBalance / stonk.currentPrice;
        const limitMax = spendLimit ? spendLimit.remaining / stonk.currentPrice : walletMax;
        maxBuyQty = Math.min(walletMax, limitMax);
    }

    // For Sell: Max of holdings
    const maxSellQty = userHolding ? userHolding.qty : 0;

    const maxQty = action === 'buy' ? maxBuyQty : maxSellQty;

    // Reset quantity when modal opens or action changes
    useEffect(() => {
        // Default to 1 or max if less than 1 (but > 0)
        const defaultQty = maxQty > 0 ? (maxQty < 1 ? maxQty : 1) : 0;
        setQuantity(defaultQty);
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
        if (action === 'buy') {
            const result = await onTrade(totalCost / 100); // Convert cents to dollars
            handleResult(result);
        } else {
            const result = await onTrade(quantity); // Pass shares directly
            handleResult(result);
        }

        function handleResult(result: { success: boolean; message: string }) {
            if (result.success) {
                setMessage(`✅ ${result.message}`);
                setTimeout(() => {
                    onClose();
                    setMessage(null);
                }, 1200);
            } else {
                setMessage(`❌ ${result.message}`);
            }
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
                            {stonk.imageUrl ? (
                                <img src={stonk.imageUrl} alt={stonk.ticker} className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                                <span className="text-3xl">{stonk.icon}</span>
                            )}
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

                    {/* Quantity Slider */}
                    <div className="mb-5">
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-gray-400 text-sm">Quantity</label>
                            <span className="text-white font-bold text-2xl">{Number.isInteger(quantity) ? quantity : quantity.toFixed(2)}</span>
                        </div>

                        {maxQty > 0 ? (
                            <>
                                <input
                                    type="range"
                                    min={maxQty < 1 ? "0.01" : "1"}
                                    max={maxQty}
                                    step="0.01"
                                    value={quantity}
                                    onChange={(e) => {
                                        let val = parseFloat(e.target.value);
                                        // Soft snap to whole numbers (snap if within 0.05 of a whole number)
                                        const nearestInt = Math.round(val);
                                        if (Math.abs(val - nearestInt) < 0.05 && nearestInt >= 1) {
                                            val = nearestInt;
                                        }
                                        setQuantity(val);
                                    }}
                                    className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer slider-thumb"
                                    style={{
                                        background: `linear-gradient(to right, ${action === 'buy' ? '#00D084' : '#FF4444'} 0%, ${action === 'buy' ? '#00D084' : '#FF4444'} ${(quantity / maxQty) * 100}%, #333 ${(quantity / maxQty) * 100}%, #333 100%)`
                                    }}
                                    disabled={trading}
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-2">
                                    <span>{maxQty < 1 ? "0" : "1"}</span>
                                    <span>Max: {Number.isInteger(maxQty) ? maxQty : maxQty.toFixed(2)}</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-4 text-gray-500 text-sm">
                                {action === 'buy'
                                    ? (spendLimit && spendLimit.remaining <= 0 ? 'Monthly limit reached' : 'Insufficient balance')
                                    : 'No shares to sell'}
                            </div>
                        )}

                        {/* Limit Warning */}
                        {action === 'buy' && spendLimit && (
                            <div className="mt-2 text-xs text-center text-gray-500">
                                Buy Limit Remaining: <span className="text-gray-300 font-mono">${(spendLimit.remaining / 100).toFixed(2)}</span>
                            </div>
                        )}
                        {action === 'sell' && (
                            <div className="mt-2 text-xs text-center text-gray-500">
                                Sell Limit: <span className="text-[#00D084] font-bold">UNLIMITED</span>
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

export const StockDetailView = ({ stonkId, onBack, isMarketOpen = true }: StockDetailViewProps) => {
    const [stonk, setStonk] = useState<StonkState | null>(null);
    const [userHolding, setUserHolding] = useState<Holding | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'buy' | 'sell'>('buy');
    const [walletBalance, setWalletBalance] = useState(0);
    const [currentPrice, setCurrentPrice] = useState(0);
    const [spendLimit, setSpendLimit] = useState<{ allowed: boolean; remaining: number; spent: number } | undefined>(undefined);

    // Realtime connection ref for cleanup
    const realtimeRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

    // Use tiered data hook for price history
    const { currentData: priceHistory, selectedTier, setSelectedTier, loading: tierLoading, tierLabels } = useTierData(stonkId, currentPrice);

    // Fetch stonk details (without price history) and wallet once on mount
    useEffect(() => {
        fetchStockDetail();
        fetchWalletBalance();
    }, [stonkId]);

    // Subscribe to realtime updates for price using connectRealtime
    useEffect(() => {
        const setupRealtime = async () => {
            try {
                realtimeRef.current = await connectRealtime({
                    channel: 'global_ticker',
                    onMessage: (data: unknown) => {
                        const payload = data as { stonks: { id: string; currentPrice: number }[]; timestamp: number };
                        const updatedStonk = payload.stonks.find(s => s.id === stonkId);
                        if (updatedStonk) {
                            console.log(`[StockDetailView] Realtime price update: ${updatedStonk.currentPrice}`);
                            setCurrentPrice(updatedStonk.currentPrice);
                            setStonk(prev => prev ? { ...prev, currentPrice: updatedStonk.currentPrice } : prev);
                        }
                    },
                    onConnect: () => console.log('[StockDetailView] Connected to global_ticker'),
                    onDisconnect: () => console.log('[StockDetailView] Disconnected from global_ticker'),
                });
            } catch (err) {
                console.error('[StockDetailView] Realtime connection failed:', err);
            }
        };

        setupRealtime();

        return () => {
            realtimeRef.current?.disconnect();
        };
    }, [stonkId]);

    /**
     * Fetches stock detail data (without price history - that comes from tier hook).
     */
    const fetchStockDetail = async () => {
        try {
            const res = await fetch(`/api/stonk/${stonkId}`, {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            if (!res.ok) throw new Error('Failed to fetch stonk details');
            const stockData = await res.json();
            setStonk(stockData.stonk);
            setUserHolding(stockData.userHolding);
            setSpendLimit(stockData.spendLimit);
            setCurrentPrice(stockData.stonk.currentPrice);
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
            const res = await fetch('/api/wallet', {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
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

    if (error || !stonk) {
        return (
            <div className="p-4">
                <button onClick={onBack} className="text-[#FF4500] mb-4">
                    ← Back
                </button>
                <div className="text-red-500">Error: {error || 'No data'}</div>
            </div>
        );
    }

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
        <div className="flex flex-col h-full bg-[#0f0f0f] lg:flex-row lg:overflow-hidden">
            {/* Main Content Area (Mobile: Full, Desktop: Left 2/3) */}
            <div className="flex flex-col h-full lg:flex-1 lg:min-w-0 lg:border-r border-[#222]">
                {/* Header */}
                <div className="px-4 py-3 flex items-center gap-4">
                    <button
                        id="tour-back-button"
                        onClick={onBack}
                        className="p-2 hover:bg-[#1A1A1B] rounded-full transition-colors flex items-center justify-center"
                    >
                        <ArrowLeftIcon size={20} className="text-white" />
                    </button>
                    <div className="flex items-center gap-3 flex-1">
                        {stonk.imageUrl ? (
                            <img src={stonk.imageUrl} alt={stonk.ticker} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                            <span className="text-3xl">{stonk.icon}</span>
                        )}
                        <div>
                            <h2 className="text-xl font-bold text-white">{stonk.ticker}</h2>
                            <p className="text-xs text-[#a1a1aa]">{stonk.name}</p>
                        </div>
                    </div>
                </div>

                {/* Price Display with ATH/ATL */}
                <div className="px-4 py-2 flex justify-between items-start">
                    <div>
                        <div className="text-3xl font-bold text-white">
                            ${(stonk.currentPrice / 100).toFixed(2)}
                        </div>
                        <div className="flex flex-col items-start">
                            {!isMarketOpen && (
                                <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full mt-0.5 mb-1">
                                    MARKET CLOSED
                                </span>
                            )}
                            <div className={`text-sm mt-1 flex items-center gap-1 ${priceChange >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                                }`}>
                                {priceChange >= 0 ? '▲' : '▼'} ${Math.abs(priceChange / 100).toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                            </div>
                        </div>
                    </div>
                    {/* ATH/ATL aligned right */}
                    <div id="tour-stats-card" className="text-right pr-2">
                        <div className="text-gray-500 text-[10px]">ATH <span className="text-white font-mono font-medium">${(allTimeHigh / 100).toFixed(2)}</span></div>
                        <div className="text-gray-500 text-[10px]">ATL <span className="text-white font-mono font-medium">${(allTimeLow / 100).toFixed(2)}</span></div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 px-4 py-2 flex flex-col gap-3 overflow-auto">
                    {/* Interactive Chart - 1.8x height */}
                    <div id="tour-price-chart" className="bg-[#1A1A1B] rounded-xl h-64 p-3">
                        {tierLoading ? (
                            <div className="flex items-center justify-center h-full text-gray-500">Loading chart...</div>
                        ) : (
                            <InteractiveChart data={priceHistory} />
                        )}
                    </div>

                    {/* Tier Selector Buttons */}
                    <div className="flex gap-2 justify-center">
                        {([1, 2, 3, 4, 5] as TickerTier[]).map((tier) => (
                            <button
                                key={tier}
                                onClick={() => setSelectedTier(tier)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${selectedTier === tier
                                    ? 'bg-[#FF4500] text-white'
                                    : 'bg-[#1A1A1B] text-gray-400 hover:bg-[#2A2A2B]'
                                    }`}
                            >
                                {tierLabels[tier]}
                            </button>
                        ))}
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

                    {/* Buy/Sell Buttons - Above Chat */}
                    <div id="tour-trade-panel" className="flex gap-4 mt-4">
                        <button
                            onClick={() => openModal('sell')}
                            disabled={!isMarketOpen}
                            className={`flex-1 py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 shadow-lg
                            ${isMarketOpen
                                    ? 'bg-[#ef4444] text-white hover:bg-[#dc2626] shadow-red-900/20'
                                    : 'bg-[#27272a] text-slate-500 cursor-not-allowed opacity-50'
                                }`}
                        >
                            SELL
                        </button>
                        <button
                            onClick={() => openModal('buy')}
                            disabled={!isMarketOpen}
                            className={`flex-1 py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 shadow-lg
                            ${isMarketOpen
                                    ? 'bg-[#22c55e] text-white hover:bg-[#16a34a] shadow-green-900/20'
                                    : 'bg-[#27272a] text-slate-500 cursor-not-allowed opacity-50'
                                }`}
                        >
                            BUY
                        </button>
                    </div>

                    {/* Mobile Chat (Bottom of Scroll) */}
                    <div className="lg:hidden mt-4 pb-4 h-[400px]">
                        <StockChat stonkId={stonkId} className="h-full" />
                    </div>
                </div>


            </div>

            {/* Desktop Chat Sidebar */}
            <div className="hidden lg:flex lg:w-[350px] xl:w-[400px] flex-col bg-[#111] border-l border-[#222]">
                <StockChat stonkId={stonkId} className="h-full rounded-none border-0 bg-transparent" />
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
                spendLimit={spendLimit}
            />
        </div>
    );
};
