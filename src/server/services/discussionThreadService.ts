/**
 * Discussion Thread Service - Manages Reddit discussion threads for stock chat.
 * Each stock gets its own discussion thread where comments are posted as users.
 */

import { redis, reddit, context } from '@devvit/web/server';
import { CHAT_MAX_MESSAGES } from '../../shared/config';
import type { ChatMessage } from '../../shared/types/stonks';

/**
 * Chat cooldown in seconds (reused from old system).
 */
const CHAT_COOLDOWN_SECONDS = 10;

/**
 * Redis key for storing discussion thread IDs.
 */
const getThreadKey = (stonkId: string) => `stonk:${stonkId}:discussion_thread`;

/**
 * Checks if user is on cooldown for chat.
 * Returns remaining seconds if on cooldown, 0 if allowed.
 */
export async function checkChatCooldown(userId: string): Promise<number> {
    const key = `chat:cooldown:${userId}`;
    const expiryStr = await redis.get(key);
    if (!expiryStr) return 0;

    const expiryTime = parseInt(expiryStr);
    const now = Date.now();
    const remainingMs = expiryTime - now;

    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/**
 * Sets chat cooldown for user.
 */
async function setChatCooldown(userId: string): Promise<void> {
    const key = `chat:cooldown:${userId}`;
    const expiryTime = Date.now() + (CHAT_COOLDOWN_SECONDS * 1000);
    await redis.set(key, String(expiryTime));
    await redis.expire(key, CHAT_COOLDOWN_SECONDS + 5); // Auto-cleanup with buffer
}

/**
 * Gets the cached discussion thread ID for a stock, or creates a new one.
 */
export async function getOrCreateDiscussionThread(
    stonkId: string,
    ticker: string,
    subredditName: string
): Promise<string> {
    const threadKey = getThreadKey(stonkId);

    // Check cache first
    const cachedThreadId = await redis.get(threadKey);
    if (cachedThreadId) {
        return cachedThreadId;
    }

    // Create new discussion thread
    console.log(`[DiscussionThread] Creating new thread for ${ticker} in r/${subredditName}`);

    const post = await reddit.submitPost({
        subredditName,
        title: `💬 $${ticker} Live Discussion`,
        text: `This is the live discussion thread for **$${ticker}**.\n\nComments in this thread are posted by the Stonks app on behalf of users through the in-app live chat. Each comment is attributed to the user who sent it.`,
    });

    const threadId = post.id;

    // Set comment sort to 'new' so API always returns latest comments first
    try {
        await post.setSuggestedCommentSort('NEW');
    } catch (e) {
        console.log('[DiscussionThread] Could not set comment sort:', e);
    }

    // Cache the thread ID (no expiration - threads are permanent)
    await redis.set(threadKey, threadId);

    console.log(`[DiscussionThread] Created thread ${threadId} for ${ticker}`);

    return threadId;
}

/**
 * Submits a comment to the discussion thread on behalf of the user.
 * Falls back to APP mode if USER mode is not approved yet.
 */
export async function submitComment(
    stonkId: string,
    ticker: string,
    text: string,
    userId: string,
    username: string
): Promise<ChatMessage> {
    // Check cooldown first
    const cooldownRemaining = await checkChatCooldown(userId);
    if (cooldownRemaining > 0) {
        throw new Error(`Please wait ${cooldownRemaining}s before sending another message`);
    }

    // Get or create the discussion thread
    const subredditName = context.subredditName;
    if (!subredditName) {
        throw new Error('Subreddit name not available in context');
    }

    const threadId = await getOrCreateDiscussionThread(stonkId, ticker, subredditName);

    const trimmedText = text.trim().slice(0, 280);
    let comment;
    let runAsMode: 'USER' | 'APP' = 'USER';

    // Try to submit as USER first (only works in production after approval)
    try {
        comment = await reddit.submitComment({
            id: threadId as `t3_${string}`,
            text: trimmedText,
            runAs: 'USER',
        });
        console.log('[DiscussionThread] Posted comment as USER');
    } catch (error) {
        // If USER mode fails (not approved yet), fall back to APP mode
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('not approved to run as user') || errorMsg.includes('not allowed to run as user')) {
            console.log('[DiscussionThread] USER mode not available, falling back to APP mode');
            runAsMode = 'APP';

            // Submit as APP instead
            comment = await reddit.submitComment({
                id: threadId as `t3_${string}`,
                text: trimmedText,
                runAs: 'APP',
            });
        } else {
            // Re-throw if it's a different error
            throw error;
        }
    }

    // Set cooldown for user
    await setChatCooldown(userId);

    // Transform Reddit comment to ChatMessage format
    const chatMessage: ChatMessage = {
        id: comment.id,
        userId: userId,
        username: runAsMode === 'USER' ? username : `🤖 ${username}`,
        text: comment.body || trimmedText,
        time: comment.createdAt.getTime(),
        permalink: comment.permalink,
    };

    return chatMessage;
}

/**
 * Gets the latest comments from the discussion thread.
 * Fetches only 100 latest (Reddit returns newest-first thanks to sort: new on thread).
 */
export async function getComments(
    stonkId: string,
    limit: number = CHAT_MAX_MESSAGES
): Promise<ChatMessage[]> {
    const threadKey = getThreadKey(stonkId);
    const threadId = await redis.get(threadKey);

    if (!threadId) {
        return [];
    }

    try {
        // One-time fix: set sort to 'NEW' for threads created before this change
        const sortFixKey = `${threadKey}:sort_fixed`;
        const sortFixed = await redis.get(sortFixKey);
        if (!sortFixed) {
            try {
                const post = await reddit.getPostById(threadId as `t3_${string}`);
                await post.setSuggestedCommentSort('NEW');
                await redis.set(sortFixKey, '1');
                console.log(`[DiscussionThread] Fixed sort for existing thread ${threadId}`);
            } catch (e) {
                // Non-critical, continue anyway
                await redis.set(sortFixKey, '1');
            }
        }

        // Fetch ALL comments from the thread using .all() — this is the only reliable method.
        // sort/threaded/truncate params are silently stripped by Devvit's wrapper, so we sort & slice ourselves.
        const commentsListing = await reddit.getComments({
            postId: threadId as `t3_${string}`,
            limit: 200,
            pageSize: 100,
        });

        const comments = await commentsListing.all();

        // Filter out removed/deleted/spam comments
        const visibleComments = comments.filter(c => {
            if (c.removed || c.spam) return false;
            if (c.authorName === '[deleted]') return false;
            if (c.body === '[deleted]' || c.body === '[removed]') return false;
            return true;
        });

        // Transform to ChatMessage format
        const chatMessages: ChatMessage[] = visibleComments.map(comment => ({
            id: comment.id,
            userId: comment.authorId || 'unknown',
            username: comment.authorName || 'Unknown',
            text: comment.body || '',
            time: comment.createdAt.getTime(),
            permalink: comment.permalink,
        }));

        // Sort oldest-first for chat display
        chatMessages.sort((a, b) => a.time - b.time);

        // Keep only the NEWEST `limit` messages (slice from the end)
        const recentMessages = chatMessages.slice(-limit);

        return recentMessages;
    } catch (error) {
        console.error('[DiscussionThread] Error fetching comments:', error);
        return [];
    }
}
