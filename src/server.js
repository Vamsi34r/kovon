'use strict';

require('dotenv').config();

const app            = require('./app');
const { init: initDb } = require('./db/database');
const queueWorker    = require('./services/queueWorker');

const PORT = process.env.PORT || 3000;

/**
 * Bootstrap sequence:
 *  1. Initialise SQLite (creates tables if they don't exist).
 *  2. Start the Express HTTP server.
 *  3. Register SIGTERM / SIGINT handlers for graceful shutdown.
 */
async function bootstrap() {
  try {
    await initDb();
    console.log('[Server] Database ready.');

    const server = app.listen(PORT, () => {
      console.log(`[Server] 🚀  Event-Driven Notification Dispatcher running on http://localhost:${PORT}`);
      console.log(`[Server] POST http://localhost:${PORT}/api/v1/events`);
      console.log(`[Server] GET  http://localhost:${PORT}/health`);
    });

    // ── Graceful Shutdown ─────────────────────────────────────────────────────
    // On SIGTERM (container stop, Ctrl+C in terminal) or SIGINT:
    //  1. Stop accepting new HTTP connections.
    //  2. Let the queue drain all in-flight tasks.
    //  3. Exit cleanly with code 0.
    async function shutdown(signal) {
      console.log(`\n[Server] ${signal} received — starting graceful shutdown…`);

      // Stop accepting new HTTP requests
      server.close(() => {
        console.log('[Server] HTTP server closed — no new connections accepted.');
      });

      // Drain the notification queue (waits up to 15 s)
      await queueWorker.gracefulShutdown(15000);

      console.log('[Server] 👋 Goodbye!');
      process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

bootstrap();
