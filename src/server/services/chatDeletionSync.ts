/**
 * Background service to periodically check for deleted/removed comments
 * and broadcast deletions to all connected clients via WebSocket.
 * 
 * SIMPLIFIED VERSION: Uses basic Redis operations (get/set) instead of sets/sorted sets
 */

import { redis, reddit, realtime } from '@devvit/web/server';

/**
 * Store comment IDs for each thread to detect deletions
 */
const getThreadCommentsKey = (threadId: string) => `chat:thread_comments:${threadId}`;

/**
 * Ensures comment ID has the proper t1_ prefix
 */
const ensureCommentPrefix = (id: string): `t1_${string}` => {
    return id.startsWith('t1_') ? id as `t1_${string}` : `t1_${id}`;
};

/**
 * Syncs comments for a specific thread and broadcasts any deletions
 */
async function syncThreadDeletions(threadId: string): Promise<void> {
    try {
        const commentsKey = getThreadCommentsKey(threadId);

        // Get previously seen comment IDs (stored as JSON array)
        const previousJson = await redis.get(commentsKey);
        const previousCommentIds: `t1_${string}`[] = previousJson
            ? (JSON.parse(previousJson) as string[]).map(ensureCommentPrefix)
            : [];

        // Fetch current comments from Reddit
        const commentsListing = await reddit.getComments({
            postId: threadId as `t3_${string}`,
            limit: 100,
            pageSize: 100,
        });

        const currentComments = await commentsListing.all();

        // Filter out deleted, removed, or spam comments
        // These should be treated as if they don't exist
        const validComments = currentComments.filter(c => {
            // Check if removed by mod or marked as spam
            if (c.removed || c.spam) return false;

            // Check if user-deleted (authorName becomes '[deleted]')
            if (c.authorName === '[deleted]') return false;

            // Check if body indicates deletion/removal
            if (c.body === '[deleted]' || c.body === '[removed]') return false;

            return true;
        });

        const currentCommentIds = validComments.map(c => ensureCommentPrefix(c.id));

        // Detect deletions: comments that were there before but aren't now
        const currentSet = new Set(currentCommentIds);
        const deletedCommentIds = previousCommentIds.filter(id => !currentSet.has(id));

        if (deletedCommentIds.length > 0) {
            console.log(`[DeletionSync] Found ${deletedCommentIds.length} deleted comments in thread ${threadId}`);

            // Broadcast each deletion
            for (const commentId of deletedCommentIds) {
                await realtime.send('chat_delete', {
                    commentId,
                    threadId
                });
            }
        }

        // Update stored comment IDs with current state
        if (currentCommentIds.length > 0) {
            await redis.set(commentsKey, JSON.stringify(currentCommentIds));
        } else {
            await redis.del(commentsKey);
        }

    } catch (error) {
        console.error(`[DeletionSync] Error syncing thread ${threadId}:`, error);
    }
}

/**
 * Main background job - syncs all active discussion threads
 */
export async function syncAllThreadDeletions(): Promise<void> {
    try {
        // Get all stonks to find their discussion threads
        // We'll use the stonks list from Redis
        const stonksListKey = 'stonks:list';
        const stonkIds = await redis.zRange(stonksListKey, 0, -1);

        if (!stonkIds || stonkIds.length === 0) {
            console.log('[DeletionSync] No stocks found');
            return;
        }

        // Get thread IDs for each stonk
        const threadIds: string[] = [];
        for (const stonkId of stonkIds) {
            const threadKey = `stonk:${stonkId}:discussion_thread`;
            const threadId = await redis.get(threadKey);
            if (threadId) {
                threadIds.push(threadId);
            }
        }

        if (threadIds.length === 0) {
            console.log('[DeletionSync] No active threads to sync');
            return;
        }

        console.log(`[DeletionSync] Syncing ${threadIds.length} discussion threads`);

        // Sync each thread
        for (const threadId of threadIds) {
            await syncThreadDeletions(threadId);
        }

        console.log('[DeletionSync] Sync complete');

    } catch (error) {
        console.error('[DeletionSync] Error in background sync:', error);
    }
}

/**
 * Registers a comment ID when it's posted (so we can detect when it's deleted)
 */
export async function registerComment(threadId: string, commentId: string): Promise<void> {
    const commentsKey = getThreadCommentsKey(threadId);

    // Get existing IDs
    const existingJson = await redis.get(commentsKey);
    const existingIds: string[] = existingJson ? JSON.parse(existingJson) : [];

    // Add new ID if not already present (ensure it has t1_ prefix)
    const prefixedCommentId = ensureCommentPrefix(commentId);
    if (!existingIds.includes(prefixedCommentId)) {
        existingIds.push(prefixedCommentId);
        await redis.set(commentsKey, JSON.stringify(existingIds));
    }
}
