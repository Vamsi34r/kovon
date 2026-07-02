# ⚡ Event-Driven Notification Dispatcher

![Node.js](https://img.shields.io/badge/Node.js-v24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production--Ready-22c55e?style=for-the-badge)

> A **production-grade**, lightweight asynchronous notification system that accepts business events, persists them to SQLite, and processes notifications in the background via an in-memory priority queue — all without blocking the HTTP response.

---

## 📑 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Key Features](#key-features)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Installation](#installation)
7. [Database Setup](#database-setup)
8. [Running the Application](#running-the-application)
9. [API Reference](#api-reference)
10. [How the Async Queue Works](#how-the-async-queue-works)
11. [Priority System](#priority-system)
12. [Auto-Retry with Exponential Backoff](#auto-retry-with-exponential-backoff)
13. [Graceful Shutdown](#graceful-shutdown)
14. [Testing](#testing)
15. [Postman Collection](#postman-collection)
16. [Assumptions and Limitations](#assumptions-and-limitations)

---

## 📌 Project Overview

When a client calls `POST /api/v1/events`, the system:

1. ✅ **Validates** the request body (required fields + email format)
2. 💾 **Saves** the event in the `events` table
3. 🔔 **Creates** a `notification` record with `status = pending`
4. 📦 **Enqueues** the task into a priority-aware in-memory queue
5. ⚡ **Returns** `202 Accepted` **immediately** — without waiting for processing
6. 🔄 **Background worker** drains the queue, simulates notification delivery (500–1000 ms), updates status to `completed` or `failed`
7. 🔁 **Auto-retries** failed notifications up to **3 times** with exponential back-off

---

## 🏗️ Architecture

```
Client
  │
  │  POST /api/v1/events
  ▼
Express.js API Server  ──────────────────────────────────────┐
  │                                                          │
  │  ① Validate (event_type + recipient + email format)     │
  │  ② INSERT INTO events                                    │
  │  ③ INSERT INTO notifications  (status=pending)          │
  │  ④ queueWorker.push(task)  →  Priority Queue            │
  │                                 [high] [normal] [low]    │
  │  ⑤ Return 202 Accepted immediately  ◄────────────────── │
  │                                                          │
  │                          ⑥ Background Worker drains     │
  │                              setTimeout 500–1000ms       │
  │                              10% simulated failure       │
  │                              ├─ success → completed      │
  │                              └─ failure → failed         │
  │                                  └─ retry (max 3×)       │
  │                                     exponential backoff  │
  │                                     ↑ re-enqueued HIGH   │
  │                                                          │
  └──────────── UPDATE notifications SET status = ?  ───────┘
```

See `architecture-diagram.png` for the visual diagram.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **Non-blocking API** | Returns 202 in ~50ms regardless of queue size |
| **Priority Queue** | `payment_failed` jumps ahead of `newsletter` |
| **Auto-Retry** | Failed notifications retry up to 3× with exponential back-off |
| **Graceful Shutdown** | SIGTERM/SIGINT drains queue before exiting |
| **Health Check** | `GET /health` exposes DB, queue, and stats |
| **Email Validation** | Validates recipient format before persisting |
| **Live Dashboard** | `GET /` auto-refreshes every 5s with live DB stats |
| **WAL Journal Mode** | SQLite WAL mode enables concurrent reads |

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24 |
| HTTP Framework | Express.js | 4.x |
| Database | SQLite (via sqlite3) | 5.x |
| Queue | Array-based in-memory FIFO | Native JS |
| Config | dotenv | 16.x |

> **No Redis. No BullMQ. No RabbitMQ.** Pure Node.js async patterns only.

---

## 📁 Project Structure

```
project-root/
│
├── src/
│   ├── app.js                        # Express app, middleware, dashboard, routes
│   ├── server.js                     # Entry point, DB init, graceful shutdown
│   │
│   ├── controllers/
│   │   ├── eventController.js        # POST /api/v1/events handler
│   │   ├── notificationController.js # GET /api/v1/notifications/:id handler
│   │   └── healthController.js       # GET /health handler
│   │
│   ├── services/
│   │   ├── eventService.js           # Insert events into DB
│   │   ├── notificationService.js    # Create/update notifications in DB
│   │   └── queueWorker.js            # Priority queue + async worker + retry logic
│   │
│   ├── db/
│   │   ├── database.js               # SQLite singleton + promisified helpers
│   │   └── schema.sql                # CREATE TABLE statements
│   │
│   └── routes/
│       ├── eventRoutes.js            # Router for /api/v1/events
│       ├── notificationRoutes.js     # Router for /api/v1/notifications
│       └── healthRoutes.js           # Router for /health
│
├── architecture-diagram.png          # System architecture diagram
├── postman_collection.json           # Import into Postman — 11 ready requests
├── package.json
├── README.md
└── .env.example
```

---

## ⚙️ Installation

### Prerequisites

- Node.js ≥ 18 (tested on v24)
- npm ≥ 9

### Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd event-driven-notification-dispatcher

# 2. Install dependencies
npm install

# 3. Copy environment config
cp .env.example .env
```

`.env` defaults (no changes needed for local dev):

```env
PORT=3000
DB_PATH=./notifications.db
```

---

## 🗄️ Database Setup

**Automatic** — no manual steps required.

On first boot, `server.js` calls `db.init()` which:
1. Creates the SQLite file at `DB_PATH`
2. Enables **WAL journal mode** for concurrent reads
3. Executes `schema.sql` to create tables if they don't exist

```sql
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT     NOT NULL,
  payload     TEXT     NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
```

---

## 🚀 Running the Application

```bash
# Start (production)
npm start

# Start (development — auto-reload)
npm run dev
```

Expected output:

```
[DB] Connected to SQLite database at ./notifications.db
[DB] Schema applied successfully.
[Server] Database ready.
[Server] 🚀  Running on http://localhost:3000
[Server] POST http://localhost:3000/api/v1/events
[Server] GET  http://localhost:3000/health
```

Open **http://localhost:3000** for the live dashboard.

---

## 📡 API Reference

### `POST /api/v1/events` — Trigger an event

```http
POST /api/v1/events
Content-Type: application/json
```

**Request Body:**

```json
{
  "event_type": "order_placed",
  "recipient":  "user@example.com",
  "data": {
    "order_id": 101
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `event_type` | string | ✅ | Any business event name |
| `recipient` | string | ✅ | Must be a valid email address |
| `data` | object | No | Arbitrary event payload |

**Response — `202 Accepted`:**

```json
{
  "message":         "Event accepted for processing",
  "tracking_id":     1,
  "notification_id": 1,
  "status":          "pending",
  "priority":        "normal"
}
```

**Error Responses:**

| Condition | Status | Body |
|-----------|--------|------|
| Missing `event_type` or `recipient` | 400 | `{"error":"event_type and recipient are required"}` |
| Invalid email format | 400 | `{"error":"recipient must be a valid email address"}` |
| Malformed JSON | 400 | `{"error":"Invalid JSON payload"}` |
| Server/DB error | 500 | `{"error":"Internal server error"}` |

---

### `GET /health` — System health check

```json
{
  "status":   "ok",
  "uptime":   "42s",
  "database": "connected",
  "queue": {
    "depth":          0,
    "isProcessing":   false,
    "totalEnqueued":  10,
    "totalCompleted": 8,
    "totalFailed":    2,
    "totalRetried":   1
  },
  "notifications": {
    "total":       10,
    "completed":   8,
    "failed":      2,
    "pending":     0,
    "successRate": "80%"
  },
  "timestamp": "2026-07-02T07:00:00.000Z"
}
```

---

### `GET /api/v1/notifications/:id` — Check notification status

```json
{
  "id":          1,
  "event_id":    1,
  "recipient":   "user@example.com",
  "channel":     "email",
  "status":      "completed",
  "retry_count": 0,
  "created_at":  "2026-07-02 07:00:00",
  "updated_at":  "2026-07-02 07:00:01"
}
```

---

### `GET /` — Live Dashboard

A browser-based dashboard that auto-refreshes every 5 seconds showing:
- DB notification counts (total / completed / failed / pending)
- Success rate progress bar
- Recent 10 notifications table with status badges
- Queue telemetry (enqueued / completed / failed / retried / depth)

---

## ⚡ How the Async Queue Works

The queue is implemented in [`src/services/queueWorker.js`](./src/services/queueWorker.js) using a **plain JavaScript array** as a **priority-aware FIFO queue** with a **single async drain loop**.

```
API Handler
  │
  └─► queueWorker.push(task)        ← O(n) insert in priority order
        │
        └─► processQueue()           ← starts worker loop (if not running)
              │
              └─► while (queue.length > 0)
                    └─► processTask(task)
                          ├─ await setTimeout(500–1000ms + backoff)
                          ├─ Math.random() < 0.10  →  failed
                          │     └─► updateStatus('failed', retry++)
                          │         └─► if attempt < 3: re-enqueue(HIGH, attempt+1)
                          └─ else                  →  completed
                                └─► updateStatus('completed')
```

**Why it doesn't block:**
- `push()` returns synchronously — the HTTP handler moves on instantly
- The `while` loop is `async/await` based — it yields to the event loop between tasks
- `setTimeout` is non-blocking — Node.js can serve HTTP requests during the wait

---

## 🎯 Priority System

Events are automatically assigned a priority based on their `event_type`:

| Priority | Event Types | Queue Behaviour |
|----------|-------------|-----------------|
| `high` | `payment_failed`, `account_locked`, `order_cancelled` | Jump to front |
| `normal` | `order_placed`, `payment_received`, `user_registered` | Middle |
| `low` | `shipment_sent`, `newsletter` | Processed last |

Unknown event types default to `normal`.

---

## 🔁 Auto-Retry with Exponential Backoff

When a notification fails (simulated 10% rate), it is **automatically re-queued** with:
- `priority = high` (retries are urgent)
- `attempt` incremented by 1
- Extra delay = `(attempt - 1) × 1000ms` (exponential back-off)

| Attempt | Base Delay | Back-off | Total |
|---------|-----------|----------|-------|
| 1 (initial) | 500–1000ms | 0ms | 500–1000ms |
| 2 (retry 1) | 500–1000ms | 1000ms | 1500–2000ms |
| 3 (retry 2) | 500–1000ms | 2000ms | 2500–3000ms |

After **3 failed attempts**, the notification is permanently marked `failed`.

---

## 🛑 Graceful Shutdown

On `SIGTERM` or `SIGINT` (Ctrl+C):

1. The HTTP server stops accepting new connections
2. `queueWorker.gracefulShutdown(15000)` is called
3. The worker continues draining existing queue items (up to 15 seconds)
4. Process exits cleanly with code `0`

This ensures **no in-flight notifications are lost** during deployment or restart.

---

## 🧪 Testing

A comprehensive test suite is included in `test-runner.js`:

```bash
# Make sure the server is running first
npm start

# In a second terminal:
node test-runner.js
```

**Test Coverage (26/26 passing):**

| # | Test | Expected |
|---|------|----------|
| 1 | Happy path — valid event | 202 + response fields |
| 2 | Missing `recipient` | 400 |
| 3 | Missing `event_type` | 400 |
| 4 | Empty body | 400 |
| 5 | Malformed JSON | 400 |
| 6 | 5 concurrent requests | All 202, unique IDs, < 500ms |
| 7 | 4 different event types | All 202 |
| 8 | Background processing | Status updates to completed/failed |
| 9 | Unknown route | 404 |

---

## 📮 Postman Collection

Import `postman_collection.json` into Postman for **11 ready-to-run requests**:

1. ✅ Health Check
2. 📨 Trigger `order_placed` (normal priority)
3. 🚨 Trigger `payment_failed` (HIGH priority)
4. 💳 Trigger `payment_received`
5. 👤 Trigger `user_registered`
6. 📦 Trigger `shipment_sent` (low priority)
7. 🔍 Get Notification Status by ID
8. ❌ Error — Missing `event_type`
9. ❌ Error — Missing `recipient`
10. ❌ Error — Invalid email format
11. ❌ Error — Invalid JSON

**How to import:** Postman → Import → Upload `postman_collection.json`

---

## ⚠️ Assumptions and Limitations

| # | Assumption / Limitation |
|---|-------------------------|
| 1 | **In-process queue only** — queue is lost on server restart; use Redis Streams for production durability |
| 2 | **Simulated delivery** — no real email is sent; `setTimeout` simulates the send |
| 3 | **Single-node** — in-memory queue doesn't scale horizontally across multiple instances |
| 4 | **Email channel only** — default channel is always `email`; SMS/push not implemented |
| 5 | **No auth** — no API key or JWT; add auth middleware before production deployment |
| 6 | **SQLite concurrency** — WAL mode is enabled; for high-throughput production, use PostgreSQL |
| 7 | **Max 3 retries** — configurable via `MAX_RETRIES` constant in `queueWorker.js` |
