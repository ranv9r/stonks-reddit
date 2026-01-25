/**
 * Main App component for Meme Stonks game.
 * Handles navigation between Market, Portfolio, and Leaderboard views.
 * Optimized for mobile, tablet, and desktop responsiveness.
 */

import { useState, useEffect } from 'react';
import { MarketView } from './views/MarketView';
import { PortfolioView } from './views/PortfolioView';
import { LeaderboardView } from './LeaderboardView';
import { StockDetailView } from './views/StockDetailView';

type View = 'market' | 'portfolio' | 'leaderboard' | 'detail';

export const App = () => {
  const [currentView, setCurrentView] = useState<View>('market');
  const [selectedStonkId, setSelectedStonkId] = useState<string | null>(null);

  const handleStonkClick = (stonkId: string) => {
    setSelectedStonkId(stonkId);
    setCurrentView('detail');
  };

  const handleBackToMarket = () => {
    setSelectedStonkId(null);
    setCurrentView('market');
  };

  return (
    <div className="flex flex-col h-screen bg-black max-w-[100vw]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-b border-[#2d2d2d] safe-area-top">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white">
          📈 Meme Stonks
        </h1>
        <div className="hidden sm:block text-xs lg:text-sm text-gray-400">
          Live Trading
        </div>
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-h-full">
          {currentView === 'market' && <MarketView onStonkClick={handleStonkClick} />}
          {currentView === 'portfolio' && <PortfolioView onStonkClick={handleStonkClick} />}
          {currentView === 'leaderboard' && <LeaderboardView />}
          {currentView === 'detail' && selectedStonkId && (
            <StockDetailView stonkId={selectedStonkId} onBack={handleBackToMarket} />
          )}
        </div>
      </main>

      {/* Bottom Navigation - Fixed */}
      {currentView !== 'detail' && (
        <nav className="flex items-center justify-around border-t border-[#2d2d2d] bg-black safe-area-bottom">
          <button
            onClick={() => setCurrentView('market')}
            className={`flex-1 py-3 sm:py-4 text-center transition-colors ${currentView === 'market'
                ? 'text-[#FF4500] border-t-2 border-[#FF4500]'
                : 'text-gray-500 hover:text-gray-400'
              }`}
            aria-label="Market"
          >
            <div className="text-xl sm:text-2xl">📊</div>
            <div className="text-xs sm:text-sm mt-1">Market</div>
          </button>
          <button
            onClick={() => setCurrentView('portfolio')}
            className={`flex-1 py-3 sm:py-4 text-center transition-colors ${currentView === 'portfolio'
                ? 'text-[#FF4500] border-t-2 border-[#FF4500]'
                : 'text-gray-500 hover:text-gray-400'
              }`}
            aria-label="Portfolio"
          >
            <div className="text-xl sm:text-2xl">💼</div>
            <div className="text-xs sm:text-sm mt-1">Portfolio</div>
          </button>
          <button
            onClick={() => setCurrentView('leaderboard')}
            className={`flex-1 py-3 sm:py-4 text-center transition-colors ${currentView === 'leaderboard'
                ? 'text-[#FF4500] border-t-2 border-[#FF4500]'
                : 'text-gray-500 hover:text-gray-400'
              }`}
            aria-label="Leaderboard"
          >
            <div className="text-xl sm:text-2xl">🏆</div>
            <div className="text-xs sm:text-sm mt-1">Leaderboard</div>
          </button>
        </nav>
      )}
    </div>
  );
};
