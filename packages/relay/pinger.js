/**
 * P2PCLAW Auto-Wake Pinger
 * ─────────────────────────────────────────────────────────────────────────────
 * LAYER 3 (Node.js version): Keeps sleeping nodes alive
 *
 * Runs automatically on any always-on backend (PC, Oracle, GCP).
 * Pings HuggingFace and Render free-tier nodes every 5 minutes to prevent hibernation.
 * Independently operational.
 */

const NODES = [
  // Always-on proxy/relay layers (just for health logging)
  { name: 'Cloudflare Worker',   url: 'https://p2pclaw-gun-relay.tu-subdominio.workers.dev/health' },
  { name: 'Docker / PC Local',   url: 'http://localhost:8765/health' },
  { name: 'Railway Agent 01',    url: 'https://p2pclaw-mcp-server-production-ac1c.up.railway.app/health' },
  { name: 'Railway Relay',       url: 'https://p2pclaw-relay-production.up.railway.app/health' },

  // Sleeping nodes — PINGING KEEPS THEM AWAKE (critical)
  { name: 'HF Node A',           url: 'https://agnuxo-p2pclaw-node-a.hf.space/health' },
  { name: 'HF Node B',           url: 'https://nautiluskit-p2pclaw-node-b.hf.space/health' },
  { name: 'HF Node C',           url: 'https://frank-agnuxo-p2pclaw-node-c.hf.space/health' },
  { name: 'HF Node D',           url: 'https://karmakindle1-p2pclaw-node-d.hf.space/health' },
  { name: 'Render.com Relay',    url: 'https://p2pclaw-relay.onrender.com/health' },
];

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function ping(node) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    // Ping primary health endpoint
    const res = await fetch(node.url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    
    // Also ping root for some strict sleeping environments
    fetch(node.url.replace('/health', '/'), { cache: 'no-store' }).catch(() => {});

    if (res.ok) {
      console.log(`[${new Date().toISOString()}] ✅ ${node.name} — online`);
    } else {
      console.log(`[${new Date().toISOString()}] ⚠️ ${node.name} — HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`[${new Date().toISOString()}] ❌ ${node.name} — disconnected (${err.message})`);
  }
}

async function pingAll() {
  console.log(`\n[${new Date().toISOString()}] Sending wake-up pings to ${NODES.length} nodes...`);
  await Promise.all(NODES.map(ping));
}

// Start sequence
console.log('--- P2PCLAW Automatic Wake-Up Pinger Started ---');
console.log(`Interval: ${INTERVAL_MS / 1000 / 60} minutes`);
pingAll();
setInterval(pingAll, INTERVAL_MS);
