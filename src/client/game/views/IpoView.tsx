/**
 * IPO View - Lists pending IPOs, allows proposing and subscribing.
 * Features animated pot-filling graphics and realtime updates.
 */

import { useState, useEffect, useRef } from 'react';
import { connectRealtime, showForm } from '@devvit/web/client';
import type { IpoState, IpoListResponse } from '../../../shared/types/stonks';

// ============================================
// SUB-COMPONENTS
// ============================================

/** Animated circular progress ring for the pot */
const PotRing = ({ pct, size = 80 }: { pct: number; size?: number }) => {
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;

    return (
        <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth="6" />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke="url(#potGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ}`}
                style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
            <defs>
                <linearGradient id="potGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#FF4500" />
                </linearGradient>
            </defs>
        </svg>
    );
};

/** Subscriber slots visualizer */
const SlotDots = ({ filled, total }: { filled: number; total: number }) => (
    <div className="flex gap-1 flex-wrap justify-center mt-2">
        {Array.from({ length: total }).map((_, i) => (
            <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all duration-500 ${i < filled
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                    : 'bg-[#27272a]'
                    }`}
                style={{ transitionDelay: `${i * 40}ms` }}
            />
        ))}
    </div>
);

/** Countdown timer display */
const Countdown = ({ expiresAt }: { expiresAt: number }) => {
    const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));

    useEffect(() => {
        const t = setInterval(() => setRemaining(Math.max(0, expiresAt - Date.now())), 1000);
        return () => clearInterval(t);
    }, [expiresAt]);

    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    if (remaining === 0) return <span className="text-red-400 text-xs font-mono font-bold">EXPIRED</span>;
    return (
        <span className="text-gray-500 text-xs font-mono">
            {hours > 0 ? `${hours}h ` : ''}{String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s left
        </span>
    );
};

// ============================================
// IPO CARD
// ============================================

interface IpoCardProps {
    ipo: IpoState;
    isSubscribed: boolean;
    onSubscribe: (ipoId: string) => void;
    subscribing: string | null;
}

const IpoCard = ({ ipo, isSubscribed, onSubscribe, subscribing }: IpoCardProps) => {
    const pct = Math.round((ipo.totalPot / ipo.potTarget) * 100);
    const isFull = ipo.subscriberCount >= ipo.maxSubscribers;
    const isLoading = subscribing === ipo.id;

    return (
        <div className="bg-[#1A1A1B] rounded-2xl border border-[#2a2a2a] overflow-hidden transition-all hover:border-[#3a3a3a] group">
            {/* Top section */}
            <div className="p-5 pb-4">
                <div className="flex items-start gap-4">
                    {/* Pot ring + icon */}
                    <div className="relative flex-shrink-0">
                        <PotRing pct={pct} size={72} />
                        <div className="absolute inset-0 flex items-center justify-center">
                            {ipo.imageUrl ? (
                                <img src={ipo.imageUrl} alt={ipo.ticker} className="w-9 h-9 rounded-lg object-cover" />
                            ) : (
                                <span className="text-2xl">{ipo.icon}</span>
                            )}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-white font-bold text-lg leading-tight">{ipo.ticker}</span>
                            <span className="text-gray-500 text-xs bg-[#0f0f0f] px-2 py-0.5 rounded-full">{ipo.name}</span>
                        </div>
                        <div className="text-gray-500 text-xs mb-2">
                            by <span className="text-gray-300">u/{ipo.proposerName}</span>
                        </div>
                        <Countdown expiresAt={ipo.expiresAt} />
                    </div>

                    {/* Pct badge */}
                    <div className={`text-right flex-shrink-0 ${isFull ? 'text-green-400' : 'text-amber-400'}`}>
                        <div className="text-2xl font-bold font-mono">{pct}%</div>
                        <div className="text-xs text-gray-500">filled</div>
                    </div>
                </div>

                {/* Slot dots */}
                <SlotDots filled={ipo.subscriberCount} total={ipo.maxSubscribers} />

                {/* Stats row */}
                <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
                    <span>
                        <span className="text-white font-mono">{ipo.subscriberCount}</span>
                        <span> / {ipo.maxSubscribers} subscribers</span>
                    </span>
                    <span>
                        <span className="text-amber-400 font-mono font-bold">${(ipo.totalPot / 100).toLocaleString()}</span>
                        <span> / ${(ipo.potTarget / 100).toLocaleString()}</span>
                    </span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-[#111] relative overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `${pct}%`,
                        background: isFull
                            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                            : 'linear-gradient(90deg, #f59e0b, #FF4500)',
                        boxShadow: isFull
                            ? '0 0 12px rgba(34,197,94,0.5)'
                            : '0 0 12px rgba(245,158,11,0.5)',
                    }}
                />
            </div>

            {/* Subscribe button */}
            <div className="px-5 py-4">
                {isFull ? (
                    <div className="w-full py-3 rounded-xl text-center text-green-400 font-bold bg-green-400/10 border border-green-400/30">
                        Fully Subscribed — Listing Soon!
                    </div>
                ) : isSubscribed ? (
                    <div className="w-full py-3 rounded-xl text-center text-amber-400 font-bold bg-amber-400/10 border border-amber-400/30">
                        You're in! Waiting for {ipo.maxSubscribers - ipo.subscriberCount} more
                    </div>
                ) : (
                    <button
                        onClick={() => onSubscribe(ipo.id)}
                        disabled={!!isLoading}
                        className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b, #FF4500)',
                            boxShadow: '0 4px 20px rgba(245,158,11,0.25)',
                        }}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                Subscribing...
                            </span>
                        ) : (
                            'Subscribe for $10,000'
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

// ============================================
// LISTING CELEBRATION OVERLAY
// ============================================

const ListingCelebration = ({ ticker, onClose }: { ticker: string; onClose: () => void }) => {
    useEffect(() => {
        const t = setTimeout(onClose, 5000);
        return () => clearTimeout(t);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div
                className="text-center animate-bounce-in pointer-events-auto"
                onClick={onClose}
            >
                <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-black font-black text-3xl px-8 py-3 rounded-2xl shadow-2xl">
                    {ticker} IS LIVE!
                </div>
                <div className="text-gray-400 text-sm mt-3">Check the Market tab</div>
            </div>
        </div>
    );
};

// ============================================
// MAIN VIEW
// ============================================

export const IpoView = () => {
    const [data, setData] = useState<IpoListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [subscribing, setSubscribing] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [celebration, setCelebration] = useState<string | null>(null);
    const realtimeRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

    const fetchIpos = async () => {
        try {
            const res = await fetch('/api/ipos');
            if (!res.ok) throw new Error('Failed to fetch');
            const json = await res.json() as IpoListResponse;
            setData(json);
            setError(null);
        } catch {
            setError('Failed to load IPOs');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    // Propose IPO using Devvit native form (supports image upload)
    const handlePropose = async () => {
        try {
            const result = await showForm({
                title: 'Propose New IPO',
                fields: [
                    { name: 'name', type: 'string', label: 'Stonk Name', required: true },
                    { name: 'ticker', type: 'string', label: 'Ticker Symbol (e.g. TSLA)', required: true },
                    { name: 'icon', type: 'string', label: 'Emoji Icon (optional)', required: false },
                    {
                        name: 'logo',
                        type: 'image',
                        label: 'Stonk Logo (optional)',
                        required: false,
                        helpText: 'PNG/JPG/GIF, max 20MB. Recommended: 200x200px or larger.'
                    },
                ],
            });

            if (result && result.action === 'SUBMITTED') {
                const values = result.values;
                const name = values.name as string;
                const ticker = values.ticker as string;
                const icon = values.icon as string | undefined;
                const logo = values.logo as string | undefined;

                console.log('[IPO Propose] Form values:', { name, ticker, icon, logo, allValues: JSON.stringify(values) });

                const res = await fetch('/api/ipos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        ticker,
                        icon: icon || '📈',
                        imageUrl: logo || undefined,
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    fetchIpos();
                    showToast('IPO created successfully!');
                } else {
                    showToast(data.message || 'Failed to create IPO');
                }
            }
        } catch (err) {
            console.error('[IPO] Propose error:', err);
            showToast('Failed to create IPO');
        }
    };

    useEffect(() => {
        fetchIpos();

        // Check for deep-linked ticker from splash
        const ticker = localStorage.getItem('openIpoTicker');
        if (ticker) {
            console.log('[IpoView] Deep-link ticker found:', ticker);
            // We'll highlight it once data loads
        }

        // Subscribe to realtime IPO updates
        const setup = async () => {
            try {
                realtimeRef.current = await connectRealtime({
                    channel: 'ipo_update',
                    onMessage: (raw: unknown) => {
                        const msg = raw as { type: string; ipoId: string; ticker?: string; subscriberCount?: number; totalPot?: number };

                        if (msg.type === 'new') {
                            fetchIpos();
                        } else if (msg.type === 'progress') {
                            // Optimistically update the specific IPO in state
                            setData(prev => {
                                if (!prev) return prev;
                                return {
                                    ...prev,
                                    ipos: prev.ipos.map(ipo =>
                                        ipo.id === msg.ipoId
                                            ? { ...ipo, subscriberCount: msg.subscriberCount ?? ipo.subscriberCount, totalPot: msg.totalPot ?? ipo.totalPot }
                                            : ipo
                                    ),
                                };
                            });
                        } else if (msg.type === 'listed') {
                            setCelebration(msg.ticker || 'LISTED');
                            fetchIpos();
                        } else if (msg.type === 'expired') {
                            showToast(`IPO ${msg.ticker} expired — your $10,000 has been refunded`);
                            fetchIpos();
                        }
                    },
                });
            } catch (e) {
                console.error('[IpoView] Realtime failed:', e);
            }
        };
        setup();

        return () => { realtimeRef.current?.disconnect(); };
    }, []);

    const handleSubscribe = async (ipoId: string) => {
        setSubscribing(ipoId);
        try {
            const res = await fetch(`/api/ipos/${ipoId}/subscribe`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                showToast(result.message);
                fetchIpos();
            } else {
                showToast(result.message);
            }
        } catch {
            showToast('Network error');
        } finally {
            setSubscribing(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="text-gray-500 animate-pulse">Loading IPOs...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-400">{error}</div>
        );
    }

    const { ipos = [], userSubscriptions = [], canPropose = false, nextProposalAt } = data ?? {};

    const hoursUntilPropose = nextProposalAt
        ? Math.ceil((nextProposalAt - Date.now()) / 3600000)
        : 0;

    return (
        <div className="p-4 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-white font-black text-2xl">IPO Market</h2>
                    <p className="text-gray-500 text-sm mt-0.5">Subscribe for $10K — stonks list at $110 with 100 shares each</p>
                </div>

                <button
                    onClick={handlePropose}
                    disabled={!canPropose}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${canPropose
                        ? 'text-black bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                        : 'text-gray-500 bg-[#1A1A1B] border border-[#333] cursor-not-allowed'
                        }`}
                    title={!canPropose && nextProposalAt ? `Available in ~${hoursUntilPropose}h` : ''}
                >
                    {canPropose
                        ? '+ Propose IPO'
                        : nextProposalAt
                            ? `${hoursUntilPropose}h cooldown`
                            : '+ Propose IPO'
                    }
                </button>
            </div>

            {/* IPO List */}
            {ipos.length === 0 ? (
                <div className="text-center py-16">
                    <div className="text-gray-400 font-semibold text-lg">No IPOs right now</div>
                    <div className="text-gray-600 text-sm mt-1">Be the first to propose one!</div>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {ipos.map(ipo => {
                        const isHighlighted = ipo.ticker === localStorage.getItem('openIpoTicker');
                        return (
                            <div key={ipo.id} ref={isHighlighted ? (el) => {
                                if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    localStorage.removeItem('openIpoTicker'); // Clear after use
                                }
                            } : undefined}
                                className={isHighlighted ? 'ring-2 ring-orange-500 rounded-2xl shadow-[0_0_30px_rgba(255,69,0,0.3)] scale-[1.02] transform transition-all duration-1000' : ''}
                            >
                                <IpoCard
                                    ipo={ipo}
                                    isSubscribed={userSubscriptions.includes(ipo.id)}
                                    onSubscribe={handleSubscribe}
                                    subscribing={subscribing}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-white font-medium text-sm shadow-2xl animate-slide-up"
                    style={{ background: 'linear-gradient(135deg, #1f1f1f, #2a2a2a)', border: '1px solid #333', maxWidth: '90vw' }}
                >
                    {toast}
                </div>
            )}

            {/* Listing celebration */}
            {celebration && (
                <ListingCelebration
                    ticker={celebration}
                    onClose={() => setCelebration(null)}
                />
            )}
        </div>
    );
};
