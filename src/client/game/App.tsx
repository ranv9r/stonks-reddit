/**
 * Main App component for Meme Stonks game.
 * Handles navigation between Market, Portfolio, Leaderboard, and Admin views.
 * Optimized for mobile, tablet, and desktop responsiveness.
 */

import { useState, useEffect } from 'react';
import { MarketView } from './views/MarketView';
import { PortfolioView } from './views/PortfolioView';
import { LeaderboardView } from './LeaderboardView';
import { StockDetailView } from './views/StockDetailView';
import { AdminView } from './views/AdminView';
import { ChartIcon, BriefcaseIcon, TrophyIcon, LogoChartIcon, SettingsIcon } from './components/Icons';

type View = 'market' | 'portfolio' | 'leaderboard' | 'detail' | 'admin';

export const App = () => {
  const [currentView, setCurrentView] = useState<View>('market');
  const [selectedStonkId, setSelectedStonkId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
      <header className="flex items-center justify-center px-4 lg:px-6 py-4 lg:py-5 border-b border-[#27272a] safe-area-top bg-[#0f0f0f] relative">
        <div className="flex items-center gap-2 justify-center">
          <LogoChartIcon size={28} className="text-[#FF4500]" />
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gradient">
            r/{subredditName} Stonks
          </h1>
        </div>
        <div className="absolute right-4 lg:right-6 hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#18181b] rounded-full border border-[#27272a]">
          <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse"></div>
          <span className="text-xs lg:text-sm text-[#a1a1aa] font-medium">Live</span>
        </div>
      </header>

      {/* Main Content - Scrollable with View Transitions */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-h-full game-content-wrapper">
          {currentView === 'market' && (
            <div className="view-enter">
              <MarketView onStonkClick={handleStonkClick} />
            </div>
          )}
          {currentView === 'portfolio' && (
            <div className="view-enter">
              <PortfolioView onStonkClick={handleStonkClick} />
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
              <StockDetailView stonkId={selectedStonkId} onBack={handleBackToMarket} />
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation - Fixed */}
      {currentView !== 'detail' && (
        <nav className="flex items-center justify-around border-t border-[#27272a] bg-[#0f0f0f] safe-area-bottom shadow-lg">
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
            {currentView === 'market' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-[#FF4500] rounded-t-full"></div>
            )}
          </button>
          <button
            onClick={() => setCurrentView('portfolio')}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'portfolio'
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
            {currentView === 'portfolio' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-[#FF4500] rounded-t-full"></div>
            )}
          </button>
          <button
            onClick={() => setCurrentView('leaderboard')}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'leaderboard'
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
            {currentView === 'leaderboard' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-[#FF4500] rounded-t-full"></div>
            )}
          </button>
          {/* Admin Tab - Only visible for moderators */}
          {isAdmin && (
            <button
              onClick={() => setCurrentView('admin')}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 sm:py-4 transition-all duration-200 ${currentView === 'admin'
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
              {currentView === 'admin' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-[#FF4500] rounded-t-full"></div>
              )}
            </button>
          )}
        </nav>
      )}
    </div>
  );
};

