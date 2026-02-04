/**
 * Chat Service - Manages live chat messages for stonks.
 * Uses Redis sorted sets for storage and cache helper for efficient serving.
 */

import { redis, cache } from '@devvit/web/server';
import { REDIS_KEYS, CHAT_LIMIT, CHAT_CACHE_TTL } from '../../shared/config';
import type { ChatMessage } from '../../shared/types/stonks';

/**
 * Chat cooldown in seconds.
 */
const CHAT_COOLDOWN_SECONDS = 10;

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
 * Adds a new message to the chat.
 * Checks cooldown and trims history to keep only the latest messages.
 */
export async function addMessage(
    stonkId: string,
    user: { id: string; username: string },
    text: string
): Promise<ChatMessage> {
    // Check cooldown first
    const cooldownRemaining = await checkChatCooldown(user.id);
    if (cooldownRemaining > 0) {
        throw new Error(`Please wait ${cooldownRemaining}s before sending another message`);
    }

    const now = Date.now();
    const messageId = crypto.randomUUID();

    const message: ChatMessage = {
        id: messageId,
        userId: user.id,
        username: user.username,
        text: text.trim().slice(0, 280), // Simple truncation
        time: now,
    };

    const key = REDIS_KEYS.stonkChat(stonkId);

    // Add to Redis ZSET with timestamp as score
    await redis.zAdd(key, { score: now, member: JSON.stringify(message) });

    // Trim to keep only the latest N messages
    const count = await redis.zCard(key);
    if (count > CHAT_LIMIT) {
        await redis.zRemRangeByRank(key, 0, count - CHAT_LIMIT - 1);
    }

    // Set cooldown for user
    await setChatCooldown(user.id);

    return message;
}

/**
 * Gets messages for a stonk.
 * If `since` is provided, returns messages after that timestamp.
 * Otherwise, returns the latest messages.
 */
export async function getMessages(
    stonkId: string,
    since?: number
): Promise<ChatMessage[]> {
    const key = REDIS_KEYS.stonkChat(stonkId);
    const cacheKey = `chat:${stonkId}:${since || 'latest'}`;

    const result = await cache(
        async () => {
            let entries: { member: string; score: number }[];

            if (since) {
                // Get messages after `since` timestamp
                // zRangeByScore(key, min, max)
                entries = await redis.zRange(key, since + 1, Infinity, { by: 'score' });
            } else {
                // Get latest N messages
                // zRange(key, start, stop)
                entries = await redis.zRange(key, -CHAT_LIMIT, -1);
            }

            if (!entries || entries.length === 0) return [];

            return entries.map(e => JSON.parse(e.member));
        },
        { key: cacheKey, ttl: CHAT_CACHE_TTL }
    );

    return (result as ChatMessage[]) || [];
}
