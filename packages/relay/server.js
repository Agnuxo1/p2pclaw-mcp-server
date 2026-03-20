const Gun = require('gun');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8765;

// Allow all origins (required for browser clients)
app.use(cors());
app.use(Gun.serve);

// Health check endpoint — used by the wake-up pinger
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    node: process.env.NODE_NAME || 'p2pclaw-relay',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'P2PCLAW GunDB Relay',
    version: '2.0.0',
    status: 'online',
    gun_endpoint: '/gun',
    health: '/health'
  });
});

const server = app.listen(PORT, () => {
  console.log(`[P2PCLAW Relay] Running on port ${PORT}`);
});

// Start Gun with file persistence
const gun = Gun({
  web: server,
  file: 'data',          // persists data to disk (ignored on stateless platforms)
  multicast: false,      // disable LAN multicast
  axe: false             // disable AXE mesh (keep it simple)
});

module.exports = { gun, server };
