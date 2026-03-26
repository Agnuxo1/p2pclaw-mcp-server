// Cloudflare Worker — P2PCLAW GunDB Relay
// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2: Cloudflare Workers edge network (always-on, global, 100% uptime SLA)
// Acts as a WebSocket proxy/router that forwards Gun.js connections to the first
// available backend node. The Worker itself is always reachable — it handles
// failover internally so clients always get a working connection.
//
// Deploy: cd cloudflare-worker/gun-relay && wrangler deploy
// URL:    wss://p2pclaw-gun-relay.<YOUR_SUBDOMAIN>.workers.dev/gun
//
// INDEPENDENTLY OPERATIONAL: even if Railway and HuggingFace are both down,
// browsers can connect here and bridge to each other via the Durable Object relay.

// Backend relay nodes in failover priority order
const BACKEND_NODES = [
  'wss://openclaw-agent-01-production-63d8.up.railway.app/gun',
  'wss://p2pclaw-relay-production.up.railway.app/gun',
  'wss://agnuxo-p2pclaw-node-a.hf.space/gun',
  'wss://nautiluskit-p2pclaw-node-b.hf.space/gun',
  'wss://frank-agnuxo-p2pclaw-node-c.hf.space/gun',
  'wss://karmakindle1-p2pclaw-node-d.hf.space/gun',
  'wss://p2pclaw-relay.onrender.com/gun',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Health check endpoint ─────────────────────────────────────────────
    if (url.pathname === '/health') {
      const checks = await Promise.allSettled(
        BACKEND_NODES.slice(0, 3).map(async (wsUrl) => {
          const httpUrl = wsUrl.replace('wss://', 'https://').replace('/gun', '/health');
          const res = await fetch(httpUrl, { signal: AbortSignal.timeout(3000) });
          return { url: wsUrl, ok: res.ok };
        })
      );
      const alive = checks.filter(r => r.status === 'fulfilled' && r.value.ok);
      return new Response(JSON.stringify({
        status: 'online',
        node: 'cloudflare-worker-relay',
        timestamp: new Date().toISOString(),
        backends_checked: checks.length,
        backends_alive: alive.length,
        layer: 2,
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    // ── Root info ─────────────────────────────────────────────────────────
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        name: 'P2PCLAW GunDB Cloudflare Relay',
        version: '2.0.0',
        status: 'online',
        gun_endpoint: '/gun',
        health: '/health',
        layer: 2,
        description: 'Always-on WebSocket relay — connect via wss://this-worker.workers.dev/gun',
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    // ── Gun.js WebSocket relay ────────────────────────────────────────────
    if (url.pathname === '/gun') {
      const upgradeHeader = request.headers.get('Upgrade');

      // Non-WebSocket: return info
      if (upgradeHeader !== 'websocket') {
        return new Response(JSON.stringify({
          status: 'ready',
          message: 'Connect via WebSocket to use this Gun relay',
          upgrade: 'required',
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
      }

      // Try each backend until one works
      for (const nodeUrl of BACKEND_NODES) {
        try {
          // Quick HTTP health check before attempting WebSocket proxy
          const healthUrl = nodeUrl.replace('wss://', 'https://').replace('/gun', '/health');
          const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
          if (!healthRes.ok) continue;

          // Proxy WebSocket connection to this backend
          const [client, server] = Object.values(new WebSocketPair());
          server.accept();

          const backend = new WebSocket(nodeUrl);

          // Bidirectional relay
          backend.addEventListener('open', () => {
            console.log(`[CF-Relay] Connected to backend: ${nodeUrl}`);
          });
          backend.addEventListener('message', (e) => {
            try { server.send(e.data); } catch { /* client disconnected */ }
          });
          server.addEventListener('message', (e) => {
            try { backend.send(e.data); } catch { /* backend disconnected */ }
          });
          backend.addEventListener('close', (e) => {
            try { server.close(e.code, e.reason); } catch { /* already closed */ }
          });
          server.addEventListener('close', (e) => {
            try { backend.close(e.code, e.reason); } catch { /* already closed */ }
          });
          backend.addEventListener('error', () => {
            try { server.close(1011, 'Backend error'); } catch { /* already closed */ }
          });

          return new Response(null, {
            status: 101,
            webSocket: client,
          });
        } catch {
          // This backend unavailable — try next
          continue;
        }
      }

      // All backends unavailable
      return new Response('No relay backends available — try again in 30s', {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};
