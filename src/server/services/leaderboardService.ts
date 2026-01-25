/**
 * Leaderboard service for Meme Stonks.
 * Handles leaderboard calculation and retrieval.
 */

import { LEADERBOARD_TOP_N, STARTING_BALANCE } from '../../shared/config';
import type { LeaderboardEntry, LeaderboardResponse } from '../../shared/types/stonks';
import * as redisService from './redis';
import * as tradingEngine from './tradingEngine';

/**
 * Updates the leaderboard by recalculating net worth for all users.
 * This should be called by the 30-minute cron job.
 * 
 * Note: Uses the leaderboard sorted set itself as the user registry.
 * All users are added to leaderboard when they first interact.
 */
export async function updateLeaderboard(): Promise<void> {
    console.log('[Leaderboard] Starting update...');

    // Get all users from leaderboard (they're already registered there)
    const allUsers = await redisService.getTopLeaderboard(1000); // Get up to 1000 users

    let updated = 0;
    for (const userEntry of allUsers) {
        try {
            const netWorth = await tradingEngine.calculateNetWorth(userEntry.userId, STARTING_BALANCE);
            await redisService.updateLeaderboardScore(userEntry.userId, netWorth);
            updated++;
        } catch (error) {
            console.error(`[Leaderboard] Error updating user ${userEntry.userId}:`, error);
        }
    }

    console.log(`[Leaderboard] Updated ${updated} users.`);
}

/**
 * Registers a user on the leaderboard (called when user first trades).
 */
export async function registerUserOnLeaderboard(userId: string): Promise<void> {
    const netWorth = await tradingEngine.calculateNetWorth(userId, STARTING_BALANCE);
    await redisService.updateLeaderboardScore(userId, netWorth);
}

/**
 * Gets the leaderboard data for display.
 */
export async function getLeaderboard(
    currentUserId: string | null
): Promise<LeaderboardResponse> {
    // Get top traders
    const topEntries = await redisService.getTopLeaderboard(LEADERBOARD_TOP_N);

    const topTraders: LeaderboardEntry[] = topEntries.map((entry, i) => ({
        rank: i + 1,
        userId: entry.userId,
        username: `u/${entry.userId.substring(0, 8)}...`, // Placeholder - fetch real username later
        netWorth: entry.score,
        isCurrentUser: entry.userId === currentUserId,
    }));

    // Get current user's rank if not in top N
    let userRank: LeaderboardEntry | null = null;

    if (currentUserId) {
        const isInTop = topTraders.some((t) => t.isCurrentUser);

        if (!isInTop) {
            const rank = await redisService.getUserRank(currentUserId);
            const netWorth = await tradingEngine.calculateNetWorth(currentUserId, STARTING_BALANCE);

            if (rank !== null) {
                userRank = {
                    rank: rank + 1, // zRank is 0-indexed
                    userId: currentUserId,
                    username: 'You',
                    netWorth,
                    isCurrentUser: true,
                };
            }
        }
    }

    // Get total participants
    const totalParticipants = await redisService.getLeaderboardCount();

    return {
        topTraders,
        userRank,
        totalParticipants,
    };
}
