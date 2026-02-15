/**
 * Discussion Thread Service - Manages Reddit discussion threads for stock chat.
 * Each stock gets its own discussion thread where comments are posted as users.
 */

import { redis, reddit, context } from '@devvit/web/server';
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
        text: `This is the live discussion thread for **$${ticker}**. All chat messages appear here as comments.\n\n_Comments are posted by users, not by the app._`,
    });

    const threadId = post.id;

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
    };

    return chatMessage;
}

/**
 * Gets comments from the discussion thread.
 * Returns empty array if no thread exists yet.
 */
export async function getComments(
    stonkId: string,
    limit: number = 100
): Promise<ChatMessage[]> {
    const threadKey = getThreadKey(stonkId);
    const threadId = await redis.get(threadKey);

    // If no thread exists yet, return empty array
    if (!threadId) {
        return [];
    }

    try {
        // Fetch comments from Reddit
        const commentsListing = await reddit.getComments({
            postId: threadId as `t3_${string}`,
            limit: limit,
            pageSize: 100,
        });

        const comments = await commentsListing.all();

        // Filter out removed/deleted/spam comments
        // Since our app runs with mod permissions, getComments() returns
        // full content of mod-removed comments — we must explicitly filter them
        const visibleComments = comments.filter(c => {
            if (c.removed || c.spam) return false;
            if (c.authorName === '[deleted]') return false;
            if (c.body === '[deleted]' || c.body === '[removed]') return false;
            return true;
        });

        // Transform Reddit comments to ChatMessage format
        const chatMessages: ChatMessage[] = visibleComments.map(comment => ({
            id: comment.id,
            userId: comment.authorId || 'unknown',
            username: comment.authorName || 'Unknown',
            text: comment.body || '',
            time: comment.createdAt.getTime(),
        }));

        // Sort by time (oldest first, like a chat)
        chatMessages.sort((a, b) => a.time - b.time);

        return chatMessages;
    } catch (error) {
        console.error('[DiscussionThread] Error fetching comments:', error);
        return [];
    }
}
