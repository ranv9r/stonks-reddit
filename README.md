
# 🚀 Stonk Street – The One and Only Stonks Market of Reddit

> **"Turn Your Subreddit Into A Stock Market!"**

Stonk Street is a highly adaptable, community-driven web application built for **any** subreddit to adopt and customize. Whether it's **F1**, **FIFA**, **Cricket**, or simply **Trending memes**, Stonk Street allows moderators to turn ongoing discussions into engaging, competitive trading events.

---

## 🏆 About The Project

### 💡 Inspiration
Our inspiration comes from Reddit events like **r/place** and **r/field**. These projects captured the **essence of Reddit**—collaborative, chaotic, and deeply engaging. We loved the optimizations used in r/field, but we noticed that many Devvit games are too niche or specific to a single subreddit.

We wanted to build something **robust, configurable, and universally adaptable**. A financial engine that empowers communities to engage with current trends in real-time. If there's a World Cup, a political debate, or a viral meme war, Stonk Street lets you trade on the outcome.

### 🎮 Features & Why We Built Them

We didn't just want a "game"; we wanted a platform that feels alive.

### 📱 The Stonk Street Experience

We didn't just want a "game"; we aimed for a complete, immersive trading ecosystem. Here is how a user experiences Stonk Street:

#### 1. Discovery & Analysis 📈
When a user first joins, they are granted **$10,000** in starting capital to begin their trading journey.
The journey starts on the **Market Dashboard**, where users can browse all listed stocks with real-time price updates.
*   **Stonks Charts**: Clicking a stock opens the **Detail View**, featuring **5-Tier Timeframe Charts** (30 mins, 3 hours, 30 hour, 7.5 days, All-time).

#### 2. The Trading Floor 💸
Once a user spots an opportunity, they can **Buy** or **Sell** instantly.
*   **Supply & Demand**: Prices are not random. They are determined by a **Virtual Automated Market Maker (AMM)**. Every Buy pushes the price up; every Sell pushes it down.
*   **Fairness**: Our **Frequent Batch Auction** system aggregates all trades in 5-second windows, so as to not overburden the architecture with too frequent market updates.

#### 3. Portfolio Management 💼
Users can track their empire in the **Portfolio View**.
*   **Real-Time P/L**: Watch your Net Worth grow (or shrink) live as the market moves.
*   **Holdings**: See exactly how much skin you have in the game for each stock, with average buy price and current return on investment.

#### 4. Community Engagement 💬
Trading is social. Stonk Street includes **Stock-Specific Live Chat** rooms.
*   **Live Chat**: Users can shill their bags, panic sell together, or coordinate "moon missions" without leaving the app.
*   **Leaderboards**: A global ranking system tracks the top traders, adding a competitive layer that fuels engagement and keeps users coming back.

### 🛡️ Moderator Powers
We give community moderators full control to manage the market economy:
*   **Create & Delete Stocks**: Mods can list new stocks dynamically (e.g., adding a new "Meme of the Week") or delist old ones.
*   **Event Scheduling**: Start, Pause, or Schedule trading events with a timer. Run a 24-hour "Blitz" or a week-long "Season".
*   **Game Reset**: reset the old data for a new event.

---

## 🛠️ The Tech: Under The Hood

We are a team of **two software engineers** who started this project as a passion hack during weekends. Over the course of **3 weeks**, we built a robust, high-performance application from scratch.

### 🏗️ Architecture & Optimization
Building a high-frequency trading platform on a serverless architecture like Devvit was a massive engineering challenge. Here is how we solved it:

#### 1. The 5-Second "Tick" & Batching
Devvit functions are ephemeral. We couldn't run a continuous matching engine.
*   **Solution**: We implemented a **Frequent Batch Auction** model.
*   **How it works**: We accumulate all Buy/Sell orders into a Redis Hash during a 5-second window. At the end of the tick, a scheduled job resolves the entire batch in **O(1)** time using a bonding curve formula. This separates the "Intent" (User clicking buy) from the "Execution" (Price update), allowing us to handle massive concurrency.

#### 2. Virtual AMM (Automated Market Maker)
We rejected the traditional Order Book model (too memory intensive).
*   **Solution**: We used a **Constant Product Bonding Curve** (`k = x * y`) with **Virtual Reserves**.
*   **Why**: This guarantees **infinite liquidity**. A user can *always* find a buyer or seller, even if no other players are online. It also creates a predictable price trajectory that rewards early adopters—perfect for meme stocks.

#### 3. Optimistic Updates & Realtime
*   **Challenge**: Users hate latency. Waiting 5 seconds for a price update feels sluggish.
*   **Solution**: We perform **Optimistic UI Updates** on the client (balance drops immediately) while the backend processes the trade. We then use Devvit's `realtime` API to broadcast the definitive `global_ticker` state to all connected clients, ensuring eventual consistency without polling.

---

## 🚧 Challenges We Ran Into

Our biggest challenge was **optimizing for high concurrency**. A live trading game on Reddit needs to handle thousands of users spamming "BUY" at once.

*   **Throughput**: We optimized the system to handle **60,000+ trades per minute**.
*   **Redis Limits**: We hit the limits of Redis throughput. To solve this, we implemented **Write Coalescing**—instead of updating the database for every single trade, we aggregate volume in memory and flush to Redis in batches.
*   **State Management**: Syncing the "Portfolio" view across multiple devices while trades were happening in the background required a complex state-reconciliation logic.

---

## 🏅 Accomplishments That We're Proud Of

*   **Performance**: Successfully handling **60k+ trades/min** in our playtests with zero downtime.
*   **UI/UX**: Achieving a buttery-smooth **60fps mobile experience** with intuitive gestures that feels like a native app.
*   **Adaptability**: Creating a truly generic engine that fits any subreddit context without code changes.

---

Built with ❤️ and ☕ by a team of two.
