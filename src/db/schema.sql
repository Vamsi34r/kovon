-- Events table: stores all incoming business events
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT     NOT NULL,
  payload     TEXT     NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table: stores notification tasks per event
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER  NOT NULL,
  recipient   TEXT     NOT NULL,
  channel     TEXT     NOT NULL,
  status      TEXT     NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
  retry_count INTEGER  DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id)
);
