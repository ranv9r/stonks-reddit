import { redis } from '@devvit/web/server';
import { executeBuy, executeSell } from './tradingEngine';
import { getAllStonks } from './redis';
import { STARTING_BALANCE } from '../../shared/config';

const STRESS_KEY = 'stress:config';
const BOTS_PER_TICK = 170; // Target ~10k trades over 5 mins

interface StressConfig {
    active: boolean;
    endTime: number;
    numBots: number;
}

export async function startStressTest(numBots: number = 100, durationMinutes: number = 5) {
    const config: StressConfig = {
        active: true,
        endTime: Date.now() + (durationMinutes * 60 * 1000),
        numBots,
    };
    await redis.set(STRESS_KEY, JSON.stringify(config));
    console.log(`[Stress] Started stress test with ${numBots} bots for ${durationMinutes} minutes`);
}

export async function stopStressTest() {
    await redis.del(STRESS_KEY);
    console.log('[Stress] Stopped stress test');
}

export async function tick() {
    try {
        const configStr = await redis.get(STRESS_KEY);
        if (!configStr) return;
        
        const config: StressConfig = JSON.parse(configStr);
        if (!config.active) return;
        
        if (Date.now() > config.endTime) {
           await stopStressTest();
           return;
        }
        
        const stonks = await getAllStonks();
        if (stonks.length === 0) return;

        const promises: Promise<any>[] = [];
        for (let i = 0; i < BOTS_PER_TICK; i++) {
            const botId = `bot-${Math.floor(Math.random() * config.numBots)}`;
            const stonk = stonks[Math.floor(Math.random() * stonks.length)];
            const isBuy = Math.random() > 0.5;
            const amountDollars = 10 + Math.floor(Math.random() * 190);
            
            if (isBuy) {
                promises.push(executeBuy(botId, stonk.id, amountDollars * 100, STARTING_BALANCE)
                    .catch(() => {}));
            } else {
                 if (stonk.currentPrice > 0) {
                     const shares = (amountDollars * 100) / stonk.currentPrice;
                     promises.push(executeSell(botId, stonk.id, shares, STARTING_BALANCE)
                        .catch(() => {}));
                 }
            }
        }
        await Promise.all(promises);
        console.log(`[Stress] Executed ${promises.length} bot trades`);
    } catch (e) {
        console.error('[Stress] Tick failed:', e);
    }
}
