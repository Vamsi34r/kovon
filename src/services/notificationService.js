'use strict';

const db = require('../db/database');

/**
 * Creates a new notification record with status "pending".
 *
 * @param {number} event_id   - Foreign key referencing the events table.
 * @param {string} recipient  - The notification recipient (e.g. email address).
 * @param {string} [channel]  - Notification channel, defaults to "email".
 * @returns {Promise<number>} - Resolves with the newly created notification_id.
 */
async function createNotification(event_id, recipient, channel = 'email') {
  const status = 'pending';
  const result = await db.run(
    `INSERT INTO notifications (event_id, recipient, channel, status, retry_count)
     VALUES (?, ?, ?, ?, 0)`,
    [event_id, recipient, channel, status]
  );
  return result.lastID; // returns notification_id
}

/**
 * Updates a notification's status and increments retry_count on failure.
 *
 * @param {number} notification_id - The id of the notification to update.
 * @param {string} status          - New status: "completed" or "failed".
 * @param {boolean} [failed]       - When true, increments retry_count by 1.
 * @returns {Promise<void>}
 */
async function updateNotificationStatus(notification_id, status, failed = false) {
  if (failed) {
    await db.run(
      `UPDATE notifications
         SET status      = ?,
             retry_count = retry_count + 1,
             updated_at  = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, notification_id]
    );
  } else {
    await db.run(
      `UPDATE notifications
         SET status     = ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, notification_id]
    );
  }
}

/**
 * Fetches a single notification row by its id.
 *
 * @param {number} notification_id
 * @returns {Promise<Object|undefined>}
 */
async function getNotification(notification_id) {
  return db.get(
    `SELECT * FROM notifications WHERE id = ?`,
    [notification_id]
  );
}

module.exports = { createNotification, updateNotificationStatus, getNotification };
