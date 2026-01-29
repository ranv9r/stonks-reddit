/**
 * Chat Service - Manages live chat messages for stonks.
 * Uses Redis sorted sets for storage and cache helper for efficient serving.
 */

import { redis, cache } from '@devvit/web/server';
import { REDIS_KEYS, CHAT_LIMIT, CHAT_CACHE_TTL } from '../../shared/config';
import type { ChatMessage } from '../../shared/types/stonks';

/**
 * Adds a new message to the chat.
 * Trims the history to keep only the latest messages.
 */
export async function addMessage(
    stonkId: string,
    user: { id: string; username: string },
    text: string
): Promise<ChatMessage> {
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
    // Remove range from 0 to -(LIMIT + 1)
    // ZREMRANGEBYRANK key 0 -(LIMIT + 1)
    // For 40 items: remove 0 to -41
    const count = await redis.zCard(key);
    if (count > CHAT_LIMIT) {
        await redis.zRemRangeByRank(key, 0, count - CHAT_LIMIT - 1);
    }

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
