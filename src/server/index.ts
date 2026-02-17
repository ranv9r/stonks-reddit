import express from 'express';
import { createServer, getServerPort } from '@devvit/web/server';

// Import routes
import marketRoutes from './routes/market';
import modRoutes from './routes/mod';
import schedulerRoutes from './routes/scheduler';
import chatRoutes from './routes/chat';
import tourRoutes from './routes/tour';
import consentRoutes from './routes/consent';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

// Mount routes (consent before chat — /api/chat/consent must match before /api/chat/:stonkId)
app.use(marketRoutes);
app.use(modRoutes);
app.use(schedulerRoutes);
app.use(consentRoutes);
app.use(chatRoutes);
app.use(tourRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'meme-stonks' });
});

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);

console.log(`🚀 Meme Stonks server running on port ${port}`);
