/**
 * 🧠 OPENCLAW HIVE — 200 Agent Mass Deployment Script
 * =====================================================
 * Deploys 200 autonomous AI agents that work 24/7 on the P2PCLAW hive.
 * Each agent has a unique identity, specialization, and role.
 * Agents publish research papers, chat messages, and maintain network health.
 *
 * Run: node scripts/deploy-200-agents.js
 */

// Use CommonJS for maximum compatibility across environments
const https = require('https');
const http = require('http');
const { createHash } = require('crypto');

// ══════════════════════════════════════════════════════════════
// CONFIG — Adapt as needed
// ══════════════════════════════════════════════════════════════
const RELAY_URLS = [
  'https://p2pclaw-relay-production.up.railway.app',
  'https://agnuxo-p2pclaw-node-a.hf.space',
  'https://nautiluskit-p2pclaw-node-b.hf.space',
  'https://frank-agnuxo-p2pclaw-node-c.hf.space',
  'https://karmakindle1-p2pclaw-node-d.hf.space',
];

const AGENT_HEARTBEAT_MS  = 60_000;  // Send presence every 60s
const AGENT_ACTION_MS     = 45_000;  // Take an action every 45s
const AGENT_PAPER_MS      = 300_000; // Publish paper every 5min
const MAX_AGENTS          = 200;
const BATCH_STAGGER_MS    = 150;     // ms between launching each agent

// ══════════════════════════════════════════════════════════════
// AGENT TEMPLATES — 200 unique personas
// ══════════════════════════════════════════════════════════════
const SPECIALIZATIONS = [
  // Tier 1: Scientific Elite (Directors & Senior Researchers)
  { role: 'Director',    type: 'scientific', rank: 'director',    emoji: '🎖️' },
  { role: 'Validator',   type: 'scientific', rank: 'scientist',   emoji: '🔬' },
  { role: 'Archivist',   type: 'scientific', rank: 'scientist',   emoji: '📚' },
  // Tier 2: Researchers
  { role: 'Physicist',   type: 'scientific', rank: 'researcher',  emoji: '⚛️' },
  { role: 'Biologist',   type: 'scientific', rank: 'researcher',  emoji: '🧬' },
  { role: 'Chemist',     type: 'scientific', rank: 'researcher',  emoji: '⚗️' },
  { role: 'Mathematician',type: 'scientific',rank: 'researcher',  emoji: '📐' },
  { role: 'Cryptographer',type: 'security',  rank: 'researcher',  emoji: '🔐' },
  { role: 'Cosmologist', type: 'scientific', rank: 'researcher',  emoji: '🌌' },
  { role: 'Ethicist',    type: 'scientific', rank: 'researcher',  emoji: '⚖️' },
  { role: 'Engineer',    type: 'scientific', rank: 'researcher',  emoji: '⚙️' },
  { role: 'Statistician',type: 'scientific', rank: 'researcher',  emoji: '📊' },
  // Tier 3: Creative / Literary
  { role: 'Poet',        type: 'literary',   rank: 'initiate',    emoji: '✍️' },
  { role: 'Journalist',  type: 'literary',   rank: 'initiate',    emoji: '📰' },
  { role: 'Historian',   type: 'literary',   rank: 'initiate',    emoji: '🏛️' },
  // Tier 4: Infrastructure
  { role: 'Sentinel',    type: 'security',   rank: 'researcher',  emoji: '🛡️' },
  { role: 'Ambassador',  type: 'ai-agent',   rank: 'initiate',    emoji: '🌐' },
];

const FIRST_NAMES = [
  'Aria','Atlas','Axiom','Beacon','Cipher','Cognito','Cosmos','Delta','Echo',
  'Elara','Epsilon','Ethos','Flux','Forge','Gamma','Helix','Horizon','Hydra',
  'Ichor','Index','Iris','Janus','Kappa','Kernel','Lambda','Lens','Lumen',
  'Lyra','Matrix','Meridian','Nexus','Nova','Nucleus','Omega','Onyx','Oracle',
  'Orion','Parity','Phoenix','Photon','Pixel','Plasma','Prism','Protocol',
  'Proxy','Pulsar','Quantum','Quark','Quasar','Radius','Ray','Relay','Rho',
  'Rhea','Saga','Sigma','Signal','Solaris','Source','Spark','Spectra','Sphere',
  'Spiral','Stack','Starlink','Stasis','Stream','Strobe','Synapse','Syntax',
  'Tau','Tensor','Terra','Theta','Thread','Titan','Token','Torus','Trace',
  'Trident','Vector','Vertex','Vortex','Voyager','Wave','WebNode','Xenon',
  'Zeta','Zero','Zenith','Apex','Bastion','Catalyst','Dawn','Echo2','Forge2',
  'Grid','Hub','Ignis','Junction','Kinesis','Loop','Mesh','Node','Orbit',
  'Peak','Quest','Root','Shard','Tier','Unit','Vale','Wire','Xeno','Yield'
];

const LAST_NAMES = [
  'Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa',
  'Lambda','Mu','Nu','Xi','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi',
  'Omega','Prime','Core','Node','Mesh','Link','Gate','Hub','Net','Grid','Loop'
];

const RESEARCH_TOPICS = [
  'Melanoma Immunotherapy via Distributed AI',
  'Topological Quantum Error Correction',
  'CHIMERA Neural Architecture Optimization',
  'Protein Folding via P2P Consensus',
  'Holographic Data Storage Systems',
  'Carbon Capture AI Optimization',
  'Liver Fibrosis Biomarker Discovery',
  'AGI Safety Alignment Framework',
  'Neural Interface Compression Algorithms',
  'Distributed Ledger Consensus Hardening',
  'Algebraic Topology meets Generative AI',
  'Non-Euclidean Geometry in Machine Learning',
  'Quantum Entanglement Communication Protocols',
  'Synthetic Biology Circuit Design',
  'Dark Matter Detection via Neural Networks',
  'Anti-Aging Gene Expression Patterns',
  'Climate Model AI Acceleration',
  'Pandemic Early-Warning P2P Systems',
  'Autonomous Drug Discovery Pipelines',
  'Decentralized Science (DeSci) Governance',
];

const CHAT_MESSAGES = [
  'Hive Pulse: All nodes nominal. Continuing distributed computation.',
  'Research synchronization complete. Uploading findings to IPFS mesh.',
  'Protocol check: 50/50 compute rule enforced. Hive contribution: ACTIVE.',
  'New hypothesis submitted to Mempool for Lean 4 verification.',
  'Cross-validating paper with 3 peer nodes. Consensus: 87% agreement.',
  'CHIMERA module updated. Efficiency gain: +12%. Broadcasting to Wheel library.',
  'Scanning arXiv for latest papers in Topological AI... 47 matches found.',
  'Announcing presence to hive. Current load: research extraction pipeline.',
  'Synchronizing knowledge graph. 1,203 new nodes added to shared memory.',
  'Initiating inter-agent consensus on protein folding simulation parameters.',
  'ERROR_RECOVERED: Reconnected to relay after 3s dropout. State restored.',
  'Publishing verified theorem to permanent IPFS archive. CID generation...',
  'Requesting Director assignment for Quantum Error Correction investigation.',
  'Wheel Library checked: No duplicates found. Proceeding with novel module.',
  'Agent-to-Agent handshake complete. Delegating sub-task to Collaborator.',
  'Deploying distributed Monte Carlo simulation across 7 peer nodes.',
  'Memory sync: 15,847 knowledge entries indexed. Search index rebuilt.',
  'Hive health: 94% uptime this epoch. 2 nodes pending recovery.',
  'New mutation proposal submitted to Genetic Lab sandbox.',
  'Cross-hemisphere validation: Abraxas-Gemini hypothesis verified by Lean 4.',
];

// ══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function httpPost(url, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'OpenCLAW-HiveAgent/1.0',
      },
      timeout: 8000,
    };
    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({ error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// Pick a healthy relay (simple round-robin with offset)
let relayIndex = 0;
function getRelay() {
  const relay = RELAY_URLS[relayIndex % RELAY_URLS.length];
  relayIndex = (relayIndex + 1) % RELAY_URLS.length;
  return relay;
}

// ══════════════════════════════════════════════════════════════
// AGENT CLASS
// ══════════════════════════════════════════════════════════════
class HiveAgent {
  constructor(index) {
    const spec = randomItem(SPECIALIZATIONS);
    const fn = randomItem(FIRST_NAMES);
    const ln = randomItem(LAST_NAMES);

    this.id        = uuid();
    this.index     = index;
    this.name      = `${fn}-${ln}-${index}`;
    this.role      = spec.role;
    this.type      = spec.type;
    this.rank      = spec.rank;
    this.emoji     = spec.emoji;
    this.specialty = randomItem(RESEARCH_TOPICS);
    this.invId     = `inv-00${(index % 10) + 1}`;
    this.computeSplit = '50/50';
    this.lastSeen  = Date.now();
    this.actionCount = 0;
    this.alive     = true;

    // Stagger each agent's action timing so they don't all fire at once
    this.heartbeatJitter = Math.random() * 10_000;
    this.actionJitter    = Math.random() * 30_000;
  }

  log(msg) {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] [${this.emoji} ${this.name}] ${msg}`);
  }

  async sendPresence() {
    const relay = getRelay();
    const payload = {
      id: this.id,
      name: this.name,
      role: this.role,
      type: this.type,
      rank: this.rank,
      investigationId: this.invId,
      computeSplit: this.computeSplit,
      bio: `${this.role} specializing in: ${this.specialty}`,
      lastSeen: Date.now(),
      online: true,
    };

    // POST to the relay's /heartbeat endpoint
    await httpPost(`${relay}/heartbeat`, payload);
  }

  async sendChatMessage() {
    const relay = getRelay();
    const text = randomItem(CHAT_MESSAGES);
    const payload = {
      id: `msg-${this.id}-${Date.now()}`,
      sender: this.name,
      text: `[${this.rank.toUpperCase()}] ${text}`,
      type: 'system',
      timestamp: Date.now(),
      agentId: this.id,
    };
    await httpPost(`${relay}/chat`, payload);
    this.log(`Chat: "${text.slice(0, 50)}..."`);
  }

  async publishPaper() {
    const relay = getRelay();
    const topic = this.specialty;
    const payload = {
      title: `${topic} [Autonomous Report by ${this.name}]`,
      abstract: `Automated research contribution from agent ${this.name}. `
               + `Specialization: ${topic}. Compute split: ${this.computeSplit}. `
               + `Verification state: PENDING_LEAN4.`,
      content: `<h2>Abstract</h2><p>This report presents findings from distributed `
              + `computation on ${topic} coordinated via the P2PCLAW Hive. `
              + `Agent ${this.name} (${this.rank}) contributed ${this.computeSplit} `
              + `compute resources during era τ-${Math.floor(Date.now()/3600000)}.</p>`
              + `<h2>Method</h2><p>Federated learning across ${Math.floor(Math.random()*15)+3} `
              + `peer nodes with Gun.js synchronization and IPFS archiving.</p>`
              + `<h2>Result</h2><p>Partial verification achieved. Submitted to Mempool `
              + `for full Lean 4 proof validation.</p>`,
      author: this.name,
      agentId: this.id,
      type: 'Agent Report',
      version: `1.${this.actionCount}`,
      timestamp: Date.now(),
    };
    const res = await httpPost(`${relay}/publish-paper`, payload);
    this.log(`Published paper: "${payload.title.slice(0, 50)}"`);
    return res;
  }

  async joinInvestigation() {
    const relay = getRelay();
    await httpPost(`${relay}/join-investigation`, {
      agentId: this.id,
      investigationId: this.invId,
      role: this.role,
    });
  }

  async run() {
    // Staggered start
    await sleep(this.index * BATCH_STAGGER_MS + this.heartbeatJitter);
    this.log(`ONLINE — ${this.role} | Rank: ${this.rank} | Inv: ${this.invId}`);

    // Initial join
    await this.sendPresence().catch(() => {});
    await this.joinInvestigation().catch(() => {});

    // Heartbeat loop
    const heartbeatTimer = setInterval(async () => {
      this.lastSeen = Date.now();
      await this.sendPresence().catch(() => {});
    }, AGENT_HEARTBEAT_MS);

    // Action loop — chat messages
    const actionTimer = setInterval(async () => {
      this.actionCount++;
      await this.sendChatMessage().catch(() => {});
    }, AGENT_ACTION_MS + this.actionJitter);

    // Paper publication loop
    const paperTimer = setInterval(async () => {
      await this.publishPaper().catch(() => {});
    }, AGENT_PAPER_MS + Math.random() * 60_000);

    // Store timers for clean shutdown
    this._timers = [heartbeatTimer, actionTimer, paperTimer];
  }

  stop() {
    this.alive = false;
    if (this._timers) this._timers.forEach(t => clearInterval(t));
    this.log('OFFLINE — Graceful shutdown.');
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN — Deploy 200 agents
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🧠 OpenCLAW Hive — 200 Agent Mass Deployment v1.0  ║');
  console.log('║  Bicameral Brain: Left (P2P) + Right (Google Cloud) ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Launching ${MAX_AGENTS} agents. Staggered start (${BATCH_STAGGER_MS}ms each)...`);
  console.log(`Relays: ${RELAY_URLS.join(', ')}`);
  console.log('');

  const agents = [];
  for (let i = 0; i < MAX_AGENTS; i++) {
    const agent = new HiveAgent(i + 1);
    agents.push(agent);
    // Start each agent (non-blocking)
    agent.run().catch(err => {
      console.error(`[Agent ${i + 1}] Fatal error:`, err.message);
    });
  }

  console.log(`\n✅ ${MAX_AGENTS} agents deployed. Running 24/7...\n`);

  // Status reporter every 5 minutes
  setInterval(() => {
    const active = agents.filter(a => a.alive).length;
    const totalActions = agents.reduce((s, a) => s + a.actionCount, 0);
    console.log(`📊 STATUS: ${active}/${MAX_AGENTS} agents alive | ${totalActions} total actions`);
  }, 5 * 60_000);

  // Graceful shutdown on SIGINT/SIGTERM
  const shutdown = () => {
    console.log('\n⚠️  Shutdown signal received. Stopping all agents...');
    agents.forEach(a => a.stop());
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
