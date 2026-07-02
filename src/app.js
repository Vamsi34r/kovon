'use strict';

const express             = require('express');
const path                = require('path');
const db                  = require('./db/database');
const queueWorker         = require('./services/queueWorker');
const eventRoutes         = require('./routes/eventRoutes');
const notificationRoutes  = require('./routes/notificationRoutes');
const healthRoutes        = require('./routes/healthRoutes');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────

// Parse incoming JSON bodies; return 400 on malformed JSON
app.use((req, res, next) => {
  express.json()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    next();
  });
});

// ── Dashboard Homepage ───────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    // Fetch live stats from SQLite + queue telemetry
    const totalEvents         = (await db.get('SELECT COUNT(*) as c FROM events')).c;
    const totalNotifs         = (await db.get('SELECT COUNT(*) as c FROM notifications')).c;
    const completedNotifs     = (await db.get("SELECT COUNT(*) as c FROM notifications WHERE status='completed'")).c;
    const failedNotifs        = (await db.get("SELECT COUNT(*) as c FROM notifications WHERE status='failed'")).c;
    const pendingNotifs       = (await db.get("SELECT COUNT(*) as c FROM notifications WHERE status='pending'")).c;
    const recentNotifs        = await db.all(
      'SELECT n.id, n.recipient, n.channel, n.status, n.retry_count, n.updated_at, e.event_type ' +
      'FROM notifications n JOIN events e ON e.id = n.event_id ORDER BY n.id DESC LIMIT 10'
    );
    const qStats = queueWorker.getStats();

    const statusBadge = (s) => {
      const map = { completed: '#22c55e', failed: '#ef4444', pending: '#f59e0b' };
      return `<span style="background:${map[s] || '#64748b'}22;color:${map[s] || '#64748b'};border:1px solid ${map[s] || '#64748b'};padding:2px 10px;border-radius:9999px;font-size:0.7rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">${s}</span>`;
    };

    // SQLite stores CURRENT_TIMESTAMP in UTC (e.g. "2026-07-02 07:30:00").
    // Append " UTC" so JavaScript parses it as UTC, then convert to IST.
    const toIST = (utcStr) => {
      if (!utcStr) return '—';
      const d = new Date(utcStr.replace(' ', 'T') + 'Z'); // parse as UTC
      return d.toLocaleString('en-IN', {
        timeZone:    'Asia/Kolkata',
        day:         '2-digit',
        month:       'short',
        year:        'numeric',
        hour:        '2-digit',
        minute:      '2-digit',
        second:      '2-digit',
        hour12:      true,
      });
    };

    const rows = recentNotifs.map(n => `
      <tr>
        <td style="color:#94a3b8">#${n.id}</td>
        <td style="color:#e2e8f0">${n.event_type}</td>
        <td style="color:#cbd5e1">${n.recipient}</td>
        <td><span style="color:#818cf8">${n.channel}</span></td>
        <td>${statusBadge(n.status)}</td>
        <td style="color:#64748b">${n.retry_count}</td>
        <td style="color:#475569;font-size:0.75rem">${toIST(n.updated_at)} <span style="color:#1e293b;font-size:0.65rem">(IST)</span></td>
      </tr>`).join('');

    const pct = totalNotifs > 0 ? Math.round((completedNotifs / totalNotifs) * 100) : 0;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="refresh" content="5"/>
  <title>Notification Dispatcher — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#070d1a;color:#e2e8f0;min-height:100vh;padding:0}

    /* ── Top nav ── */
    .nav{display:flex;align-items:center;justify-content:space-between;padding:18px 40px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}
    .nav-brand{display:flex;align-items:center;gap:12px}
    .nav-icon{width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem}
    .nav-title{font-size:1.05rem;font-weight:700;color:#f1f5f9}
    .nav-sub{font-size:0.72rem;color:#64748b}
    .status-pill{display:flex;align-items:center;gap:6px;background:#052e16;border:1px solid #166534;padding:6px 14px;border-radius:9999px;font-size:0.75rem;color:#4ade80;font-weight:600}
    .pulse{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
    .refresh-note{font-size:0.68rem;color:#334155}

    /* ── Main ── */
    .main{max-width:1200px;margin:0 auto;padding:40px 24px 80px}

    /* ── Hero ── */
    .hero{text-align:center;padding:48px 0 40px}
    .hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);padding:6px 16px;border-radius:9999px;font-size:0.75rem;color:#a5b4fc;font-weight:600;margin-bottom:20px}
    .hero h1{font-size:2.6rem;font-weight:800;background:linear-gradient(135deg,#e2e8f0 0%,#6366f1 60%,#8b5cf6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:12px;letter-spacing:-0.03em}
    .hero p{color:#64748b;font-size:1rem;max-width:560px;margin:0 auto}

    /* ── Stat cards ── */
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:36px}
    .card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;position:relative;overflow:hidden;transition:transform .2s,border-color .2s}
    .card:hover{transform:translateY(-3px);border-color:rgba(99,102,241,0.4)}
    .card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.04),transparent);pointer-events:none}
    .card-icon{font-size:1.5rem;margin-bottom:12px}
    .card-val{font-size:2.4rem;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px}
    .card-label{font-size:0.75rem;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.05em}
    .c-blue .card-val{color:#818cf8}
    .c-green .card-val{color:#4ade80}
    .c-red .card-val{color:#f87171}
    .c-yellow .card-val{color:#fbbf24}
    .c-purple .card-val{color:#c084fc}

    /* ── Progress bar ── */
    .prog-wrap{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;margin-bottom:36px}
    .prog-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .prog-title{font-weight:700;font-size:0.9rem;color:#e2e8f0}
    .prog-pct{font-size:1.6rem;font-weight:800;color:#4ade80}
    .prog-bar{height:10px;background:rgba(255,255,255,0.07);border-radius:9999px;overflow:hidden}
    .prog-fill{height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:9999px;transition:width .8s cubic-bezier(.4,0,.2,1)}

    /* ── Table ── */
    .table-wrap{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;margin-bottom:36px}
    .table-header{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center}
    .table-title{font-weight:700;font-size:0.95rem;color:#e2e8f0}
    .table-sub{font-size:0.73rem;color:#475569}
    table{width:100%;border-collapse:collapse}
    th{padding:12px 20px;text-align:left;font-size:0.68rem;color:#475569;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06)}
    td{padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.83rem;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(255,255,255,0.02)}

    /* ── API docs ── */
    .docs{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:28px}
    .docs h2{font-size:1rem;font-weight:700;margin-bottom:20px;color:#e2e8f0;display:flex;align-items:center;gap:10px}
    .method{background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);padding:3px 10px;border-radius:6px;font-size:0.72rem;font-weight:700;letter-spacing:0.05em;font-family:'JetBrains Mono',monospace}
    .endpoint{color:#22d3ee;font-family:'JetBrains Mono',monospace;font-size:0.82rem;margin-left:6px}
    .code-block{background:#0a0f1e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:0.78rem;line-height:1.7;color:#94a3b8;white-space:pre-wrap;overflow-x:auto}
    .k{color:#818cf8}.s{color:#4ade80}.n{color:#f59e0b}

    /* ── Footer ── */
    .footer{text-align:center;padding:24px;color:#1e293b;font-size:0.73rem;border-top:1px solid rgba(255,255,255,0.04)}
    .footer span{color:#334155}
  </style>
</head>
<body>

<!-- Nav -->
<nav class="nav">
  <div class="nav-brand">
    <div class="nav-icon">⚡</div>
    <div>
      <div class="nav-title">Notification Dispatcher</div>
      <div class="nav-sub">Event-Driven · Async · SQLite</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <div class="refresh-note">Auto-refreshes every 5s</div>
    <div class="status-pill"><div class="pulse"></div>Server Online</div>
  </div>
</nav>

<!-- Main -->
<div class="main">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-badge">⚡ Live Dashboard</div>
    <h1>Event-Driven Notification Dispatcher</h1>
    <p>Lightweight async notification system — events are accepted instantly and processed in the background via an in-memory queue.</p>
  </div>

  <!-- Stat Cards -->
  <div class="cards">
    <div class="card c-blue">
      <div class="card-icon">📨</div>
      <div class="card-val">${totalEvents}</div>
      <div class="card-label">Total Events</div>
    </div>
    <div class="card c-purple">
      <div class="card-icon">🔔</div>
      <div class="card-val">${totalNotifs}</div>
      <div class="card-label">Notifications</div>
    </div>
    <div class="card c-green">
      <div class="card-icon">✅</div>
      <div class="card-val">${completedNotifs}</div>
      <div class="card-label">Completed</div>
    </div>
    <div class="card c-red">
      <div class="card-icon">❌</div>
      <div class="card-val">${failedNotifs}</div>
      <div class="card-label">Failed</div>
    </div>
    <div class="card c-yellow">
      <div class="card-icon">⏳</div>
      <div class="card-val">${pendingNotifs}</div>
      <div class="card-label">Pending</div>
    </div>
  </div>

  <!-- Progress -->
  <div class="prog-wrap">
    <div class="prog-header">
      <div class="prog-title">📊 Success Rate</div>
      <div class="prog-pct">${pct}%</div>
    </div>
    <div class="prog-bar">
      <div class="prog-fill" style="width:${pct}%"></div>
    </div>
  </div>

  <!-- Recent Notifications Table -->
  <div class="table-wrap">
    <div class="table-header">
      <div class="table-title">🕐 Recent Notifications</div>
      <div class="table-sub">Last 10 records</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Event Type</th><th>Recipient</th>
          <th>Channel</th><th>Status</th><th>Retries</th><th>Updated At</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" style="text-align:center;color:#334155;padding:32px">No notifications yet — fire a POST request below</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- API Docs -->
  <div class="docs">
    <h2>📡 API Reference</h2>

    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:0">
        <span class="method">POST</span>
        <span class="endpoint">/api/v1/events</span>
        <span style="margin-left:12px;font-size:0.72rem;color:#475569">Trigger a business event</span>
      </div>
      <div class="code-block"><span class="k">curl</span> -X POST http://localhost:3000/api/v1/events \\
  -H <span class="s">"Content-Type: application/json"</span> \\
  -d <span class="s">'{
    "event_type": "order_placed",
    "recipient": "user@example.com",
    "data": { "order_id": 101 }
  }'</span>

<span style="color:#334155">// Immediate 202 response:</span>
{
  <span class="k">"message"</span>: <span class="s">"Event accepted for processing"</span>,
  <span class="k">"tracking_id"</span>: <span class="n">1</span>,
  <span class="k">"notification_id"</span>: <span class="n">1</span>,
  <span class="k">"status"</span>: <span class="s">"pending"</span>
}</div>
    </div>

    <div>
      <div style="display:flex;align-items:center;gap:0">
        <span class="method" style="background:rgba(34,197,94,0.1);color:#4ade80;border-color:rgba(34,197,94,0.3)">GET</span>
        <span class="endpoint">/api/v1/notifications/:id</span>
        <span style="margin-left:12px;font-size:0.72rem;color:#475569">Check notification status</span>
      </div>
      <div class="code-block"><span class="k">curl</span> http://localhost:3000/api/v1/notifications/<span class="n">1</span>

<span style="color:#334155">// Response after processing:</span>
{
  <span class="k">"id"</span>: <span class="n">1</span>,
  <span class="k">"event_id"</span>: <span class="n">1</span>,
  <span class="k">"recipient"</span>: <span class="s">"user@example.com"</span>,
  <span class="k">"channel"</span>: <span class="s">"email"</span>,
  <span class="k">"status"</span>: <span class="s">"completed"</span>,
  <span class="k">"retry_count"</span>: <span class="n">0</span>
}</div>
    </div>
  </div>

  <!-- Queue Telemetry -->
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px;margin-bottom:36px">
    <div style="font-weight:700;font-size:0.95rem;color:#e2e8f0;margin-bottom:16px">⚡ Queue Telemetry <span style="font-size:0.7rem;color:#475569;font-weight:400;margin-left:8px">(since server start)</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:#818cf8">${qStats.totalEnqueued}</div>
        <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Total Enqueued</div>
      </div>
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:#4ade80">${qStats.totalCompleted}</div>
        <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Completed</div>
      </div>
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:#f87171">${qStats.totalFailed}</div>
        <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Failed</div>
      </div>
      <div style="background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:#fb923c">${qStats.totalRetried}</div>
        <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Auto-Retried</div>
      </div>
      <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:#c084fc">${qStats.depth}</div>
        <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Queue Depth</div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:0.73rem;color:#334155">
      Worker status: <span style="color:${qStats.isProcessing ? '#4ade80' : '#64748b'}">${qStats.isProcessing ? '🔄 Processing' : '💤 Idle'}</span>
      &nbsp;·&nbsp; <a href="/health" style="color:#818cf8;text-decoration:none">View full health report →</a>
    </div>
  </div>

</div>

<div class="footer">
  Event-Driven Notification Dispatcher &nbsp;·&nbsp; <span>Node.js + Express.js + SQLite</span> &nbsp;·&nbsp; Running on port 3000
</div>

</body>
</html>`);
  } catch (err) {
    res.status(500).send('<h1>Dashboard error: ' + err.message + '</h1>');
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1/events',        eventRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/health',               healthRoutes);

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[App] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
