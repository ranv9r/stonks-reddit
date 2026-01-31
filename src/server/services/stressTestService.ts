/**
 * Stress Test Service for Meme Stonks.
 * Simulates high-volume trading with configurable parameters.
 * 
 * Features:
 * - Bull/Bear/Neutral rally modes
 * - Fixed trade amounts for predictable testing
 * - Configurable bot count and duration
 */

import { redis } from '@devvit/web/server';
import { executeBuy, executeSell } from './tradingEngine';
import { getAllStonks } from './redis';
import { STARTING_BALANCE } from '../../shared/config';

const STRESS_KEY = 'stress:config';
const BOTS_PER_TICK = 170; // Target ~10k trades over 5 mins

export type RallyMode = 'bull' | 'bear' | 'neutral';

interface StressConfig {
    active: boolean;
    endTime: number;
    numBots: number;
    mode: RallyMode;
    amountPerTrade: number; // Fixed amount in cents
}

/**
 * Starts a configurable stress test.
 */
export async function startStressTest(
    numBots: number = 100,
    durationMinutes: number = 5,
    mode: RallyMode = 'neutral',
    amountPerTrade: number = 10000 // $100 in cents
) {
    const config: StressConfig = {
        active: true,
        endTime: Date.now() + (durationMinutes * 60 * 1000),
        numBots,
        mode,
        amountPerTrade,
    };
    await redis.set(STRESS_KEY, JSON.stringify(config));
    console.log(`[Stress] Started: ${numBots} bots, ${durationMinutes} mins, mode=${mode}, $${amountPerTrade / 100}/trade`);
}

/**
 * Stops the stress test.
 */
export async function stopStressTest() {
    await redis.del(STRESS_KEY);
    console.log('[Stress] Stopped');
}

/**
 * Gets current stress test config.
 */
export async function getStressConfig(): Promise<StressConfig | null> {
    const configStr = await redis.get(STRESS_KEY);
    if (!configStr) return null;
    return JSON.parse(configStr);
}

/**
 * Executes one tick of the stress test.
 * Called by the scheduler every 5 seconds.
 */
export async function tick() {
    try {
        const config = await getStressConfig();
        if (!config || !config.active) return;

        if (Date.now() > config.endTime) {
            await stopStressTest();
            return;
        }

        const stonks = await getAllStonks();
        if (stonks.length === 0) return;

        // Determine buy ratio based on mode
        const buyRatio = config.mode === 'bull' ? 0.9 : config.mode === 'bear' ? 0.1 : 0.5;

        const promises: Promise<any>[] = [];
        for (let i = 0; i < BOTS_PER_TICK; i++) {
            const botId = `bot-${Math.floor(Math.random() * config.numBots)}`;
            const stonk = stonks[Math.floor(Math.random() * stonks.length)];
            if (!stonk) continue; // Safety check

            const isBuy = Math.random() < buyRatio;

            if (isBuy) {
                // Buy with fixed amount
                promises.push(
                    executeBuy(botId, stonk.id, config.amountPerTrade, STARTING_BALANCE)
                        .catch(() => { })
                );
            } else {
                // Sell fixed dollar equivalent in shares
                if (stonk.currentPrice > 0) {
                    const shares = config.amountPerTrade / stonk.currentPrice;
                    promises.push(
                        executeSell(botId, stonk.id, shares, STARTING_BALANCE)
                            .catch(() => { })
                    );
                }
            }
        }

        await Promise.all(promises);
        console.log(`[Stress] Tick: ${promises.length} trades (${config.mode} mode, $${config.amountPerTrade / 100}/trade)`);
    } catch (e) {
        console.error('[Stress] Tick failed:', e);
    }
}
