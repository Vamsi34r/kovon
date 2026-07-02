'use strict';

const db = require('../db/database');

/**
 * Inserts a new event record into the events table.
 *
 * @param {string} event_type  - The type of business event (e.g. "order_placed").
 * @param {Object} data        - The event payload object (will be JSON-stringified).
 * @returns {Promise<number>}  - Resolves with the newly created event's id.
 */
async function createEvent(event_type, data) {
  const payload = JSON.stringify(data || {});
  const result  = await db.run(
    `INSERT INTO events (event_type, payload) VALUES (?, ?)`,
    [event_type, payload]
  );
  return result.lastID; // returns event_id
}

module.exports = { createEvent };
