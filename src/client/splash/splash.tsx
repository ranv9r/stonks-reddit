import '../index.css';
import './splash.css';

import { connectRealtime } from '@devvit/web/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { LogoChartIcon } from '../game/components/Icons';
import stonksGuy from '../assets/stonks-guy.png';

interface StonkPreview {
  id: string;
  ticker: string;
  icon: string;
  imageUrl?: string;
  currentPrice: number;
  priceChangePercent: number;
}

interface RealtimeStonk {
  id: string;
  ticker: string;
  icon: string;
  imageUrl?: string;
  currentPrice: number;
  priceChangePercent: number;
}

interface MarketTickPayload {
  stonks: RealtimeStonk[];
  timestamp: number;
}

interface PortfolioHolding {
  stonkId: string;
  quantity: number;
  avgBuyPrice: number;
}

interface PortfolioData {
  walletBalance: number;
  totalValue: number;
  holdings: PortfolioHolding[];
}

/**
 * Splash screen component - displays market preview and start trading button.
 * Two-column layout on all devices with large stonks guy and overlapping CTA.
 * Portfolio updates in sync with global_ticker realtime channel (same as game).
 */
export const Splash = () => {
  const [stonks, setStonks] = useState<StonkPreview[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isMod, setIsMod] = useState(false); // Mods bypass lock screen
  const [eventStartTime, setEventStartTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const tickerConnection = useRef<{ disconnect: () => Promise<void> } | null>(null);
  const statusConnection = useRef<{ disconnect: () => Promise<void> } | null>(null);
  // Ref to track holdings for realtime updates (avoids stale closure)
  const holdingsRef = useRef<PortfolioHolding[]>([]);
  // Refs for auto-scroll detection
  const marketCardsRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);

  useEffect(() => {
    fetchMarketPreview();
    fetchPortfolio();
    fetchGameConfig();
    checkModStatus();

    // Realtime handles all updates (same pattern as market_status)
    const setupRealtime = async () => {
      try {
        // 1. Subscribe to Ticker Updates - updates portfolio value locally
        tickerConnection.current = await connectRealtime({
          channel: 'global_ticker',
          onMessage: (data: unknown) => {
            const payload = data as MarketTickPayload;

            // Update stonk prices - merge with existing data to preserve imageUrl
            setStonks(prevStonks => {
              // If no previous data, create from realtime
              if (prevStonks.length === 0) {
                return payload.stonks.map(s => ({
                  id: s.id,
                  ticker: s.ticker,
                  icon: s.icon,
                  ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
                  currentPrice: s.currentPrice,
                  priceChangePercent: s.priceChangePercent,
                }));
              }
              // Merge with existing data to keep imageUrl from initial fetch
              return prevStonks.map(existing => {
                const update = payload.stonks.find(s => s.ticker === existing.ticker);
                if (update) {
                  return {
                    ...existing,
                    currentPrice: update.currentPrice,
                    priceChangePercent: update.priceChangePercent,
                    // Preserve imageUrl from existing or use from update
                    ...(existing.imageUrl ? { imageUrl: existing.imageUrl } :
                      update.imageUrl ? { imageUrl: update.imageUrl } : {}),
                  };
                }
                return existing;
              });
            });

            // Update portfolio value using latest prices from realtime
            const currentHoldings = holdingsRef.current;
            if (currentHoldings.length > 0) {
              let newTotalValue = 0;
              for (const holding of currentHoldings) {
                const stonkData = payload.stonks.find(s => s.id === holding.stonkId);
                const price = stonkData?.currentPrice ?? holding.avgBuyPrice;
                newTotalValue += holding.quantity * price;
              }
              setPortfolio(prev => prev ? { ...prev, totalValue: newTotalValue } : prev);
            }
          },
        });

        // 2. Subscribe to Market Status Updates (includes lock state)
        statusConnection.current = await connectRealtime({
          channel: 'market_status',
          onMessage: (data: any) => {
            console.log('[Splash] market_status received:', data);
            if (data && typeof data.eventActive === 'boolean') {
              setIsMarketOpen(data.eventActive);
            }
            if (data && typeof data.eventLocked === 'boolean') {
              setIsLocked(data.eventLocked);
            }
            if (data && 'eventStartTime' in data) {
              setEventStartTime(data.eventStartTime);
            }
          }
        });
      } catch (err) {
        console.error('[Splash] Realtime failed:', err);
      }
    };

    setupRealtime();

    return () => {
      tickerConnection.current?.disconnect();
      statusConnection.current?.disconnect();
    };
  }, []);

  // Countdown timer effect - updates every second when timer is set
  useEffect(() => {
    if (!eventStartTime) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diff = eventStartTime - now;

      if (diff <= 0) {
        setCountdown('');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setCountdown(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [eventStartTime]);

  /** Fetches market preview data from API */
  const fetchMarketPreview = async () => {
    try {
      const res = await fetch('/api/market');
      if (res.ok) {
        const data = await res.json();
        setStonks(data.stonks);
      }
    } catch (err) {
      console.error('Failed to fetch market:', err);
    } finally {
      setLoading(false);
    }
  };

  /** Fetches game config to check market and lock status */
  const fetchGameConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.eventActive === 'boolean') {
          setIsMarketOpen(data.eventActive);
        }
        if (typeof data.eventLocked === 'boolean') {
          setIsLocked(data.eventLocked);
        }
        if ('eventStartTime' in data) {
          setEventStartTime(data.eventStartTime);
        }
      }
    } catch (e) {
      console.error('[Splash] Config fetch failed:', e);
    }
  };

  /** Checks if user is a moderator */
  const checkModStatus = async () => {
    try {
      const res = await fetch('/api/mod/check');
      if (res.ok) {
        const data = await res.json();
        setIsMod(data.isModerator === true);
      }
    } catch (e) {
      console.error('[Splash] Mod check failed:', e);
    }
  };

  /** Fetches user portfolio data from API (once on mount) */
  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const data = await res.json();
        // Store holdings in ref for realtime callback + in state for display
        const holdings: PortfolioHolding[] = (data.holdings || []).map((h: any) => ({
          stonkId: h.stonkId,
          quantity: h.quantity,
          avgBuyPrice: h.avgBuyPrice || h.currentPrice,
        }));
        holdingsRef.current = holdings;
        setPortfolio({ walletBalance: data.walletBalance, totalValue: data.totalValue, holdings });
      }
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    }
  };

  /** Checks if market cards overflow and enables auto-scroll if needed */
  const checkOverflow = useCallback(() => {
    if (marketCardsRef.current && stonks.length > 0 && !loading) {
      const container = marketCardsRef.current;
      const inner = container.querySelector('.market-cards-inner') as HTMLElement;
      if (inner) {
        // Check if content height exceeds container height
        const containerHeight = container.clientHeight;
        const contentHeight = inner.scrollHeight / (shouldAutoScroll ? 2 : 1); // Account for duplicates
        setShouldAutoScroll(contentHeight > containerHeight);
      }
    }
  }, [stonks, loading, shouldAutoScroll]);

  // Check overflow when stocks change
  useEffect(() => {
    checkOverflow();
  }, [stonks, loading, checkOverflow]);

  const netWorth = portfolio ? (portfolio.walletBalance + portfolio.totalValue) / 100 : 0;

  return (
    <div className="splash-container">
      <div className="splash-inner">
        {/* LEFT Column - Branding, Mascot & CTA */}
        <div className="splash-left">
          {/* Logo */}
          <div className="splash-logo">
            <div className="logo-row">
              <LogoChartIcon size={36} className="logo-icon" />
              <span className="logo-stonks">Stonks</span>
            </div>
          </div>

          {/* Net Worth */}
          <div className="splash-networth">
            <div className="networth-label">Net Worth</div>
            <div className="networth-value">
              ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="networth-subtitle">Wallet + Portfolio</div>
          </div>

          {/* Mascot Section - Stonks Guy with Arrow BEHIND and CTA on TOP */}
          <div className="splash-mascot-area">
            {/* Arrow behind stonks guy */}
            <div className="mascot-arrow">
              <LogoChartIcon size={140} className="trend-arrow-icon" />
            </div>
            {/* Stonks Guy Image - LARGE */}
            <img
              src={stonksGuy}
              alt="Stonks"
              className="stonks-guy-image"
            />

            {/* CTA Area - Shows countdown/coming soon for non-mods, button for mods or when unlocked */}
            {isLocked && !isMod ? (
              <div className="splash-locked-area">
                {countdown ? (
                  <>
                    <div className="countdown-label">Event starts in</div>
                    <div className="countdown-timer">{countdown}</div>
                  </>
                ) : (
                  <div className="coming-soon">Coming Soon</div>
                )}
              </div>
            ) : (
              <button
                className="splash-cta"
                onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
              >
                Start Trading
              </button>
            )}
          </div>

          {context.username && (
            <div className="splash-welcome">
              Welcome, <span className="username">u/{context.username}</span>
            </div>
          )}
        </div>

        {/* RIGHT Column - Live Market Cards */}
        <div className="splash-right">
          <div className="market-header flex items-center justify-between">
            <span>Live Market</span>
            <div className={`flex items-center gap-2 px-3 py-1 bg-[#18181b] rounded-full border border-[#27272a] shadow-sm`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${isMarketOpen ? 'bg-[#22c55e]' : 'bg-red-500'}`}></div>
              <span className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">
                {isMarketOpen ? 'Live' : 'Paused'}
              </span>
            </div>
          </div>
          <div
            className={`market-cards ${shouldAutoScroll ? 'auto-scroll' : ''}`}
            ref={marketCardsRef}
          >
            <div className="market-cards-inner">
              {!loading && stonks.map((stonk) => (
                <div
                  key={stonk.ticker}
                  className="market-card cursor-pointer hover:border-[#FF4500] hover:scale-[1.02] transition-all"
                  onClick={(e) => {
                    // Store stonkId for the app to read on load
                    localStorage.setItem('openStonkId', stonk.id);
                    requestExpandedMode(e.nativeEvent, 'game');
                  }}
                >
                  <div className="card-left">
                    {stonk.imageUrl ? (
                      <img src={stonk.imageUrl} alt={stonk.ticker} className="stonk-logo" />
                    ) : (
                      <span className="stonk-icon">{stonk.icon}</span>
                    )}
                    <div className="stonk-info">
                      <div className="stonk-ticker">{stonk.ticker}</div>
                      <div className="stonk-price">
                        ${(stonk.currentPrice / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className={`price-badge ${stonk.priceChangePercent >= 0 ? 'up' : 'down'}`}>
                    {stonk.priceChangePercent >= 0 ? '+' : ''}{stonk.priceChangePercent.toFixed(1)}%
                  </div>
                </div>
              ))}
              {/* Duplicate cards for seamless loop */}
              {shouldAutoScroll && !loading && stonks.map((stonk) => (
                <div key={`${stonk.ticker}-dup`} className="market-card">
                  <div className="card-left">
                    {stonk.imageUrl ? (
                      <img src={stonk.imageUrl} alt={stonk.ticker} className="stonk-logo" />
                    ) : (
                      <span className="stonk-icon">{stonk.icon}</span>
                    )}
                    <div className="stonk-info">
                      <div className="stonk-ticker">{stonk.ticker}</div>
                      <div className="stonk-price">
                        ${(stonk.currentPrice / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className={`price-badge ${stonk.priceChangePercent >= 0 ? 'up' : 'down'}`}>
                    {stonk.priceChangePercent >= 0 ? '+' : ''}{stonk.priceChangePercent.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
