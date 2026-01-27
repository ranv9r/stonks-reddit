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
import { reddit } from '@devvit/web/server';

export async function getLeaderboard(
    currentUserId: string | null
): Promise<LeaderboardResponse> {
    // Get top traders
    const topEntries = await redisService.getTopLeaderboard(LEADERBOARD_TOP_N);

    // Get current user's rank if not in top N
    let userRankEntry: LeaderboardEntry | null = null;
    let rank: number | null = null;

    if (currentUserId) {
        const isInTop = topEntries.some((entry) => entry.userId === currentUserId);

        if (!isInTop) {
            rank = await redisService.getUserRank(currentUserId);
            if (rank !== null) {
                const netWorth = await tradingEngine.calculateNetWorth(currentUserId, STARTING_BALANCE);
                // Placeholder, will fetch name below
                userRankEntry = {
                    rank: rank + 1,
                    userId: currentUserId,
                    username: 'You',
                    netWorth,
                    isCurrentUser: true,
                };
            }
        }
    }

    // Collect all unique User IDs to fetch names
    const userIdsToFetch = new Set<string>();
    topEntries.forEach(entry => userIdsToFetch.add(entry.userId));
    if (userRankEntry) userIdsToFetch.add(userRankEntry.userId);

    // Fetch usernames in parallel
    const usernameMap = new Map<string, string>();

    try {
        await Promise.all(
            Array.from(userIdsToFetch).map(async (uid) => {
                let name = `u/${uid.substring(0, 8)}`;
                try {
                    const user = await reddit.getUserById(uid as `t2_${string}`);
                    if (user) {
                        name = user.username.startsWith('u/') ? user.username : `u/${user.username}`;
                    }
                } catch (err) {
                    console.warn(`[Leaderboard] Failed to fetch user ${uid}:`, err);
                }
                usernameMap.set(uid, name);
            })
        );
    } catch (err) {
        console.error('[Leaderboard] Error fetching usernames:', err);
    }

    // Build final top traders list
    const topTraders: LeaderboardEntry[] = topEntries.map((entry, i) => ({
        rank: i + 1,
        userId: entry.userId,
        username: usernameMap.get(entry.userId) || `u/${entry.userId.substring(0, 8)}`,
        netWorth: entry.score,
        isCurrentUser: entry.userId === currentUserId,
    }));

    // Update current user rank entry with name if it exists (though UI might say "You")
    if (userRankEntry) {
        userRankEntry.username = usernameMap.get(userRankEntry.userId) || 'You';
    }

    // Get total participants
    const totalParticipants = await redisService.getLeaderboardCount();

    return {
        topTraders,
        userRank: userRankEntry,
        totalParticipants,
    };
}
