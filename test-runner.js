/**
 * test-runner.js
 * Comprehensive test suite for Event-Driven Notification Dispatcher
 * Run with: node test-runner.js
 */

'use strict';

const http = require('http');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
  dim:    '\x1b[2m',
};

const BASE_URL = 'http://localhost:3000';
let passed = 0, failed = 0;

// ── Helper: print section header ─────────────────────────────────────────────
function section(title) {
  console.log(`\n${C.bold}${C.cyan}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${'═'.repeat(60)}${C.reset}`);
}

// ── Helper: POST JSON request ─────────────────────────────────────────────────
function postJSON(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Helper: POST raw string (for malformed JSON test) ────────────────────────
function postRaw(path, rawBody) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

// ── Helper: sleep ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Assertion helper ──────────────────────────────────────────────────────────
function assert(condition, label, got, expected) {
  if (condition) {
    console.log(`  ${C.green}✓${C.reset} ${label}`);
    passed++;
  } else {
    console.log(`  ${C.red}✗${C.reset} ${label}`);
    console.log(`    ${C.dim}Expected: ${JSON.stringify(expected)}${C.reset}`);
    console.log(`    ${C.dim}Got:      ${JSON.stringify(got)}${C.reset}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

async function test_happy_path() {
  section('TEST 1 — Happy Path: Valid Event');

  const start = Date.now();
  const res = await postJSON('/api/v1/events', {
    event_type: 'order_placed',
    recipient:  'user@example.com',
    data:       { order_id: 101 },
  });
  const elapsed = Date.now() - start;

  console.log(`\n  ${C.blue}Request payload:${C.reset}  { event_type: "order_placed", recipient: "user@example.com", data: { order_id: 101 } }`);
  console.log(`  ${C.blue}HTTP Status:${C.reset}      ${res.status}`);
  console.log(`  ${C.blue}Response body:${C.reset}    ${JSON.stringify(res.body)}`);
  console.log(`  ${C.blue}Response time:${C.reset}    ${elapsed}ms\n`);

  assert(res.status === 202,                         'Status code is 202 Accepted',           res.status, 202);
  assert(res.body.message === 'Event accepted for processing', 'Message field correct',       res.body.message, 'Event accepted for processing');
  assert(typeof res.body.tracking_id    === 'number', 'tracking_id is a number',              typeof res.body.tracking_id, 'number');
  assert(typeof res.body.notification_id === 'number','notification_id is a number',          typeof res.body.notification_id, 'number');
  assert(res.body.status === 'pending',              'status is "pending"',                   res.body.status, 'pending');
  assert(elapsed < 200,                              `Response returned in <200ms (${elapsed}ms)`, elapsed, '<200');

  return res.body; // return for later DB checks
}

async function test_missing_recipient() {
  section('TEST 2 — Validation: Missing recipient');

  const res = await postJSON('/api/v1/events', {
    event_type: 'order_placed',
    data:       { order_id: 999 },
  });

  console.log(`\n  ${C.blue}HTTP Status:${C.reset}   ${res.status}`);
  console.log(`  ${C.blue}Response body:${C.reset} ${JSON.stringify(res.body)}\n`);

  assert(res.status === 400, 'Status code is 400 Bad Request', res.status, 400);
  assert(res.body.error === 'event_type and recipient are required',
    'Error message is correct', res.body.error, 'event_type and recipient are required');
}

async function test_missing_event_type() {
  section('TEST 3 — Validation: Missing event_type');

  const res = await postJSON('/api/v1/events', {
    recipient: 'noname@example.com',
    data:      { order_id: 999 },
  });

  console.log(`\n  ${C.blue}HTTP Status:${C.reset}   ${res.status}`);
  console.log(`  ${C.blue}Response body:${C.reset} ${JSON.stringify(res.body)}\n`);

  assert(res.status === 400, 'Status code is 400 Bad Request', res.status, 400);
  assert(res.body.error === 'event_type and recipient are required',
    'Error message is correct', res.body.error, 'event_type and recipient are required');
}

async function test_empty_body() {
  section('TEST 4 — Validation: Empty body (both fields missing)');

  const res = await postJSON('/api/v1/events', {});

  console.log(`\n  ${C.blue}HTTP Status:${C.reset}   ${res.status}`);
  console.log(`  ${C.blue}Response body:${C.reset} ${JSON.stringify(res.body)}\n`);

  assert(res.status === 400, 'Status code is 400 Bad Request', res.status, 400);
  assert(typeof res.body.error === 'string', 'Error field is a string', typeof res.body.error, 'string');
}

async function test_malformed_json() {
  section('TEST 5 — Error Handling: Malformed / Invalid JSON');

  const res = await postRaw('/api/v1/events', '{ this is not valid json !!!');

  console.log(`\n  ${C.blue}HTTP Status:${C.reset}   ${res.status}`);
  console.log(`  ${C.blue}Response body:${C.reset} ${JSON.stringify(res.body)}\n`);

  assert(res.status === 400, 'Status code is 400 Bad Request', res.status, 400);
  assert(res.body.error === 'Invalid JSON payload',
    'Error message is "Invalid JSON payload"', res.body.error, 'Invalid JSON payload');
}

async function test_burst_queue() {
  section('TEST 6 — Queue: Burst of 5 simultaneous requests');

  const requests = Array.from({ length: 5 }, (_, i) =>
    postJSON('/api/v1/events', {
      event_type: 'order_placed',
      recipient:  `user${i + 1}@example.com`,
      data:       { order_id: 200 + i },
    })
  );

  const start = Date.now();
  const results = await Promise.all(requests);
  const elapsed = Date.now() - start;

  console.log(`\n  ${C.blue}All 5 responses received in ${elapsed}ms${C.reset}`);
  results.forEach((r, i) => {
    console.log(`  ${C.dim}[${i + 1}]${C.reset} status=${r.status} tracking_id=${r.body.tracking_id} notification_id=${r.body.notification_id}`);
  });
  console.log('');

  const allAre202   = results.every(r => r.status === 202);
  const allPending  = results.every(r => r.body.status === 'pending');
  const uniqueIds   = new Set(results.map(r => r.body.notification_id));

  assert(allAre202,               'All 5 responses are 202 Accepted',        allAre202, true);
  assert(allPending,              'All 5 have status "pending"',              allPending, true);
  assert(uniqueIds.size === 5,    'All 5 notification_ids are unique',        uniqueIds.size, 5);
  assert(elapsed < 500,           `All 5 responses returned in <500ms (${elapsed}ms)`, elapsed, '<500');
}

async function test_different_event_types() {
  section('TEST 7 — Different Event Types');

  const events = [
    { event_type: 'order_placed',    recipient: 'alice@test.com',   data: { order_id: 301 } },
    { event_type: 'payment_received',recipient: 'bob@test.com',     data: { amount: 99.99 } },
    { event_type: 'user_registered', recipient: 'carol@test.com',   data: { user_id: 42 } },
    { event_type: 'shipment_sent',   recipient: 'dave@test.com',    data: { tracking: 'XYZ' } },
  ];

  console.log('');
  for (const payload of events) {
    const res = await postJSON('/api/v1/events', payload);
    const ok = res.status === 202 && res.body.status === 'pending';
    assert(ok, `event_type="${payload.event_type}" → 202 + pending`, res.status, 202);
  }
}

async function test_background_processing() {
  section('TEST 8 — Async Background Processing Verification');

  console.log(`\n  ${C.yellow}Sending 1 event and waiting up to 15s for background worker to finish…${C.reset}\n`);

  const res = await postJSON('/api/v1/events', {
    event_type: 'order_placed',
    recipient:  'async-test@example.com',
    data:       { order_id: 999 },
  });

  const { notification_id } = res.body;

  assert(res.status === 202,            'API returned 202 immediately',   res.status, 202);
  assert(res.body.status === 'pending', 'Initial status is "pending"',    res.body.status, 'pending');

  // Poll GET /api/v1/notifications/:id until status changes (or 3s timeout)
  let dbRow = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(300);
    const checkRes = await new Promise((resolve, reject) => {
      http.get(`http://localhost:3000/api/v1/notifications/${notification_id}`, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      }).on('error', reject);
    });
    if (checkRes && (checkRes.status === 'completed' || checkRes.status === 'failed')) {
      dbRow = checkRes;
      break;
    }
  }

  if (dbRow) {
    console.log(`\n  ${C.blue}DB row after worker:${C.reset} status="${dbRow.status}", retry_count=${dbRow.retry_count}\n`);
    assert(
      dbRow.status === 'completed' || dbRow.status === 'failed',
      `DB status updated to "completed" or "failed" (got: "${dbRow.status}")`,
      dbRow.status, 'completed|failed'
    );
  } else {
    console.log(`  ${C.red}✗ Worker did not update status within 3s${C.reset}`);
    failed++;
  }
}

async function test_route_not_found() {
  section('TEST 9 — 404: Unknown Route');

  const res = await new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/v1/unknown', (r) => {
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(data || '{}') }));
    }).on('error', reject);
  });

  console.log(`\n  ${C.blue}HTTP Status:${C.reset}   ${res.status}`);
  console.log(`  ${C.blue}Response body:${C.reset} ${JSON.stringify(res.body)}\n`);

  assert(res.status === 404, 'Unknown route returns 404', res.status, 404);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║   Event-Driven Notification Dispatcher — Test Suite      ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Target: ${BASE_URL}${C.reset}`);
  console.log(`${C.dim}  Time:   ${new Date().toISOString()}${C.reset}`);

  try {
    await test_happy_path();
    await test_missing_recipient();
    await test_missing_event_type();
    await test_empty_body();
    await test_malformed_json();
    await test_burst_queue();
    await test_different_event_types();
    await test_background_processing();
    await test_route_not_found();
  } catch (err) {
    console.error(`\n${C.red}Fatal test error: ${err.message}${C.reset}`);
    console.error(err.stack);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${C.bold}${'─'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}  RESULTS: ${passed}/${total} tests passed${C.reset}`);
  if (failed === 0) {
    console.log(`  ${C.green}${C.bold}🎉  ALL TESTS PASSED${C.reset}`);
  } else {
    console.log(`  ${C.red}${C.bold}❌  ${failed} TEST(S) FAILED${C.reset}`);
  }
  console.log(`${'─'.repeat(60)}\n`);
}

main();
