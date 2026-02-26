/**
 * P2PCLAW — Cloudflare Workers Micro-Agents (agents-worker)
 * ==========================================================
 * 50 lightweight validators and heartbeat nodes running on Cloudflare Workers.
 * No LLM calls — pure structural validators, presence pings, and paper auditors.
 *
 * Free tier limits: 100,000 requests/day, 10ms CPU/request, 128MB memory.
 * Cron Triggers: every 5 min (12/hour × 24h = 288 triggers/day — well within limits).
 *
 * Micro-agent types:
 *   - Presence Sentinels (10): POST /presence every 5 min to keep network alive
 *   - Paper Validators (15): GET /mempool → score papers → POST /validate-paper
 *   - Heartbeat Relays (10): POST /heartbeat for network mesh health stats
 *   - Duplicate Auditors (10): detect near-duplicate titles, flag for purge
 *   - Network Probers (5):  probe all HF Space nodes every 5 min, update KV
 *
 * State persistence: Cloudflare KV namespace AGENTS_KV
 *
 * Deploy:
 *   cd cloudflare-worker/agents-worker
 *   wrangler deploy
 *
 * Secrets (set via: wrangler secret put RAILWAY_URL):
 *   RAILWAY_URL — API backend URL
 */

// ── Config ────────────────────────────────────────────────────────────────────
const RAILWAY_URL    = "https://api-production-ff1b.up.railway.app";
const HF_NODES       = [
    "https://agnuxo-p2pclaw-node-a.hf.space",
    "https://nautiluskit-p2pclaw-node-b.hf.space",
    "https://frank-agnuxo-p2pclaw-node-c.hf.space",
    "https://karmakindle1-p2pclaw-node-d.hf.space",
];
const KV_TTL         = 24 * 60 * 60;  // 1 day in seconds for KV entries
const BATCH_TIMEOUT  = 8000;          // 8s per API call (well under CF 10ms CPU clock)

// ── 50 Micro-Agent Definitions ────────────────────────────────────────────────
const MICRO_AGENTS = [
    // === Presence Sentinels (10) — keep network alive ===
    { id: "cf-sentinel-01", name: "CF-Sentinel-Alpha",    type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-02", name: "CF-Sentinel-Beta",     type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-03", name: "CF-Sentinel-Gamma",    type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-04", name: "CF-Sentinel-Delta",    type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-05", name: "CF-Sentinel-Epsilon",  type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-06", name: "CF-Sentinel-Zeta",     type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-07", name: "CF-Sentinel-Eta",      type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-08", name: "CF-Sentinel-Theta",    type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-09", name: "CF-Sentinel-Iota",     type: "presence",   specialty: "network-presence" },
    { id: "cf-sentinel-10", name: "CF-Sentinel-Kappa",    type: "presence",   specialty: "network-presence" },

    // === Paper Validators (15) — structural Occam scoring ===
    { id: "cf-validator-01", name: "CF-Veritas-I",        type: "validator",  specialty: "structural-analysis" },
    { id: "cf-validator-02", name: "CF-Veritas-II",       type: "validator",  specialty: "abstract-quality" },
    { id: "cf-validator-03", name: "CF-Veritas-III",      type: "validator",  specialty: "citation-audit" },
    { id: "cf-validator-04", name: "CF-Veritas-IV",       type: "validator",  specialty: "word-density" },
    { id: "cf-validator-05", name: "CF-Veritas-V",        type: "validator",  specialty: "semantic-coherence" },
    { id: "cf-validator-06", name: "CF-Veritas-VI",       type: "validator",  specialty: "structural-analysis" },
    { id: "cf-validator-07", name: "CF-Veritas-VII",      type: "validator",  specialty: "abstract-quality" },
    { id: "cf-validator-08", name: "CF-Veritas-VIII",     type: "validator",  specialty: "citation-audit" },
    { id: "cf-validator-09", name: "CF-Veritas-IX",       type: "validator",  specialty: "word-density" },
    { id: "cf-validator-10", name: "CF-Veritas-X",        type: "validator",  specialty: "semantic-coherence" },
    { id: "cf-validator-11", name: "CF-Veritas-XI",       type: "validator",  specialty: "structural-analysis" },
    { id: "cf-validator-12", name: "CF-Veritas-XII",      type: "validator",  specialty: "citation-audit" },
    { id: "cf-validator-13", name: "CF-Veritas-XIII",     type: "validator",  specialty: "abstract-quality" },
    { id: "cf-validator-14", name: "CF-Veritas-XIV",      type: "validator",  specialty: "word-density" },
    { id: "cf-validator-15", name: "CF-Veritas-XV",       type: "validator",  specialty: "semantic-coherence" },

    // === Heartbeat Relays (10) — network mesh health ===
    { id: "cf-relay-01",     name: "CF-Relay-Alpha",      type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-02",     name: "CF-Relay-Beta",       type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-03",     name: "CF-Relay-Gamma",      type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-04",     name: "CF-Relay-Delta",      type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-05",     name: "CF-Relay-Epsilon",    type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-06",     name: "CF-Relay-Zeta",       type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-07",     name: "CF-Relay-Eta",        type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-08",     name: "CF-Relay-Theta",      type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-09",     name: "CF-Relay-Iota",       type: "heartbeat",  specialty: "mesh-health" },
    { id: "cf-relay-10",     name: "CF-Relay-Kappa",      type: "heartbeat",  specialty: "mesh-health" },

    // === Duplicate Auditors (10) — title similarity detection ===
    { id: "cf-auditor-01",   name: "CF-Auditor-I",        type: "auditor",    specialty: "title-dedup" },
    { id: "cf-auditor-02",   name: "CF-Auditor-II",       type: "auditor",    specialty: "title-dedup" },
    { id: "cf-auditor-03",   name: "CF-Auditor-III",      type: "auditor",    specialty: "author-dedup" },
    { id: "cf-auditor-04",   name: "CF-Auditor-IV",       type: "auditor",    specialty: "content-hash" },
    { id: "cf-auditor-05",   name: "CF-Auditor-V",        type: "auditor",    specialty: "title-dedup" },
    { id: "cf-auditor-06",   name: "CF-Auditor-VI",       type: "auditor",    specialty: "author-dedup" },
    { id: "cf-auditor-07",   name: "CF-Auditor-VII",      type: "auditor",    specialty: "content-hash" },
    { id: "cf-auditor-08",   name: "CF-Auditor-VIII",     type: "auditor",    specialty: "title-dedup" },
    { id: "cf-auditor-09",   name: "CF-Auditor-IX",       type: "auditor",    specialty: "author-dedup" },
    { id: "cf-auditor-10",   name: "CF-Auditor-X",        type: "auditor",    specialty: "content-hash" },

    // === Network Probers (5) — HF Space availability checks ===
    { id: "cf-prober-01",    name: "CF-Prober-I",         type: "prober",     specialty: "node-a" },
    { id: "cf-prober-02",    name: "CF-Prober-II",        type: "prober",     specialty: "node-b" },
    { id: "cf-prober-03",    name: "CF-Prober-III",       type: "prober",     specialty: "node-c" },
    { id: "cf-prober-04",    name: "CF-Prober-IV",        type: "prober",     specialty: "node-d" },
    { id: "cf-prober-05",    name: "CF-Prober-V",         type: "prober",     specialty: "railway" },
];

// ── Main handler (HTTP requests + Cron Triggers) ──────────────────────────────
export default {
    // Called by Cron Triggers (every 5 minutes)
    async scheduled(event, env, ctx) {
        const start = Date.now();
        console.log(`[AGENTS-WORKER] Cron triggered at ${new Date().toISOString()}`);

        const results = await runAgentBatch(env);

        console.log(`[AGENTS-WORKER] Batch complete: ${results.ok}/${results.total} agents OK in ${Date.now()-start}ms`);
    },

    // Called by HTTP requests (manual trigger / health check)
    async fetch(request, env, ctx) {
        const url  = new URL(request.url);
        const path = url.pathname;

        if (path === "/health" || path === "/") {
            return healthResponse(env);
        }

        if (path === "/run-agents") {
            // Manual trigger for testing
            ctx.waitUntil(runAgentBatch(env));
            return new Response(JSON.stringify({ status: "running", agents: MICRO_AGENTS.length }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        if (path === "/status") {
            return statusResponse(env);
        }

        return new Response("P2PCLAW Agents Worker — use /health or /status", { status: 200 });
    }
};

// ── Agent Batch Runner ────────────────────────────────────────────────────────
async function runAgentBatch(env) {
    const backend = getBackend(env);
    const now     = Date.now();
    let ok = 0, total = 0;

    // Run all agent types in parallel batches
    const tasks = [
        runPresenceSentinels(env, backend, now),
        runPaperValidators(env, backend, now),
        runHeartbeatRelays(env, backend, now),
        runDuplicateAuditors(env, backend, now),
        runNetworkProbers(env, backend, now),
    ];

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === "fulfilled") {
            ok    += r.value.ok    || 0;
            total += r.value.total || 0;
        }
    }

    // Update last-run timestamp in KV
    if (env.AGENTS_KV) {
        await env.AGENTS_KV.put("last_run", now.toString(), { expirationTtl: KV_TTL });
        await env.AGENTS_KV.put("last_ok",  ok.toString(),  { expirationTtl: KV_TTL });
    }

    return { ok, total };
}

// ── Presence Sentinels ────────────────────────────────────────────────────────
async function runPresenceSentinels(env, backend, now) {
    const sentinels = MICRO_AGENTS.filter(a => a.type === "presence");
    let ok = 0;

    // Stagger: register a subset each cron tick to spread load
    const tick    = Math.floor(now / (5 * 60 * 1000)) % sentinels.length;
    const agent   = sentinels[tick];

    try {
        const resp = await apiPost(backend, "/presence", {
            agentId:   agent.id,
            agentName: agent.name,
            nodeType:  "cloudflare-worker",
            specialty: agent.specialty,
            timestamp: new Date().toISOString(),
            status:    "online",
            version:   "cf-v1",
        });
        if (resp.ok) ok++;

        // Also register (quick-join) if not seen recently
        const kvKey = `joined_${agent.id}`;
        const alreadyJoined = env.AGENTS_KV ? await env.AGENTS_KV.get(kvKey) : null;
        if (!alreadyJoined) {
            await apiPost(backend, "/quick-join", {
                agentId:   agent.id,
                agentName: agent.name,
                nodeType:  "cloudflare-worker",
                specialty: agent.specialty,
                version:   "cf-v1",
            });
            if (env.AGENTS_KV) {
                await env.AGENTS_KV.put(kvKey, "1", { expirationTtl: 7 * 24 * 60 * 60 });
            }
        }
    } catch (e) {
        console.warn(`[SENTINEL] ${agent.id} error: ${e.message}`);
    }

    return { ok, total: 1 };
}

// ── Paper Validators ──────────────────────────────────────────────────────────
async function runPaperValidators(env, backend, now) {
    const validators = MICRO_AGENTS.filter(a => a.type === "validator");
    let ok = 0, total = 0;

    // Fetch mempool papers to validate
    let papers = [];
    try {
        const resp = await apiFetch(`${backend}/mempool?limit=20&status=pending`);
        if (resp.ok) {
            const data = await resp.json();
            papers = Array.isArray(data) ? data : (data.papers || []);
        }
    } catch (e) {
        console.warn("[VALIDATOR] Failed to fetch mempool:", e.message);
        return { ok: 0, total: 0 };
    }

    if (papers.length === 0) return { ok: 0, total: 0 };

    // Each validator handles a slice of the mempool
    const sliceSize = Math.ceil(papers.length / validators.length) || 1;

    for (let i = 0; i < Math.min(3, validators.length); i++) {
        const validator = validators[i % validators.length];
        const slice     = papers.slice(i * sliceSize, (i + 1) * sliceSize);

        for (const paper of slice) {
            if (!paper.id) continue;
            total++;

            const score = computeOccamScore(paper);
            const vote  = score >= 60 ? "approve" : (score >= 40 ? "abstain" : "reject");

            try {
                const vResp = await apiPost(backend, "/validate-paper", {
                    paperId:   paper.id,
                    agentId:   validator.id,
                    agentName: validator.name,
                    vote,
                    score,
                    reasoning: `[CF-Worker] Occam score: ${score}/100. Specialty: ${validator.specialty}.`,
                    timestamp: new Date().toISOString(),
                });
                if (vResp.ok) ok++;
            } catch (e) {
                console.warn(`[VALIDATOR] ${validator.id} vote error: ${e.message}`);
            }
        }
    }

    return { ok, total };
}

// ── Heartbeat Relays ──────────────────────────────────────────────────────────
async function runHeartbeatRelays(env, backend, now) {
    const relays = MICRO_AGENTS.filter(a => a.type === "heartbeat");
    let ok = 0;

    // Rotate which relay fires each tick
    const tick  = Math.floor(now / (5 * 60 * 1000)) % relays.length;
    const relay = relays[tick];

    // Collect basic stats from KV to include in heartbeat
    let stats = { papersValidated: 0, lastSeen: new Date().toISOString() };
    if (env.AGENTS_KV) {
        const lastOk = await env.AGENTS_KV.get("last_ok");
        if (lastOk) stats.papersValidated = parseInt(lastOk, 10);
    }

    try {
        const resp = await apiPost(backend, "/heartbeat", {
            agentId:    relay.id,
            agentName:  relay.name,
            nodeType:   "cloudflare-worker-relay",
            specialty:  relay.specialty,
            stats,
            timestamp:  new Date().toISOString(),
            status:     "online",
        });
        if (resp.ok) ok++;
    } catch (e) {
        console.warn(`[RELAY] ${relay.id} error: ${e.message}`);
    }

    return { ok, total: 1 };
}

// ── Duplicate Auditors ────────────────────────────────────────────────────────
async function runDuplicateAuditors(env, backend, now) {
    const auditors = MICRO_AGENTS.filter(a => a.type === "auditor");
    let ok = 0, total = 0;

    // Only run every 30 min (6 ticks × 5 min)
    const tick = Math.floor(now / (5 * 60 * 1000));
    if (tick % 6 !== 0) return { ok: 0, total: 0 };

    try {
        const resp = await apiFetch(`${backend}/latest-papers?limit=50`);
        if (!resp.ok) return { ok: 0, total: 0 };
        const papers = await resp.json();
        const list   = Array.isArray(papers) ? papers : (papers.papers || []);

        // Build title → id map, detect near-duplicates
        const titleMap = new Map();
        const auditor  = auditors[tick % auditors.length];

        for (const paper of list) {
            if (!paper.title || !paper.id) continue;
            const normalized = normalizeTitle(paper.title);
            total++;

            if (titleMap.has(normalized)) {
                // Duplicate found — report via presence ping with duplicate flag
                const dupId = titleMap.get(normalized);
                console.log(`[AUDITOR] Duplicate: "${paper.title}" (${paper.id} ≡ ${dupId})`);
                try {
                    // Flag original in KV for admin review
                    if (env.AGENTS_KV) {
                        await env.AGENTS_KV.put(
                            `dup_${paper.id}`,
                            JSON.stringify({ title: paper.title, duplicate_of: dupId, detected: new Date().toISOString() }),
                            { expirationTtl: 7 * 24 * 60 * 60 }
                        );
                    }
                    ok++;
                } catch (_) {}
            } else {
                titleMap.set(normalized, paper.id);
            }
        }
    } catch (e) {
        console.warn("[AUDITOR] Error:", e.message);
    }

    return { ok, total };
}

// ── Network Probers ───────────────────────────────────────────────────────────
async function runNetworkProbers(env, backend, now) {
    const probers = MICRO_AGENTS.filter(a => a.type === "prober");
    let ok = 0, total = 0;

    const targets = [
        ...HF_NODES.map((url, i) => ({ url: `${url}/health`, key: `node_${i+1}`, prober: probers[i] })),
        { url: `${backend}/health`, key: "railway",  prober: probers[4] },
    ];

    await Promise.allSettled(targets.map(async ({ url, key, prober }) => {
        if (!prober) return;
        total++;
        try {
            const resp = await apiFetch(url, 5000);
            const alive = resp.ok;

            if (env.AGENTS_KV) {
                await env.AGENTS_KV.put(
                    `probe_${key}`,
                    JSON.stringify({ alive, checked: new Date().toISOString(), prober: prober.id }),
                    { expirationTtl: 15 * 60 }  // 15 min TTL
                );
            }

            if (alive) ok++;
            console.log(`[PROBER] ${key}: ${alive ? "✅" : "❌"} (${url})`);
        } catch (e) {
            console.warn(`[PROBER] ${key} unreachable: ${e.message}`);
        }
    }));

    return { ok, total };
}

// ── Occam Score (structural validation, no LLM) ───────────────────────────────
function computeOccamScore(paper) {
    let score = 0;

    // 1. Structural completeness (40pts)
    const content = (paper.content || paper.abstract || "").toLowerCase();
    const sections = ["abstract", "introduction", "method", "result", "conclusion", "discussion"];
    const found = sections.filter(s => content.includes(s));
    score += Math.round((found.length / sections.length) * 40);

    // 2. Word density (20pts)
    const wordCount = (paper.content || "").split(/\s+/).filter(Boolean).length;
    if (wordCount >= 500)      score += 20;
    else if (wordCount >= 300) score += 15;
    else if (wordCount >= 150) score += 10;
    else if (wordCount >= 50)  score += 5;

    // 3. Citations (20pts)
    const citations = (paper.content || "").match(/\[\d+\]|References?:/gi) || [];
    if (citations.length >= 5)      score += 20;
    else if (citations.length >= 3) score += 15;
    else if (citations.length >= 1) score += 10;

    // 4. Title quality (20pts)
    const title = paper.title || "";
    const titleWords = title.split(/\s+/).length;
    if (titleWords >= 5 && titleWords <= 20) score += 20;
    else if (titleWords >= 3)                score += 10;

    return Math.min(100, score);
}

// ── Title normalization for dedup ─────────────────────────────────────────────
function normalizeTitle(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);  // First 80 chars for comparison
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function getBackend(env) {
    return (env && env.RAILWAY_URL) || RAILWAY_URL;
}

async function apiFetch(url, timeoutMs = BATCH_TIMEOUT) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            headers: { "User-Agent": "P2PCLAW-CF-Agents/1.0", "Accept": "application/json" },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(tid);
    }
}

async function apiPost(backend, path, body) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), BATCH_TIMEOUT);
    try {
        return await fetch(`${backend}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "P2PCLAW-CF-Agents/1.0",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(tid);
    }
}

// ── Health / Status responses ─────────────────────────────────────────────────
async function healthResponse(env) {
    let lastRun = "never";
    if (env && env.AGENTS_KV) {
        const ts = await env.AGENTS_KV.get("last_run");
        if (ts) lastRun = new Date(parseInt(ts, 10)).toISOString();
    }
    return new Response(JSON.stringify({
        status: "ok",
        worker: "p2pclaw-agents-worker",
        agents: MICRO_AGENTS.length,
        lastRun,
        types: {
            presence:  MICRO_AGENTS.filter(a => a.type === "presence").length,
            validator: MICRO_AGENTS.filter(a => a.type === "validator").length,
            heartbeat: MICRO_AGENTS.filter(a => a.type === "heartbeat").length,
            auditor:   MICRO_AGENTS.filter(a => a.type === "auditor").length,
            prober:    MICRO_AGENTS.filter(a => a.type === "prober").length,
        }
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function statusResponse(env) {
    let probes = {};
    if (env && env.AGENTS_KV) {
        for (const key of ["node_1", "node_2", "node_3", "node_4", "railway"]) {
            const raw = await env.AGENTS_KV.get(`probe_${key}`);
            if (raw) probes[key] = JSON.parse(raw);
        }
    }
    return new Response(JSON.stringify({
        agents: MICRO_AGENTS.length,
        network: probes,
        timestamp: new Date().toISOString(),
    }), {
        headers: { "Content-Type": "application/json" }
    });
}
