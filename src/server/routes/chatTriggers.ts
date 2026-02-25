/**
 * Chat trigger handlers for instant comment delete/edit updates.
 * Replaces the old polling-based chatDeletionSync service.
 * Devvit fires these triggers whenever a comment is deleted or edited in the subreddit.
 */

import { Router } from 'express';
import { redis, realtime } from '@devvit/web/server';
import type {
    OnCommentDeleteRequest,
    OnCommentUpdateRequest,
    TriggerResponse,
} from '@devvit/web/shared';

const router = Router();

/**
 * Normalizes a Reddit ID by stripping any prefix (t1_, t3_, etc.)
 */
function stripRedditPrefix(id: string): string {
    return id.replace(/^t[0-9]_/, '');
}

/**
 * Checks if a postId belongs to one of our chat discussion threads.
 * Returns the stonkId if found, null otherwise.
 * Handles prefix mismatches (t3_ vs raw ID).
 */
async function getThreadStonkId(postId: string): Promise<string | null> {
    const normalizedPostId = stripRedditPrefix(postId);
    const stonksListKey = 'stonks:list';
    const stonkEntries = await redis.zRange(stonksListKey, 0, -1);

    if (!stonkEntries || stonkEntries.length === 0) {
        console.log('[ChatTrigger] No stonks found in list');
        return null;
    }

    for (const entry of stonkEntries) {
        const stonkId = typeof entry === 'string' ? entry : entry.member;
        const threadKey = `stonk:${stonkId}:discussion_thread`;
        const threadId = await redis.get(threadKey);
        if (threadId) {
            // Compare without prefixes to handle mismatches
            const normalizedThreadId = stripRedditPrefix(threadId);
            if (normalizedThreadId === normalizedPostId) {
                return stonkId;
            }
        }
    }

    return null;
}

/**
 * Handles CommentDelete trigger — broadcasts deletion to all connected clients instantly.
 */
router.post<string, never, TriggerResponse, OnCommentDeleteRequest>(
    '/internal/on-comment-delete',
    async (req, res) => {
        try {
            console.log('[ChatTrigger] onCommentDelete fired:', JSON.stringify(req.body, null, 2));

            const { commentId, postId } = req.body;

            if (!commentId || !postId) {
                console.log('[ChatTrigger] Missing commentId or postId, skipping');
                res.status(200).json({});
                return;
            }

            // Check if this comment belongs to one of our chat threads
            const stonkId = await getThreadStonkId(postId);
            if (!stonkId) {
                console.log(`[ChatTrigger] Post ${postId} is not a chat thread, ignoring`);
                res.status(200).json({});
                return;
            }

            // Keep commentId as-is (frontend stores IDs with t1_ prefix from comment.id)
            // The trigger may or may not include the prefix, so normalize to ensure t1_ is present
            const normalizedId = commentId.startsWith('t1_') ? commentId : `t1_${commentId}`;

            console.log(`[ChatTrigger] ✅ Broadcasting delete: ${normalizedId} (stonk: ${stonkId})`);

            // Broadcast deletion to all clients
            await realtime.send('chat_delete', {
                commentId: normalizedId,
                threadId: postId,
            });

            res.status(200).json({});
        } catch (error) {
            console.error('[ChatTrigger] Error handling comment delete:', error);
            res.status(200).json({});
        }
    }
);

/**
 * Handles CommentUpdate trigger — broadcasts edit to all connected clients instantly.
 */
router.post<string, never, TriggerResponse, OnCommentUpdateRequest>(
    '/internal/on-comment-update',
    async (req, res) => {
        try {
            console.log('[ChatTrigger] onCommentUpdate fired:', JSON.stringify(req.body, null, 2));

            const { comment, post } = req.body;

            if (!comment?.id || !post?.id) {
                console.log('[ChatTrigger] Missing comment.id or post.id, skipping');
                res.status(200).json({});
                return;
            }

            // Check if this comment belongs to one of our chat threads
            const stonkId = await getThreadStonkId(post.id);
            if (!stonkId) {
                console.log(`[ChatTrigger] Post ${post.id} is not a chat thread, ignoring`);
                res.status(200).json({});
                return;
            }

            // Normalize comment ID to ensure t1_ prefix (frontend stores IDs with prefix)
            const normalizedId = comment.id.startsWith('t1_') ? comment.id : `t1_${comment.id}`;
            const newBody = comment.body || '';

            console.log(`[ChatTrigger] ✅ Broadcasting edit: ${normalizedId} -> "${newBody.substring(0, 50)}" (stonk: ${stonkId})`);

            // Broadcast edit to all clients
            await realtime.send('chat_edit', {
                commentId: normalizedId,
                newText: newBody,
                stonkId,
            });

            res.status(200).json({});
        } catch (error) {
            console.error('[ChatTrigger] Error handling comment update:', error);
            res.status(200).json({});
        }
    }
);

export default router;
