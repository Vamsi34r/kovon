'use strict';

const { createEvent }        = require('../services/eventService');
const { createNotification } = require('../services/notificationService');
const queueWorker            = require('../services/queueWorker');

// Simple email format validator (RFC 5322 simplified)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Map event types to priority levels so urgent events jump the queue
const PRIORITY_MAP = {
  payment_failed:   'high',
  account_locked:   'high',
  order_cancelled:  'high',
  order_placed:     'normal',
  payment_received: 'normal',
  user_registered:  'normal',
  shipment_sent:    'low',
  newsletter:       'low',
};

/**
 * POST /api/v1/events
 *
 * Flow:
 *  1. Validate request fields + email format.
 *  2. Persist event  → events table.
 *  3. Persist notification (status=pending) → notifications table.
 *  4. Enqueue background task (with priority).
 *  5. Return 202 Accepted immediately.
 */
async function handleEvent(req, res) {
  try {
    const { event_type, recipient, data } = req.body;

    // ── 1. Validate required fields ───────────────────────────────────────────
    if (!event_type || !recipient) {
      return res.status(400).json({
        error: 'event_type and recipient are required',
      });
    }

    // ── 1b. Validate email format ─────────────────────────────────────────────
    if (!EMAIL_RE.test(String(recipient))) {
      return res.status(400).json({
        error: 'recipient must be a valid email address',
      });
    }

    // ── 2. Persist the event ──────────────────────────────────────────────────
    const event_id = await createEvent(event_type, data);

    // ── 3. Create notification (status=pending, default channel=email) ─────────
    const channel         = 'email';
    const notification_id = await createNotification(event_id, recipient, channel);

    // ── 4. Determine priority and enqueue ─────────────────────────────────────
    const priority = PRIORITY_MAP[event_type] || 'normal';
    queueWorker.push({
      notification_id,
      event_id,
      event_type,
      recipient,
      channel,
      data,
      priority,
      attempt: 1,
    });

    // ── 5. Return 202 Accepted immediately ────────────────────────────────────
    const tracking_id = event_id;

    return res.status(202).json({
      message:         'Event accepted for processing',
      tracking_id,
      notification_id,
      status:          'pending',
      priority,         // bonus: tell caller what priority was assigned
    });

  } catch (err) {
    console.error('[Controller] Unhandled error in handleEvent:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { handleEvent };
