/**
 * Tour step definitions for first-time user guided tour.
 * Uses react-joyride to create an interactive walkthrough.
 */

import { Step } from 'react-joyride';

export const tourSteps: Step[] = [
    // Step 1: Welcome
    {
        target: 'body',
        content: (
            <div>
                <h3 style={{ marginTop: 0 }}>Welcome to Stonks! 🚀</h3>
                <p>
                    You're about to enter the most exciting meme stock trading game on Reddit.
                    Let's take a quick tour to show you around!
                </p>
                <p style={{ marginBottom: 0 }}>
                    <strong>Pro tip:</strong> You can skip this tour anytime by clicking "Skip".
                </p>
            </div>
        ),
        placement: 'center',
        disableBeacon: true,
    },

    // Step 2: Portfolio Card
    {
        target: '#tour-portfolio-card',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Your Portfolio 💰</h4>
                <p>
                    This shows your current <strong>wallet balance</strong> (available cash) and
                    <strong> net worth</strong> (total value including investments).
                </p>
                <p style={{ marginBottom: 0 }}>
                    You'll start with <strong>$10,000</strong> to trade with!
                </p>
            </div>
        ),
        placement: 'bottom',
    },

    // Step 3: Market Overview
    {
        target: '#tour-market-overview',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Live Market 📊</h4>
                <p>
                    Here you'll see all available stocks with real-time prices that update every 5 seconds.
                </p>
                <p style={{ marginBottom: 0 }}>
                    Prices change based on supply and demand from all traders!
                </p>
            </div>
        ),
        placement: 'top',
    },

    // Step 4: Stock Card
    {
        target: '#tour-stock-card',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Stock Cards 📈</h4>
                <p>
                    Each card shows:
                </p>
                <ul style={{ marginLeft: 20, paddingLeft: 0 }}>
                    <li><strong>Ticker</strong> - Stock symbol</li>
                    <li><strong>Current Price</strong> - Latest value</li>
                    <li><strong>Change %</strong> - How much it moved</li>
                </ul>
                <p style={{ marginBottom: 0, fontSize: '14px', fontWeight: 'bold', color: '#FF4500' }}>
                    👆 Click the highlighted stock card below to continue!
                </p>
            </div>
        ),
        placement: 'right',
        spotlightClicks: true,
        hideFooter: true,
    },

    // Step 5: Stock Detail View (requires navigation)
    {
        target: '#tour-price-chart',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Price Chart 📉</h4>
                <p>
                    Track the stock's price history over time. You can zoom and pan to analyze trends.
                </p>
                <p style={{ marginBottom: 0 }}>
                    Use this to make informed trading decisions!
                </p>
            </div>
        ),
        placement: 'top',
        spotlightClicks: true,
    },

    // Step 6: All-Time Performance
    {
        target: '#tour-stats-card',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>All-Time Stats 🏆</h4>
                <p>
                    See the stock's all-time high (ATH) and all-time low (ATL) prices.
                </p>
                <p style={{ marginBottom: 0 }}>
                    Watch for witty commentary based on current performance!
                </p>
            </div>
        ),
        placement: 'top',
    },

    // Step 7: Trading Panel
    {
        target: '#tour-trade-panel',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Buy & Sell Panel 💸</h4>
                <p>
                    This is where the magic happens! Enter an amount and:
                </p>
                <ul style={{ marginLeft: 20, paddingLeft: 0 }}>
                    <li><strong>Buy</strong> - Purchase shares with your cash</li>
                    <li><strong>Sell</strong> - Convert shares back to cash</li>
                </ul>
                <p style={{ marginBottom: 0 }}>
                    Trades execute instantly at the current price!
                </p>
            </div>
        ),
        placement: 'left',
    },

    // Step 8: Navigate Back to Market
    {
        target: '#tour-back-button',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Back to Market 🔙</h4>
                <p>
                    Now let's explore other features!
                </p>
                <p style={{ marginBottom: 0 }}>
                    <strong>Click the back button</strong> to return to the market view.
                </p>
            </div>
        ),
        placement: 'bottom',
        spotlightClicks: true,
        hideFooter: true,
    },

    // Step 9: Portfolio Tab Navigation
    {
        target: '.tour-nav-portfolio',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Portfolio Tab 📂</h4>
                <p>
                    Click here to view all your current holdings and track your profits/losses.
                </p>
                <p style={{ marginBottom: 0 }}>
                    Let's check it out!
                </p>
            </div>
        ),
        placement: 'bottom',
        spotlightClicks: true,
        hideFooter: true,
    },

    // Step 9: Holdings View
    {
        target: '#tour-holdings',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Your Holdings 📋</h4>
                <p>
                    See all your investments in one place:
                </p>
                <ul style={{ marginLeft: 20, paddingLeft: 0 }}>
                    <li><strong>Quantity</strong> - How many shares you own</li>
                    <li><strong>Avg Buy Price</strong> - What you paid on average</li>
                    <li><strong>Current Value</strong> - What it's worth now</li>
                    <li><strong>P/L</strong> - Profit or loss (green/red)</li>
                </ul>
            </div>
        ),
        placement: 'top',
    },

    // Step 10: Leaderboard Navigation
    {
        target: '.tour-nav-leaderboard',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Leaderboard 🏅</h4>
                <p>
                    Think you're a trading genius? Prove it!
                </p>
                <p style={{ marginBottom: 0 }}>
                    Click here to see where you rank against other traders.
                </p>
            </div>
        ),
        placement: 'bottom',
        spotlightClicks: true,
        hideFooter: true,
    },

    // Step 11: Leaderboard View
    {
        target: '#tour-leaderboard',
        content: (
            <div>
                <h4 style={{ marginTop: 0 }}>Compete & Dominate 👑</h4>
                <p>
                    Rankings are based on <strong>net worth</strong> (wallet + portfolio value).
                </p>
                <p>
                    Make smart trades to climb to the top!
                </p>
                <p style={{ marginBottom: 0 }}>
                    <em>Updated in real-time as traders make moves.</em>
                </p>
            </div>
        ),
        placement: 'top',
    },

    // Step 12: Tour Complete - Handled by modal
];
