/**
 * Bobi Server Entry Point
 */

import express from 'express';
import cors from 'cors';
import { ENV, validateConfig } from './config/env.js';
import { logger } from './utils/logger.js';
import { wsServer } from './websocket/server.js';
import { orchestrator } from './orchestrator/index.js';
import sessionRouter from './routes/session.js';

async function main(): Promise<void> {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       🚗 Bobi - Car AI Companion     ║
  ║          MVP Server v0.1.0           ║
  ╚══════════════════════════════════════╝
  `);

  // Validate configuration
  validateConfig();

  // Initialize orchestrator
  await orchestrator.initialize();

  // Create Express app for HTTP endpoints
  const app = express();
  app.use(cors());
  app.use('/api', sessionRouter);

  // Start HTTP server (for both REST API and WebSocket)
  const httpServer = app.listen(ENV.SERVER_PORT, () => {
    logger.info('Server', `HTTP server running on http://localhost:${ENV.SERVER_PORT}`);
  });

  // Start WebSocket server (attached to HTTP server on same port)
  wsServer.start(httpServer);

  logger.info('Server', `Bobi server running on port ${ENV.SERVER_PORT}`);
  logger.info('Server', 'Open http://localhost:5173 in browser to access WebUI');

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Server', 'Shutting down...');
    orchestrator.shutdown();
    wsServer.stop();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
