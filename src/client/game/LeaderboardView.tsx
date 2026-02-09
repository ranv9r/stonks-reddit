/**
 * Leaderboard View - Displays top traders ranked by net worth.
 * Fetches on mount, then listens for leaderboard_update realtime notifications.
 */

import { useState, useEffect, useRef } from 'react';
import { connectRealtime } from '@devvit/web/client';
import { TrophyIcon } from './components/Icons';

interface LeaderboardEntry {
    rank: number;
    userId: string;
    username: string;
    netWorth: number;
    isCurrentUser: boolean;
}

interface LeaderboardData {
    topTraders: LeaderboardEntry[];
    userRank: LeaderboardEntry | null;
    totalParticipants: number;
}

export const LeaderboardView = () => {
    const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const connectionRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

    useEffect(() => {
        // Fetch leaderboard once on mount
        fetchLeaderboard();

        // Subscribe to realtime updates for leaderboard refresh notifications
        const setupRealtime = async () => {
            try {
                connectionRef.current = await connectRealtime({
                    channel: 'leaderboard_update',
                    onMessage: () => {
                        // When server broadcasts that leaderboard was updated, re-fetch
                        console.log('[LeaderboardView] Received update notification, refreshing...');
                        fetchLeaderboard();
                    },
                    onConnect: () => console.log('[LeaderboardView] Connected to leaderboard_update'),
                    onDisconnect: () => console.log('[LeaderboardView] Disconnected from leaderboard_update'),
                });
            } catch (err) {
                console.error('[LeaderboardView] Realtime connection failed:', err);
            }
        };

        setupRealtime();

        return () => {
            connectionRef.current?.disconnect();
        };
    }, []);

    /** Fetches leaderboard data from the API. */
    const fetchLeaderboard = async () => {
        try {
            const res = await fetch('/api/leaderboard');
            if (!res.ok) throw new Error('Failed to fetch leaderboard');
            const data = await res.json();
            setLeaderboard(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading leaderboard...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-red-500">Error: {error}</div>
            </div>
        );
    }

    if (!leaderboard) return null;

    return (
        <div id="tour-leaderboard" className="px-4 py-4 sm:px-6 sm:py-6 fade-in max-w-3xl mx-auto mx-2">
            {/* Header */}
            <div className="mb-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <TrophyIcon size={28} className="text-[#FF4500]" />
                    <h2 className="text-[25px] font-extrabold text-white">Top Traders</h2>
                </div>
                <p className="text-[13px] text-[#a1a1aa]">
                    {leaderboard.totalParticipants} total participants
                </p>
            </div>

            {/* Leaderboard List */}
            <div className="flex flex-col gap-3">
                {leaderboard.topTraders.map((entry) => {
                    const isTopThree = entry.rank <= 3;
                    const rankColors = {
                        1: { text: 'text-[#fbbf24]', bg: 'from-[#fbbf24]/30 to-[#fbbf24]/5', border: 'border-[#fbbf24]/50', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.3)]' },
                        2: { text: 'text-[#d1d5db]', bg: 'from-[#d1d5db]/30 to-[#d1d5db]/5', border: 'border-[#d1d5db]/50', glow: 'shadow-[0_0_20px_rgba(209,213,219,0.2)]' },
                        3: { text: 'text-[#fb923c]', bg: 'from-[#fb923c]/30 to-[#fb923c]/5', border: 'border-[#fb923c]/50', glow: 'shadow-[0_0_20px_rgba(251,146,60,0.2)]' }
                    };
                    const colors = rankColors[entry.rank as 1 | 2 | 3];

                    // Dynamic font size based on username length (mobile only via CSS)
                    // Reddit max = 20 chars, scale from 18px (short) to 13px (long)
                    const usernameLen = entry.username.length;
                    const mobileFontSize = usernameLen <= 10 ? 18 : usernameLen <= 15 ? 16 : usernameLen <= 18 ? 14 : 13;

                    return (
                        <div
                            key={entry.userId}
                            className={`
                                relative overflow-hidden rounded-xl px-3 sm:px-6 py-4 transition-all duration-200
                                ${isTopThree
                                    ? `bg-gradient-to-br ${colors?.bg} border-2 ${colors?.border} ${colors?.glow}`
                                    : 'card border-2 border-transparent hover:border-[#27272a]'
                                }
                                ${entry.isCurrentUser && !isTopThree ? 'border-[#FF4500]! shadow-lg' : ''}
                            `}
                        >
                            <div className="flex items-center gap-2 sm:gap-4">
                                {/* Rank Badge */}
                                <div className={`
                                    flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold text-[14px] sm:text-[15px] shrink-0
                                    ${isTopThree
                                        ? `${colors?.text} bg-gradient-to-br ${colors?.bg} border-2 ${colors?.border}`
                                        : 'text-[#71717a] bg-[#18181b] border-2 border-[#27272a]'
                                    }
                                `}>
                                    {entry.rank === 1 && '🥇'}
                                    {entry.rank === 2 && '🥈'}
                                    {entry.rank === 3 && '🥉'}
                                    {entry.rank > 3 && `#${entry.rank}`}
                                </div>

                                {/* User Info */}
                                <div className="flex-1 min-w-0">
                                    <div
                                        className={`font-bold ${isTopThree ? 'text-white' : 'text-white'}`}
                                        style={{ fontSize: `${mobileFontSize}px` }}
                                    >
                                        <span className="sm:hidden">{entry.username}</span>
                                        <span className="hidden sm:inline text-[15px]">{entry.username}</span>
                                    </div>
                                    {entry.isCurrentUser && (
                                        <span className="inline-block mt-1 text-[10px] sm:text-[11px] text-[#FF4500] bg-[#FF4500]/10 px-2 py-0.5 rounded-full font-semibold">
                                            You
                                        </span>
                                    )}
                                </div>

                                {/* Net Worth */}
                                <div className="text-right pl-1 sm:pl-4 shrink-0">
                                    <div className={`font-bold text-[16px] sm:text-[18px] whitespace-nowrap ${isTopThree ? 'text-white' : 'text-white'
                                        }`}>
                                        ${(entry.netWorth / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* User's Rank (only if NOT in top 10) */}
            {leaderboard.userRank && leaderboard.userRank.rank > 10 && (
                <>
                    <div className="my-5 text-center">
                        <div className="inline-block px-4 py-1 bg-[#18181b] rounded-full text-[#71717a] text-[13px]">
                            ···
                        </div>
                    </div>
                    <div className="card p-4 border-2 border-[#FF4500] shadow-lg rounded-xl">
                        <div className="flex items-center gap-4">
                            {/* Rank Badge */}
                            <div className="flex items-center justify-center w-10 h-10 rounded-full font-bold text-[15px] shrink-0 text-[#FF4500] bg-[#FF4500]/10 border-2 border-[#FF4500]">
                                #{leaderboard.userRank.rank}
                            </div>

                            {/* User Info */}
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-[15px] text-white">
                                    Your Rank
                                </div>
                                <span className="inline-block mt-1 text-[11px] text-[#FF4500] bg-[#FF4500]/10 px-2 py-0.5 rounded-full font-semibold">
                                    You
                                </span>
                            </div>

                            {/* Net Worth */}
                            <div className="text-right">
                                <div className="font-bold text-[18px] text-white">
                                    ${(leaderboard.userRank.netWorth / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {leaderboard.topTraders.length === 0 && (
                <div className="text-center text-[#71717a] mt-12 p-8">
                    <div className="text-[35px] mb-3">🏆</div>
                    <div className="text-[15px] font-medium">No traders yet</div>
                    <div className="text-[13px] mt-2">Be the first to trade!</div>
                </div>
            )}
        </div>
    );
};
