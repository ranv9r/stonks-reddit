/**
 * Leaderboard View - Displays top traders ranked by net worth.
 */

import { useState, useEffect } from 'react';

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

    useEffect(() => {
        fetchLeaderboard();
        // Update every 30 seconds
        const interval = setInterval(fetchLeaderboard, 30000);
        return () => clearInterval(interval);
    }, []);

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

    const getRankColor = (rank: number) => {
        if (rank === 1) return 'text-yellow-500';
        if (rank === 2) return 'text-gray-400';
        if (rank === 3) return 'text-orange-600';
        return 'text-gray-600';
    };

    return (
        <div className="p-4">
            {/* Header */}
            <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Top Traders</h2>
                <p className="text-sm text-gray-400">
                    {leaderboard.totalParticipants} total participants
                </p>
            </div>

            {/* Leaderboard List */}
            <div className="space-y-2">
                {leaderboard.topTraders.map((entry) => (
                    <div
                        key={entry.userId}
                        className={`bg-[#1A1A1B] rounded-lg p-4 ${entry.isCurrentUser ? 'border border-[#FF4500]' : ''
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={`text-lg font-bold w-8 text-center ${getRankColor(entry.rank)}`}
                            >
                                #{entry.rank}
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-white">
                                    {entry.username}
                                    {entry.isCurrentUser && (
                                        <span className="ml-2 text-xs text-[#FF4500]">(You)</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-white">
                                    ₿{(entry.netWorth / 100).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* User's Rank (if not in top 10) */}
            {leaderboard.userRank && (
                <>
                    <div className="my-4 text-center text-gray-600">...</div>
                    <div className="bg-[#1A1A1B] rounded-lg p-4 border border-[#FF4500]">
                        <div className="flex items-center gap-3">
                            <div className="text-lg font-bold text-[#FF4500] w-8 text-center">
                                #{leaderboard.userRank.rank}
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-white">
                                    You
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-white">
                                    ₿{(leaderboard.userRank.netWorth / 100).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {leaderboard.topTraders.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                    <div className="text-3xl mb-2">🏆</div>
                    <div>No traders yet</div>
                    <div className="text-sm mt-1">Be the first to trade!</div>
                </div>
            )}
        </div>
    );
};
