/**
 * Main App component for Meme Stonks game.
 * Handles navigation between Market, Portfolio, Leaderboard, and Admin views.
 * Optimized for mobile, tablet, and desktop responsiveness.
 */

import { useState, useEffect, useRef } from 'react';
import { connectRealtime } from '@devvit/web/client';
import { MarketView } from './views/MarketView';
import { PortfolioView } from './views/PortfolioView';
import { LeaderboardView } from './LeaderboardView';
import { StockDetailView } from './views/StockDetailView';
import { AdminView } from './views/AdminView';
import { IpoView } from './views/IpoView';
import { ChartIcon, BriefcaseIcon, TrophyIcon, LogoChartIcon, SettingsIcon, RocketIcon } from './components/Icons';
import { TourProvider } from './contexts/TourProvider';

type View = 'market' | 'portfolio' | 'leaderboard' | 'detail' | 'admin' | 'ipo';

export const App = () => {
  const [currentView, setCurrentView] = useState<View>('market');
  const [selectedStonkId, setSelectedStonkId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false); // Default closed until fetched
  const [isLocked, setIsLocked] = useState(false); // If true, non-mod users are kicked back to splash
  const statusConnection = useRef<{ disconnect: () => Promise<void> } | null>(null);

  // Touch swipe handling for mobile navigation
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 50; // minimum distance to trigger swipe
  const SWIPEABLE_VIEWS: View[] = ['market', 'ipo', 'portfolio', 'leaderboard'];

  /** Handles touch start event for swipe detection */
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartX.current = touch.clientX;
      touchEndX.current = null;
    }
  };

  /** Handles touch move event */
  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchEndX.current = touch.clientX;
    }
  };

  /** Handles touch end event and triggers view switch if swipe detected */
  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;

    const diff = touchStartX.current - touchEndX.current;
    const currentIndex = SWIPEABLE_VIEWS.indexOf(currentView);

    // Only process if we're on a swipeable view
    if (currentIndex === -1) return;

    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0) {
        // Swipe left - go to next tab
        const nextView = SWIPEABLE_VIEWS[currentIndex + 1];
        if (nextView) setCurrentView(nextView);
      } else {
        // Swipe right - go to previous tab
        const prevView = SWIPEABLE_VIEWS[currentIndex - 1];
        if (prevView) setCurrentView(prevView);
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  /** Check if redirected from splash with a specific stonk to open */
  useEffect(() => {
    const checkDeepLink = () => {
      const stonkId = localStorage.getItem('openStonkId');
      if (stonkId) {
        console.log('[App] Found openStonkId:', stonkId);
        localStorage.removeItem('openStonkId'); // Clear it immediately
        setSelectedStonkId(stonkId);
        setCurrentView('detail');
      }

      const initialView = localStorage.getItem('initialView');
      if (initialView) {
        console.log('[App] Found initialView:', initialView);
        localStorage.removeItem('initialView');
        setCurrentView(initialView as View);
      }

      const ipoTicker = localStorage.getItem('openIpoTicker');
      if (ipoTicker) {
        console.log('[App] Found openIpoTicker:', ipoTicker);
        // We set the view to ipo if it's an ipo ticker deep-link
        setCurrentView('ipo');
        // Do NOT remove openIpoTicker yet, IpoView needs it for highlighting
      }
    };

    // Check on mount
    checkDeepLink();

    // Also check on visibility change (in case app was already loaded/backgrounded)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkDeepLink();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Check if user is a moderator on mount
  useEffect(() => {
    const checkModStatus = async () => {
      try {
        const response = await fetch('/api/mod/check');
        const data = await response.json();
        setIsAdmin(data.isModerator === true);
      } catch (err) {
        console.error('Failed to check mod status:', err);
        setIsAdmin(false);
      }
    };
    checkModStatus();

    // Subscribe to Market Status Updates
    const setupRealtime = async () => {
      try {
        statusConnection.current = await connectRealtime({
          channel: 'market_status',
          onMessage: (data: any) => {
            console.log('[App] market_status received:', data);
            if (data && typeof data.eventActive === 'boolean') {
              setIsMarketOpen(data.eventActive);
            }
            if (data && typeof data.eventLocked === 'boolean') {
              setIsLocked(data.eventLocked);
            }
          }
        });
      } catch (err) {
        console.error('[App] Realtime failed:', err);
      }
    };
    setupRealtime();

    // Fetch config once on mount (realtime handles updates)
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
        }
      } catch (e) {
        console.error('[App] Config fetch failed:', e);
      }
    };
    fetchGameConfig();

    return () => {
      statusConnection.current?.disconnect();
    };
  }, []);
  const [subredditName, setSubredditName] = useState<string>('Stonks');

  useState(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          if (data.subredditName) {
            setSubredditName(data.subredditName);
          }
        }
      } catch (err) {
        console.error('Failed to fetch config', err);
      }
    };
    fetchConfig();
  });

  const handleStonkClick = (stonkId: string) => {
    setSelectedStonkId(stonkId);
    setCurrentView('detail');
  };

  const handleBackToMarket = () => {
    setSelectedStonkId(null);
    setCurrentView('market');
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] max-w-[100vw]">
      {/* Header */}
      <header className="flex items-center justify-center px-4 lg:px-6 py-2 lg:py-3 border-b border-[#27272a] safe-area-top bg-[#0f0f0f] relative mx-2">
        <div className="flex items-center gap-2 justify-center">
          <LogoChartIcon size={28} className="text-[#FF4500]" />
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gradient">
            Stonks
          </h1>
        </div>
        <div className="absolute right-4 lg:right-6 flex items-center gap-2 px-3 py-1.5 bg-[#18181b] rounded-full border border-[#27272a]">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isMarketOpen ? 'bg-[#22c55e]' : 'bg-red-500'}`}></div>
          <span className="text-xs lg:text-sm text-[#a1a1aa] font-medium uppercase tracking-wide">
            {isMarketOpen ? 'Live' : 'Paused'}
          </span>
        </div>
      </header>

      {/* Desktop Navigation - Top (hidden on mobile) */}
      {currentView !== 'detail' && (
        <nav className="hidden lg:flex items-center justify-center gap-1 border-b border-[#27272a] bg-[#0f0f0f] px-4 py-2">
          <button
            onClick={() => setCurrentView('market')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-200 ${currentView === 'market'
              ? 'bg-[#FF4500] text-white shadow-lg'
              : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
              }`}
            aria-label="Market"
          >
            <ChartIcon size={20} />
            <span className="font-medium">Market</span>
          </button>
          <button
            onClick={() => setCurrentView('ipo')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-200 ${currentView === 'ipo'
              ? 'bg-[#FF4500] text-white shadow-lg'
              : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
              }`}
            aria-label="IPO"
          >
            <RocketIcon size={20} />
            <span className="font-medium">IPO</span>
          </button>
          <button
            onClick={() => setCurrentView('portfolio')}
            className={`tour-nav-portfolio flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-200 ${currentView === 'portfolio'
              ? 'bg-[#FF4500] text-white shadow-lg'
              : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
              }`}
            aria-label="Portfolio"
          >
            <BriefcaseIcon size={20} />
            <span className="font-medium">Portfolio</span>
          </button>
          <button
            onClick={() => setCurrentView('leaderboard')}
            className={`tour-nav-leaderboard flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-200 ${currentView === 'leaderboard'
              ? 'bg-[#FF4500] text-white shadow-lg'
              : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
              }`}
            aria-label="Leaderboard"
          >
            <TrophyIcon size={20} />
            <span className="font-medium">Leaderboard</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setCurrentView('admin')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-200 ${currentView === 'admin'
                ? 'bg-[#FF4500] text-white shadow-lg'
                : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
                }`}
              aria-label="Admin"
            >
              <SettingsIcon size={20} />
              <span className="font-medium">Admin</span>
            </button>
          )}
        </nav>
      )}

      {/* Main Content - Scrollable with View Transitions and Swipe Support */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="min-h-full game-content-wrapper">
          {currentView === 'market' && (
            <div className="view-enter">
              <MarketView onStonkClick={handleStonkClick} subredditName={subredditName} isMarketOpen={isMarketOpen} />
            </div>
          )}
          {currentView === 'ipo' && (
            <div className="view-enter">
              <IpoView />
            </div>
          )}
          {currentView === 'portfolio' && (
            <div className="view-enter">
              <PortfolioView onStonkClick={handleStonkClick} isMarketOpen={isMarketOpen} />
            </div>
          )}
          {currentView === 'leaderboard' && (
            <div className="view-enter">
              <LeaderboardView />
            </div>
          )}
          {currentView === 'admin' && isAdmin && (
            <div className="view-enter">
              <AdminView />
            </div>
          )}
          {currentView === 'detail' && selectedStonkId && (
            <div className="view-enter">
              <StockDetailView stonkId={selectedStonkId} onBack={handleBackToMarket} isMarketOpen={isMarketOpen} />
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation - Mobile Only (hidden on desktop) */}
      {currentView !== 'detail' && (
        <nav className="flex lg:hidden items-center justify-around border-t border-[#27272a] bg-[#0f0f0f] safe-area-bottom shadow-lg">
          <button
            onClick={() => setCurrentView('market')}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'market'
              ? 'text-[#FF4500]'
              : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            aria-label="Market"
          >
            <ChartIcon size={22} />
            <div className={`text-[13px] sm:text-[15px] font-medium transition-all ${currentView === 'market' ? 'scale-105' : 'scale-100'
              }`}>
              Market
            </div>
          </button>
          <button
            onClick={() => setCurrentView('ipo')}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'ipo'
              ? 'text-[#FF4500]'
              : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            aria-label="IPO"
          >
            <RocketIcon size={22} />
            <div className={`text-[13px] sm:text-[15px] font-medium transition-all ${currentView === 'ipo' ? 'scale-105' : 'scale-100'
              }`}>
              IPO
            </div>
          </button>
          <button
            id="tour-nav-portfolio"
            onClick={() => setCurrentView('portfolio')}
            className={`tour-nav-portfolio relative flex-1 flex flex-col items-center gap-0.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'portfolio'
              ? 'text-[#FF4500]'
              : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            aria-label="Portfolio"
          >
            <BriefcaseIcon size={22} />
            <div className={`text-[13px] sm:text-[15px] font-medium transition-all ${currentView === 'portfolio' ? 'scale-105' : 'scale-100'
              }`}>
              Portfolio
            </div>

          </button>
          <button
            id="tour-nav-leaderboard"
            onClick={() => setCurrentView('leaderboard')}
            className={`tour-nav-leaderboard relative flex-1 flex flex-col items-center gap-0.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'leaderboard'
              ? 'text-[#FF4500]'
              : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            aria-label="Leaderboard"
          >
            <TrophyIcon size={22} />
            <div className={`text-[13px] sm:text-[15px] font-medium transition-all ${currentView === 'leaderboard' ? 'scale-105' : 'scale-100'
              }`}>
              Leaderboard
            </div>

          </button>
          {/* Admin Tab - Only visible for moderators */}
          {isAdmin && (
            <button
              onClick={() => setCurrentView('admin')}
              className={`relative flex-1 flex flex-col items-center gap-1.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'admin'
                ? 'text-[#FF4500]'
                : 'text-[#71717a] hover:text-[#a1a1aa]'
                }`}
              aria-label="Admin"
            >
              <SettingsIcon size={22} />
              <div className={`text-xs sm:text-sm font-medium transition-all ${currentView === 'admin' ? 'scale-105' : 'scale-100'
                }`}>
                Admin
              </div>

            </button>
          )}
        </nav>
      )}
    </div>
  );
};

