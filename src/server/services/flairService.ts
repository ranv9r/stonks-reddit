/**
 * Flair Service - Assigns user flairs based on leaderboard rankings.
 * Only runs if flairs are enabled in game config.
 */

import { reddit, context } from '@devvit/web/server';
import * as redisService from './redis';

/**
 * Determines flair text based on rank and total users.
 * Returns null for users outside top 10%.
 */
function getFlairText(rank: number, totalUsers: number): string | null {
    // Top 10 with specific ranks
    if (rank === 1) return '👑 #1';
    if (rank === 2) return '🥈 #2';
    if (rank === 3) return '🥉 #3';
    if (rank <= 10) return `🏆 #${rank}`;

    // Percentile-based tiers (only if enough users)
    if (totalUsers < 10) return null;

    const percentile = (rank / totalUsers) * 100;
    if (percentile <= 1) return 'Top 1%';
    if (percentile <= 5) return 'Top 5%';
    if (percentile <= 10) return 'Top 10%';

    return null; // Skip users outside top 10%
}

/**
 * Updates flairs for all qualifying users on the leaderboard.
 * Only runs if flairsEnabled is true in game config.
 */
export async function updateAllUserFlairs(): Promise<void> {
    const config = await redisService.getGameConfig();
    if (!config.flairsEnabled) {
        console.log('[Flair] Flairs disabled, skipping update.');
        return;
    }

    const { subredditName } = context;
    if (!subredditName) {
        console.log('[Flair] No subreddit context, skipping update.');
        return;
    }

    console.log('[Flair] Starting flair update...');

    const allUsers = await redisService.getTopLeaderboard(1000);
    const totalUsers = await redisService.getLeaderboardCount();

    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < allUsers.length; i++) {
        const rank = i + 1;
        const flairText = getFlairText(rank, totalUsers);

        if (!flairText) {
            skipped++;
            continue; // Skip non-qualifying users
        }

        try {
            const user = await reddit.getUserById(allUsers[i].userId as `t2_${string}`);
            if (!user) continue;

            await reddit.setUserFlair({
                subredditName,
                username: user.username,
                text: flairText
            });
            updated++;
        } catch (err) {
            console.error(`[Flair] Failed for ${allUsers[i].userId}:`, err);
        }
    }

    console.log(`[Flair] Updated ${updated} users, skipped ${skipped}.`);
}
