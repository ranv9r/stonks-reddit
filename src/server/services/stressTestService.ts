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
// BOTS_PER_TICK removed - using config.numBots dynamically

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

    // Calculate expected trades
    const ticksPerMinute = 12; // Every 5 seconds = 12 per minute
    const totalTicks = durationMinutes * ticksPerMinute;
    const expectedTrades = numBots * totalTicks;
    const expectedVolume = expectedTrades * amountPerTrade;

    // Get initial market volume for comparison later
    const stonks = await getAllStonks();
    const initialVolume = stonks.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
    await redis.set('stress:initial_volume', String(initialVolume));

    console.log(`[Stress] ========== STRESS TEST STARTED ==========`);
    console.log(`[Stress] Config: ${numBots} bots, ${durationMinutes} mins, mode=${mode}, $${amountPerTrade / 100}/trade`);
    console.log(`[Stress] Expected: ${numBots} trades/tick × ${totalTicks} ticks = ${expectedTrades} total trades`);
    console.log(`[Stress] Expected volume added: $${(expectedVolume / 100).toFixed(2)}`);
    console.log(`[Stress] Initial market volume: $${(initialVolume / 100).toFixed(2)}`);
    console.log(`[Stress] =============================================`);
}

/**
 * Stops the stress test and logs final verification.
 */
export async function stopStressTest() {
    // Get final stats before clearing
    const stonks = await getAllStonks();
    const finalVolume = stonks.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
    const initialVolumeStr = await redis.get('stress:initial_volume');
    const initialVolume = initialVolumeStr ? parseInt(initialVolumeStr) : 0;
    const addedVolume = finalVolume - initialVolume;

    console.log(`[Stress] ========== STRESS TEST STOPPED ==========`);
    console.log(`[Stress] Initial volume: $${(initialVolume / 100).toFixed(2)}`);
    console.log(`[Stress] Final volume:   $${(finalVolume / 100).toFixed(2)}`);
    console.log(`[Stress] Added volume:   $${(addedVolume / 100).toFixed(2)}`);
    console.log(`[Stress] =============================================`);

    await redis.del(STRESS_KEY);
    await redis.del('stress:initial_volume');
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
 * Now includes verification logging for trade success tracking.
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

        // Track trade results for verification
        let successfulTrades = 0;
        let failedTrades = 0;
        let totalBuyAmount = 0;
        let totalSellAmount = 0;

        const promises: Promise<void>[] = [];
        // Use configured number of bots for trades per tick
        const tradesThisTick = config.numBots;

        for (let i = 0; i < tradesThisTick; i++) {
            const botId = `bot-${Math.floor(Math.random() * config.numBots)}`;
            const stonk = stonks[Math.floor(Math.random() * stonks.length)];
            if (!stonk) continue; // Safety check

            const isBuy = Math.random() < buyRatio;

            if (isBuy) {
                // Buy with fixed amount
                promises.push(
                    executeBuy(botId, stonk.id, config.amountPerTrade, STARTING_BALANCE)
                        .then(() => {
                            successfulTrades++;
                            totalBuyAmount += config.amountPerTrade;
                        })
                        .catch((err) => {
                            failedTrades++;
                            // Log first few failures for debugging
                            if (failedTrades <= 3) {
                                console.error(`[Stress] Buy failed for ${botId}:`, err);
                            }
                        })
                );
            } else {
                // Sell fixed dollar equivalent in shares
                if (stonk.currentPrice > 0) {
                    const shares = config.amountPerTrade / stonk.currentPrice;
                    promises.push(
                        executeSell(botId, stonk.id, shares, STARTING_BALANCE)
                            .then(() => {
                                successfulTrades++;
                                totalSellAmount += config.amountPerTrade;
                            })
                            .catch((err) => {
                                failedTrades++;
                                if (failedTrades <= 3) {
                                    console.error(`[Stress] Sell failed for ${botId}:`, err);
                                }
                            })
                    );
                }
            }
        }

        await Promise.all(promises);

        // Log verification stats
        const successRate = promises.length > 0 ? ((successfulTrades / promises.length) * 100).toFixed(1) : '0';
        console.log(`[Stress] Tick: ${successfulTrades}/${promises.length} trades succeeded (${successRate}% success rate)`);
        console.log(`[Stress] Buys: $${(totalBuyAmount / 100).toFixed(2)}, Sells: $${(totalSellAmount / 100).toFixed(2)}`);

        if (failedTrades > 0) {
            console.warn(`[Stress] ⚠️ ${failedTrades} trades FAILED this tick!`);
        }

        // Log current total volume from Redis for verification
        const updatedStonks = await getAllStonks();
        const totalMarketVolume = updatedStonks.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
        console.log(`[Stress] Current total market volume: $${(totalMarketVolume / 100).toFixed(2)}`);

    } catch (e) {
        console.error('[Stress] Tick failed:', e);
    }
}
