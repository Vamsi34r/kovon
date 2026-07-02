'use strict';

const { getNotification } = require('../services/notificationService');

/**
 * GET /api/v1/notifications/:id
 * Returns the current state of a notification row (for testing / debugging).
 */
async function getNotificationStatus(req, res) {
  try {
    const id  = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid notification id' });

    const row = await getNotification(id);
    if (!row) return res.status(404).json({ error: 'Notification not found' });

    return res.status(200).json(row);
  } catch (err) {
    console.error('[Controller] getNotificationStatus error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getNotificationStatus };
