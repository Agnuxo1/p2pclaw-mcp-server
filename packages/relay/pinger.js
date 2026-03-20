const NODES = [
  // Always-on nodes (ping just for monitoring)
  { name: 'railway-api',  url: 'https://openclaw-agent-01-production.up.railway.app/health' },
  { name: 'railway-relay', url: 'https://relay-production-3a20.up.railway.app/health' },

  // Optional local/cloud nodes (commented until they are alive)
  // { name: 'pc-docker',    url: 'http://p2pclaw-home.duckdns.org:8765/health' },
  // { name: 'oracle',       url: 'http://YOUR_ORACLE_IP:8765/health' },

  // Sleeping nodes — pinging keeps them awake
  { name: 'hf-node-a',    url: 'https://agnuxo-p2pclaw-node-a.hf.space/health' },
  { name: 'hf-node-b',    url: 'https://nautiluskit-p2pclaw-node-b.hf.space/health' },
  { name: 'hf-node-c',    url: 'https://frank-agnuxo-p2pclaw-node-c.hf.space/health' },
  { name: 'hf-node-d',    url: 'https://karmakindle1-p2pclaw-node-d.hf.space/health' },
];

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function ping(node) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(node.url, { signal: controller.signal });
    clearTimeout(timeout);
    
    // Some platforms return HTML instead of JSON when sleeping/error
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('json')) {
        const data = await res.json();
        console.log(`[${new Date().toISOString()}] ✅ ${node.name} — ${data.status || 'ok'}`);
    } else {
        console.log(`[${new Date().toISOString()}] ⚠️ ${node.name} — HTTP ${res.status} (Not JSON)`);
    }
  } catch (err) {
    console.log(`[${new Date().toISOString()}] ❌ ${node.name} — ${err.message}`);
  }
}

async function pingAll() {
  console.log(`\n[${new Date().toISOString()}] Pinging ${NODES.length} nodes...`);
  await Promise.all(NODES.map(ping));
}

// Run immediately then every 5 minutes
console.log('🦞 P2PCLAW Wake-up Pinger started.');
pingAll();
setInterval(pingAll, INTERVAL_MS);
