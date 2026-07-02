'use strict';

const { updateNotificationStatus } = require('./notificationService');

// ─────────────────────────────────────────────────────────────────────────────
//  Configuration
// ─────────────────────────────────────────────────────────────────────────────
const MAX_RETRIES         = 3;    // Maximum automatic retry attempts per notification
const FAILURE_RATE        = 0.10; // 10% simulated failure rate
const DELAY_MIN_MS        = 500;
const DELAY_MAX_MS        = 1000;

// ─────────────────────────────────────────────────────────────────────────────
//  Priority Queue  (Array-based, FIFO within same priority)
//  Priority levels: 'high' > 'normal' > 'low'
//  High-priority tasks (e.g. payment_failed) jump ahead in the queue.
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITY_MAP = { high: 0, normal: 1, low: 2 };

const queue          = [];    // holds pending task objects
let   isProcessing   = false; // prevents concurrent worker loops
let   isShuttingDown = false; // set during graceful shutdown

// ── Telemetry counters ────────────────────────────────────────────────────────
const stats = {
  totalEnqueued:  0,
  totalCompleted: 0,
  totalFailed:    0,
  totalRetried:   0,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueues a new notification task.
 * Tasks are inserted in priority order (high → normal → low).
 *
 * @param {{
 *   notification_id: number,
 *   event_id:        number,
 *   event_type:      string,
 *   recipient:       string,
 *   channel:         string,
 *   data:            Object,
 *   priority?:       'high'|'normal'|'low',
 *   attempt?:        number
 * }} task
 */
function push(task) {
  if (isShuttingDown) {
    console.warn('[Queue] ⚠ Server is shutting down — task rejected:', task.notification_id);
    return;
  }

  // Normalise priority and attempt count
  const enriched = {
    ...task,
    priority: task.priority || 'normal',
    attempt:  task.attempt  || 1,
  };

  // Insert in sorted order (priority queue behaviour)
  const insertPriority = PRIORITY_MAP[enriched.priority] ?? 1;
  let   insertIndex    = queue.length;
  for (let i = 0; i < queue.length; i++) {
    if (PRIORITY_MAP[queue[i].priority] > insertPriority) {
      insertIndex = i;
      break;
    }
  }
  queue.splice(insertIndex, 0, enriched);
  stats.totalEnqueued++;

  console.log(
    `[Queue] ✚ Enqueued notification_id=${enriched.notification_id}` +
    ` | priority=${enriched.priority}` +
    ` | attempt=${enriched.attempt}/${MAX_RETRIES}` +
    ` | depth=${queue.length}`
  );

  if (!isProcessing) processQueue();
}

/**
 * Returns a snapshot of the current queue stats.
 * @returns {{ depth: number, isProcessing: boolean, stats: Object }}
 */
function getStats() {
  return {
    depth:        queue.length,
    isProcessing,
    isShuttingDown,
    totalEnqueued:  stats.totalEnqueued,
    totalCompleted: stats.totalCompleted,
    totalFailed:    stats.totalFailed,
    totalRetried:   stats.totalRetried,
  };
}

/**
 * Graceful shutdown: stops accepting new tasks and waits for the
 * current queue to drain before resolving.
 *
 * @param {number} [timeoutMs=15000] - Maximum ms to wait before force-exit.
 * @returns {Promise<void>}
 */
function gracefulShutdown(timeoutMs = 15000) {
  isShuttingDown = true;
  console.log(`[Queue] 🛑 Graceful shutdown initiated — draining ${queue.length} remaining task(s)…`);

  return new Promise((resolve) => {
    if (queue.length === 0 && !isProcessing) {
      console.log('[Queue] ✔ Queue already empty — shutdown complete.');
      return resolve();
    }

    const interval = setInterval(() => {
      if (queue.length === 0 && !isProcessing) {
        clearInterval(interval);
        console.log('[Queue] ✔ All tasks drained — shutdown complete.');
        resolve();
      }
    }, 200);

    // Force-resolve after timeout so the process doesn't hang
    setTimeout(() => {
      clearInterval(interval);
      console.warn(`[Queue] ⚠ Shutdown timeout after ${timeoutMs}ms — forcing exit.`);
      resolve();
    }, timeoutMs);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internal Worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asynchronous drain loop — processes one task at a time to avoid
 * concurrent SQLite writes, while never blocking the event loop.
 */
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    await processTask(task);
  }

  isProcessing = false;
  console.log('[Queue] 💤 Worker idle — queue is empty.');
}

/**
 * Processes a single notification task:
 *  1. Simulates an async send with a random delay (500–1000 ms).
 *  2. Applies a 10 % failure rate.
 *  3a. On success → updates status to "completed".
 *  3b. On failure → increments retry_count, and re-queues if under MAX_RETRIES
 *      using exponential backoff (attempt × 1000 ms extra delay).
 *
 * @param {Object} task
 */
async function processTask(task) {
  const { notification_id, recipient, channel, event_type, attempt, priority } = task;

  // Random base delay 500–1000 ms  +  exponential back-off on retries
  const baseDelay   = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
  const backoffMs   = attempt > 1 ? (attempt - 1) * 1000 : 0;
  const totalDelay  = baseDelay + backoffMs;

  console.log(
    `[Worker] ⚙ Processing notification_id=${notification_id}` +
    ` | event=${event_type} | channel=${channel}` +
    ` | recipient=${recipient} | delay=${totalDelay}ms` +
    ` | attempt=${attempt}/${MAX_RETRIES} | priority=${priority}`
  );

  // Simulate async notification delivery
  await new Promise((resolve) => setTimeout(resolve, totalDelay));

  const failed = Math.random() < FAILURE_RATE; // 10% failure rate

  if (failed) {
    stats.totalFailed++;
    await updateNotificationStatus(notification_id, 'failed', true);

    if (attempt < MAX_RETRIES) {
      // ── Auto-retry with exponential back-off ─────────────────────────────
      stats.totalRetried++;
      console.log(
        `[Worker] ✗ notification_id=${notification_id} FAILED` +
        ` (attempt ${attempt}/${MAX_RETRIES}) — scheduling retry #${attempt + 1}…`
      );
      // Re-queue with incremented attempt counter after a short delay
      setTimeout(() => {
        push({ ...task, attempt: attempt + 1, priority: 'high' }); // retries get high priority
      }, 500);
    } else {
      console.log(
        `[Worker] ✗ notification_id=${notification_id} PERMANENTLY FAILED` +
        ` after ${MAX_RETRIES} attempts — no more retries.`
      );
    }
  } else {
    stats.totalCompleted++;
    await updateNotificationStatus(notification_id, 'completed', false);
    console.log(
      `[Worker] ✓ notification_id=${notification_id} COMPLETED` +
      ` (event=${event_type}, recipient=${recipient}, attempt=${attempt})`
    );
  }
}

module.exports = { push, getStats, gracefulShutdown };
