/**
 * Stress Test Service for Meme Stonks.
 * Simulates realistic trading load with rate limiting.
 * 
 * Features:
 * - Rate-limited trades (spread over time, not all at once)
 * - Configurable TPS (trades per second) and concurrency
 * - Detailed metrics: latency, success rate, actual TPS
 * - Bull/Bear/Neutral rally modes
 */

import { redis } from '@devvit/web/server';
import { executeBuy, executeSell } from './tradingEngine';
import { getAllStonks } from './redis';
import { STARTING_BALANCE } from '../../shared/config';

const STRESS_KEY = 'stress:config';
const METRICS_KEY = 'stress:metrics';

export type RallyMode = 'bull' | 'bear' | 'neutral';

interface StressConfig {
    active: boolean;
    endTime: number;
    mode: RallyMode;
    amountPerTrade: number;
    // New rate-limiting config
    tradesPerSecond: number;  // Target TPS
    maxConcurrent: number;    // Max parallel trades at once
}

interface TickMetrics {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    totalBuyAmount: number;
    totalSellAmount: number;
    totalLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    actualDurationMs: number;
}

/**
 * Starts a configurable stress test with rate limiting.
 */
export async function startStressTest(
    tradesPerSecond: number = 50,
    maxConcurrent: number = 10,
    durationSeconds: number = 20,
    mode: RallyMode = 'neutral',
    amountPerTrade: number = 10000
) {
    const config: StressConfig = {
        active: true,
        endTime: Date.now() + (durationSeconds * 1000),
        mode,
        amountPerTrade,
        tradesPerSecond,
        maxConcurrent,
    };
    await redis.set(STRESS_KEY, JSON.stringify(config));

    // Calculate expected trades
    const tickIntervalMs = 5000; // 5 second ticks
    const tradesPerTick = tradesPerSecond * (tickIntervalMs / 1000);
    const totalTicks = Math.ceil(durationSeconds / 5);
    const expectedTrades = tradesPerTick * totalTicks;
    const expectedVolume = expectedTrades * amountPerTrade;

    // Get initial market volume for comparison later
    const stonks = await getAllStonks();
    const initialVolume = stonks.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
    await redis.set('stress:initial_volume', String(initialVolume));

    // Reset metrics
    await redis.del(METRICS_KEY);

    console.log(`[Stress] ========== STRESS TEST STARTED ==========`);
    console.log(`[Stress] Config: ${tradesPerSecond} TPS, max ${maxConcurrent} concurrent`);
    console.log(`[Stress] Duration: ${durationSeconds}s, mode=${mode}, $${amountPerTrade / 100}/trade`);
    console.log(`[Stress] Expected: ~${Math.round(tradesPerTick)} trades/tick × ${totalTicks} ticks`);
    console.log(`[Stress] Expected volume: $${(expectedVolume / 100).toFixed(2)}`);
    console.log(`[Stress] Initial market volume: $${(initialVolume / 100).toFixed(2)}`);
    console.log(`[Stress] =============================================`);
}

/**
 * Stops the stress test and logs final metrics.
 */
export async function stopStressTest() {
    const stonks = await getAllStonks();
    const finalVolume = stonks.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
    const initialVolumeStr = await redis.get('stress:initial_volume');
    const initialVolume = initialVolumeStr ? parseInt(initialVolumeStr) : 0;
    const addedVolume = finalVolume - initialVolume;

    console.log(`[Stress] ========== STRESS TEST STOPPED ==========`);
    console.log(`[Stress] Volume: Initial $${(initialVolume / 100).toFixed(2)} → Final $${(finalVolume / 100).toFixed(2)}`);
    console.log(`[Stress] Added volume: $${(addedVolume / 100).toFixed(2)}`);
    console.log(`[Stress] =============================================`);

    await redis.del(STRESS_KEY);
    await redis.del('stress:initial_volume');
    await redis.del(METRICS_KEY);
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
 * Helper to delay execution.
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes a single trade and returns timing info.
 */
async function executeSingleTrade(
    stonks: { id: string; currentPrice: number }[],
    config: StressConfig,
    buyRatio: number
): Promise<{ success: boolean; isBuy: boolean; amount: number; latencyMs: number }> {
    const startTime = Date.now();
    const botId = `bot-${Math.floor(Math.random() * 10000)}`;
    const stonk = stonks[Math.floor(Math.random() * stonks.length)];

    // Safety check for empty stonks array
    if (!stonk) {
        return { success: false, isBuy: false, amount: 0, latencyMs: 0 };
    }

    const isBuy = Math.random() < buyRatio;

    try {
        if (isBuy) {
            await executeBuy(botId, stonk.id, config.amountPerTrade, STARTING_BALANCE);
        } else {
            const shares = config.amountPerTrade / stonk.currentPrice;
            await executeSell(botId, stonk.id, shares, STARTING_BALANCE);
        }
        return {
            success: true,
            isBuy,
            amount: config.amountPerTrade,
            latencyMs: Date.now() - startTime,
        };
    } catch {
        return {
            success: false,
            isBuy,
            amount: 0,
            latencyMs: Date.now() - startTime,
        };
    }
}

/**
 * Executes one tick of the stress test with rate limiting.
 * Spreads trades over the tick duration instead of firing all at once.
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

        const buyRatio = config.mode === 'bull' ? 0.9 : config.mode === 'bear' ? 0.1 : 0.5;

        // Calculate how many trades to execute this tick
        const tickDurationMs = 5000; // 5 seconds
        const totalTradesThisTick = config.tradesPerSecond * (tickDurationMs / 1000);

        // Calculate delay between batch starts to spread trades
        const batchCount = Math.ceil(totalTradesThisTick / config.maxConcurrent);
        const delayBetweenBatchesMs = tickDurationMs / batchCount;

        // Metrics for this tick
        const metrics: TickMetrics = {
            totalTrades: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalBuyAmount: 0,
            totalSellAmount: 0,
            totalLatencyMs: 0,
            minLatencyMs: Infinity,
            maxLatencyMs: 0,
            actualDurationMs: 0,
        };

        const tickStartTime = Date.now();
        let tradesExecuted = 0;

        console.log(`[Stress] Starting tick: ${Math.round(totalTradesThisTick)} trades, ${batchCount} batches, ${Math.round(delayBetweenBatchesMs)}ms between batches`);

        // Execute trades in rate-limited batches
        for (let batch = 0; batch < batchCount && tradesExecuted < totalTradesThisTick; batch++) {
            const batchStartTime = Date.now();
            const tradesInBatch = Math.min(config.maxConcurrent, totalTradesThisTick - tradesExecuted);

            // Fire batch of trades concurrently
            const batchPromises: Promise<{ success: boolean; isBuy: boolean; amount: number; latencyMs: number }>[] = [];
            for (let i = 0; i < tradesInBatch; i++) {
                batchPromises.push(executeSingleTrade(stonks, config, buyRatio));
            }

            // Wait for batch to complete
            const results = await Promise.all(batchPromises);

            // Aggregate metrics
            for (const result of results) {
                metrics.totalTrades++;
                if (result.success) {
                    metrics.successfulTrades++;
                    if (result.isBuy) {
                        metrics.totalBuyAmount += result.amount;
                    } else {
                        metrics.totalSellAmount += result.amount;
                    }
                } else {
                    metrics.failedTrades++;
                }
                metrics.totalLatencyMs += result.latencyMs;
                metrics.minLatencyMs = Math.min(metrics.minLatencyMs, result.latencyMs);
                metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, result.latencyMs);
            }

            tradesExecuted += tradesInBatch;

            // Delay before next batch (unless this is the last batch)
            if (batch < batchCount - 1) {
                const elapsed = Date.now() - batchStartTime;
                const remainingDelay = Math.max(0, delayBetweenBatchesMs - elapsed);
                if (remainingDelay > 0) {
                    await delay(remainingDelay);
                }
            }
        }

        metrics.actualDurationMs = Date.now() - tickStartTime;
        if (metrics.minLatencyMs === Infinity) metrics.minLatencyMs = 0;

        // Log metrics
        const avgLatency = metrics.totalTrades > 0 ? (metrics.totalLatencyMs / metrics.totalTrades).toFixed(0) : 0;
        const actualTPS = metrics.actualDurationMs > 0 ? (metrics.totalTrades / (metrics.actualDurationMs / 1000)).toFixed(1) : 0;
        const successRate = metrics.totalTrades > 0 ? ((metrics.successfulTrades / metrics.totalTrades) * 100).toFixed(1) : 0;

        console.log(`[Stress] ─────────────────────────────────────────────`);
        console.log(`[Stress] 📊 Tick Complete in ${metrics.actualDurationMs}ms`);
        console.log(`[Stress] 📈 Trades: ${metrics.successfulTrades}/${metrics.totalTrades} (${successRate}% success)`);
        console.log(`[Stress] ⚡ Actual TPS: ${actualTPS} (target: ${config.tradesPerSecond})`);
        console.log(`[Stress] ⏱️  Latency: avg=${avgLatency}ms, min=${metrics.minLatencyMs}ms, max=${metrics.maxLatencyMs}ms`);
        console.log(`[Stress] 💰 Buys: $${(metrics.totalBuyAmount / 100).toFixed(2)}, Sells: $${(metrics.totalSellAmount / 100).toFixed(2)}`);

        if (metrics.failedTrades > 0) {
            console.warn(`[Stress] ⚠️ ${metrics.failedTrades} trades FAILED`);
        }

    } catch (e) {
        console.error('[Stress] Tick failed:', e);
    }
}
