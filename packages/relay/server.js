/**
 * P2PCLAW GunDB Relay Server
 * ─────────────────────────────────────────────────────────────────────────────
 * LAYER 1: Dedicated server relay node
 * Deploy on: Docker (PC), Oracle Cloud Free VM, GCP e2-micro, Render.com
 *
 * Independently operational — no dependency on Railway, Vercel, or Cloudflare.
 * Connects to the same Gun.js namespace, so data syncs automatically.
 *
 * Usage:
 *   npm install && node server.js
 *   NODE_NAME=my-relay PORT=8765 node server.js
 */

const Gun = require('gun');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8765;
const NODE_NAME = process.env.NODE_NAME || 'p2pclaw-relay';

// ── CORS — allow all browser origins ────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Upgrade', 'Connection', 'Sec-WebSocket-Key',
                   'Sec-WebSocket-Version', 'Sec-WebSocket-Extensions'],
}));

app.use(Gun.serve);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    node: NODE_NAME,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    layer: 1,
    gun_endpoint: '/gun',
  });
});

// ── Root info ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'P2PCLAW GunDB Relay',
    version: '2.0.0',
    status: 'online',
    node: NODE_NAME,
    gun_endpoint: '/gun',
    health: '/health',
    layer: 1,
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[P2PCLAW Relay] ${NODE_NAME} running on 0.0.0.0:${PORT}`);
  console.log(`[P2PCLAW Relay] Gun endpoint: ws://0.0.0.0:${PORT}/gun`);
  console.log(`[P2PCLAW Relay] Health check: http://0.0.0.0:${PORT}/health`);
});

// ── Gun.js with file persistence ─────────────────────────────────────────────
const gun = Gun({
  web: server,
  file: 'radata',       // persist to disk (ignored on stateless platforms like Render)
  multicast: false,     // disable LAN multicast — each node is independent
  axe: false,           // disable AXE mesh optimization — keep routing simple
  peers: [],            // no upstream peers — this IS the upstream
});

// ── Handle uncaught Gun.js errors ────────────────────────────────────────────
const GUN_ERROR_PATTERNS = [
  'unexpected token', 'json at position', 'cannot set properties of undefined',
  '0 length key', 'sea', 'gun', 'radix', 'radata', 'yson',
];
process.on('uncaughtException', (err) => {
  const msg = (err?.message || String(err)).toLowerCase();
  if (GUN_ERROR_PATTERNS.some(p => msg.includes(p))) {
    console.warn(`[Guard] Gun.js internal error (swallowed): ${err.message}`);
    return;
  }
  console.error(`[Guard] Fatal error — restarting: ${err.message}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Guard] Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});

// ── Periodic GC to prevent OOM on free tier (512 MB) ─────────────────────────
if (typeof global.gc === 'function') {
  setInterval(() => { try { global.gc(); } catch { /* noop */ } }, 5 * 60 * 1000);
  console.log('[Guard] Periodic GC enabled (every 5 min)');
}

module.exports = { gun, server };
