'use strict';

const db          = require('../db/database');
const queueWorker = require('../services/queueWorker');

const START_TIME = Date.now();

/**
 * GET /health
 *
 * Returns a rich system health report:
 *  - Server uptime
 *  - Database connectivity
 *  - Queue telemetry (depth, processed, failed, retried)
 *  - Notification status summary from the DB
 */
async function getHealth(req, res) {
  try {
    // Verify DB is reachable
    await db.get('SELECT 1 AS ok');

    // Live notification status counts
    const total     = (await db.get("SELECT COUNT(*) AS c FROM notifications")).c;
    const completed = (await db.get("SELECT COUNT(*) AS c FROM notifications WHERE status='completed'")).c;
    const failed    = (await db.get("SELECT COUNT(*) AS c FROM notifications WHERE status='failed'")).c;
    const pending   = (await db.get("SELECT COUNT(*) AS c FROM notifications WHERE status='pending'")).c;

    const qStats    = queueWorker.getStats();
    const uptimeSec = Math.floor((Date.now() - START_TIME) / 1000);

    return res.status(200).json({
      status:  'ok',
      uptime:  `${uptimeSec}s`,
      database: 'connected',
      queue: {
        depth:          qStats.depth,
        isProcessing:   qStats.isProcessing,
        totalEnqueued:  qStats.totalEnqueued,
        totalCompleted: qStats.totalCompleted,
        totalFailed:    qStats.totalFailed,
        totalRetried:   qStats.totalRetried,
      },
      notifications: {
        total,
        completed,
        failed,
        pending,
        successRate: total > 0 ? `${Math.round((completed / total) * 100)}%` : 'N/A',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      status:    'degraded',
      error:     err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = { getHealth };
