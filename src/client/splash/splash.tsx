import '../index.css';

import { navigateTo, connectRealtime } from '@devvit/web/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

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

export const Splash = () => {
  const [stonks, setStonks] = useState<StonkPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const connectionRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  useEffect(() => {
    fetchMarketPreview();

    // Subscribe to realtime updates
    const setupRealtime = async () => {
      try {
        connectionRef.current = await connectRealtime({
          channel: 'global_ticker',
          onMessage: (data: unknown) => {
            const payload = data as MarketTickPayload;
            // Update stonk prices from realtime payload (top 3)
            const updatedStonks = payload.stonks.slice(0, 3).map(s => ({
              ticker: s.ticker,
              icon: s.icon,
              currentPrice: s.currentPrice,
              priceChangePercent: s.priceChangePercent,
            }));
            setStonks(updatedStonks);
          },
          onConnect: () => console.log('[Splash] Connected to global-ticker'),
          onDisconnect: () => console.log('[Splash] Disconnected from global-ticker'),
        });
      } catch (err) {
        console.error('[Splash] Realtime connection failed:', err);
      }
    };

    setupRealtime();

    return () => {
      connectionRef.current?.disconnect();
    };
  }, []);

  /**
   * Fetches initial market preview from API.
   */
  const fetchMarketPreview = async () => {
    try {
      const res = await fetch('/api/market');
      if (res.ok) {
        const data = await res.json();
        setStonks(data.stonks.slice(0, 3)); // Top 3 stonks
      }
    } catch (err) {
      console.error('Failed to fetch market preview:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-6 p-4 bg-black">
      {/* Logo/Title */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          📈 Meme Stonks
        </h1>
        <p className="text-gray-400">
          Trade, Compete, Win
        </p>
      </div>

      {/* Market Preview */}
      {!loading && stonks.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          <div className="text-gray-400 text-sm text-center mb-3">Live Market Preview</div>
          {stonks.map((stonk) => (
            <div
              key={stonk.ticker}
              className="bg-[#1A1A1B] rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{stonk.icon}</span>
                <span className="font-bold text-white">{stonk.ticker}</span>
              </div>
              <div className="text-right">
                <div className="text-white font-medium">
                  ${(stonk.currentPrice / 100).toFixed(2)}
                </div>
                <div
                  className={`text-xs ${stonk.priceChangePercent >= 0 ? 'text-[#00D084]' : 'text-[#FF4444]'
                    }`}
                >
                  {stonk.priceChangePercent >= 0 ? '+' : ''}
                  {stonk.priceChangePercent.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Start Button */}
      <div className="flex items-center justify-center mt-4">
        <button
          className="flex items-center justify-center bg-[#FF4500] text-white px-8 py-3 rounded-full cursor-pointer transition-all hover:bg-[#ff5722] active:scale-95 font-medium"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Start Trading
        </button>
      </div>

      {/* User Info */}
      {context.username && (
        <div className="text-gray-400 text-sm">
          Welcome, u/{context.username}
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
