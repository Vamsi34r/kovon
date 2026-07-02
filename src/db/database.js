'use strict';

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

// Database file path from env or default
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'notifications.db');

let db; // singleton connection

/**
 * Opens the SQLite database and runs the schema migrations.
 * @returns {Promise<sqlite3.Database>}
 */
function init() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[DB] Failed to connect to SQLite:', err.message);
        return reject(err);
      }
      console.log(`[DB] Connected to SQLite database at ${DB_PATH}`);

      // Enable WAL mode so concurrent readers can read without blocking writes
      db.run('PRAGMA journal_mode = WAL;', (pragmaErr) => {
        if (pragmaErr) console.warn('[DB] WAL mode warning:', pragmaErr.message);
      });

      // Read and execute schema.sql
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema     = fs.readFileSync(schemaPath, 'utf8');

      db.exec(schema, (execErr) => {
        if (execErr) {
          console.error('[DB] Failed to apply schema:', execErr.message);
          return reject(execErr);
        }
        console.log('[DB] Schema applied successfully.');
        resolve(db);
      });
    });
  });
}

/**
 * Returns the active database connection.
 * @returns {sqlite3.Database}
 */
function getDb() {
  if (!db) throw new Error('Database not initialised. Call init() first.');
  return db;
}

/**
 * Promisified db.run – executes an INSERT / UPDATE / DELETE.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Promisified db.get – returns a single row.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<Object|undefined>}
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Promisified db.all – returns all matching rows.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<Array>}
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { init, getDb, run, get, all };
