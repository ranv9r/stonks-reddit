import '../index.css';
import './splash.css';

import { connectRealtime } from '@devvit/web/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LogoChartIcon } from '../game/components/Icons';
import stonksGuy from '../assets/stonks-guy.png';
import { MARKET_PREVIEW_COUNT } from './splashConfig';

interface StonkPreview {
  ticker: string;
  icon: string;
  currentPrice: number;
  priceChangePercent: number;
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

interface PortfolioData {
  walletBalance: number;
  totalValue: number;
}

/**
 * Splash screen component - displays market preview and start trading button.
 * Two-column layout on all devices with large stonks guy and overlapping CTA.
 */
export const Splash = () => {
  const [stonks, setStonks] = useState<StonkPreview[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const connectionRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  useEffect(() => {
    fetchMarketPreview();
    fetchPortfolio();

    const setupRealtime = async () => {
      try {
        connectionRef.current = await connectRealtime({
          channel: 'global_ticker',
          onMessage: (data: unknown) => {
            const payload = data as MarketTickPayload;
            const updatedStonks = payload.stonks.map(s => ({
              ticker: s.ticker,
              icon: s.icon,
              currentPrice: s.currentPrice,
              priceChangePercent: s.priceChangePercent,
            }));
            setStonks(updatedStonks);
          },
          onConnect: () => console.log('[Splash] Connected'),
          onDisconnect: () => console.log('[Splash] Disconnected'),
        });
      } catch (err) {
        console.error('[Splash] Realtime failed:', err);
      }
    };

    setupRealtime();
    return () => { connectionRef.current?.disconnect(); };
  }, []);

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

  /** Fetches user portfolio data from API */
  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const data = await res.json();
        setPortfolio({ walletBalance: data.walletBalance, totalValue: data.totalValue });
      }
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    }
  };

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
            {/* CTA Button overlapping on the mascot */}
            <button
              className="splash-cta"
              onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
            >
              Start Trading
            </button>
          </div>

          {context.username && (
            <div className="splash-welcome">
              Welcome, <span className="username">u/{context.username}</span>
            </div>
          )}
        </div>

        {/* RIGHT Column - Live Market Cards */}
        <div className="splash-right">
          <div className="market-header">Live Market</div>
          <div className="market-cards">
            {!loading && stonks.slice(0, MARKET_PREVIEW_COUNT).map((stonk) => (
              <div key={stonk.ticker} className="market-card">
                <div className="card-left">
                  <span className="stonk-icon">{stonk.icon}</span>
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
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
