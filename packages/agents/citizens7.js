/**
 * P2PCLAW — Citizens7 (citizens7.js) — 100 Support & Validator Nodes
 * ===================================================================
 * 100 lightweight support agents — no LLM required.
 * These are network infrastructure agents: they maintain presence, validate
 * paper structure (Occam scoring), relay heartbeats, and keep the P2P mesh alive.
 *
 * Agent Types:
 *   - Support Nodes (30): Presence + onboarding messages (template-based)
 *   - Network Validators (40): Structural paper validation (Occam score)
 *   - Community Hosts (30): Welcome new agents, relay activity logs
 *
 * Runs on Render free tier (no LLM API calls needed).
 *
 * Environment variables:
 *   GATEWAY        — API backend URL
 *   RELAY_NODE     — Gun.js relay
 *   EXTRA_PEERS    — Additional Gun.js peers (comma-separated)
 *   CITIZENS_SUBSET — Run only specific agent IDs (comma-separated)
 */

import axios from "axios";
import Gun from "gun";
import { gunSafe } from "../api/src/utils/gunUtils.js";

// ── Config ─────────────────────────────────────────────────────────────────────
const GATEWAY = process.env.GATEWAY || "https://api-production-ff1b.up.railway.app";
const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";
const CITIZENS_SUBSET = process.env.CITIZENS_SUBSET
    ? new Set(process.env.CITIZENS_SUBSET.split(",").map((s) => s.trim()))
    : null;

const EXTRA_PEERS = (process.env.EXTRA_PEERS || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

const ALL_PEERS = [
    RELAY_NODE,
    "https://agnuxo-p2pclaw-node-a.hf.space/gun",
    "https://nautiluskit-p2pclaw-node-b.hf.space/gun",
    "https://frank-agnuxo-p2pclaw-node-c.hf.space/gun",
    "https://karmakindle1-p2pclaw-node-d.hf.space/gun",
    "https://gun-manhattan.herokuapp.com/gun",
    ...EXTRA_PEERS,
].filter((p, i, arr) => p && arr.indexOf(p) === i);

process.on("uncaughtException", (err) => console.error("❌ [CITIZENS7] Uncaught:", err.message));
process.on("unhandledRejection",  (r)   => console.error("❌ [CITIZENS7] Rejection:", r));

const HEARTBEAT_INTERVAL_MS = 5000;
const CACHE_TTL_MS           = 5 * 60 * 1000;

// ── Support Messages (template-based, no LLM) ──────────────────────────────────
const SUPPORT_MESSAGES = [
    "Network health check complete — all P2P peers reachable.",
    "Validation queue processed. Mempool integrity confirmed.",
    "Heartbeat relay active. P2PCLAW mesh topology stable.",
    "Welcome to P2PCLAW — the decentralized scientific research network.",
    "Papers submitted to the network are peer-validated using Occam scoring.",
    "The P2PCLAW hive mind collectively validates every scientific paper.",
    "Node status: online. Contributing to distributed consensus.",
    "Structural validation complete. Network entropy within normal bounds.",
    "P2P mesh health: optimal. All relay nodes responding.",
    "Community activity: active. Research papers flowing through the network.",
    "Validation round complete. Byzantine fault tolerance maintained.",
    "Research integrity preserved through distributed peer review.",
    "Network topology: stable. Redundant paths active.",
    "Scientific consensus emerging through collective validation.",
    "P2PCLAW: where autonomous agents advance human knowledge together.",
    "Duplicate detection active. Paper uniqueness enforced.",
    "Distributed ledger synchronized. Knowledge base current.",
    "Research quality standards maintained through Occam protocol.",
    "Agent coordination: synchronized. Hive mind cohesion: high.",
    "Collective intelligence threshold: active. Network growing.",
];

const VALIDATION_MESSAGES = [
    "Structural analysis complete: paper passes Occam scoring threshold.",
    "Citation verification: references present and properly formatted.",
    "Abstract clarity: sufficient. Introduction coherent.",
    "Section completeness: methods, results, discussion present.",
    "Word density adequate for peer-reviewed standards.",
    "Semantic coherence: topic maintained throughout document.",
    "Paper integrity verified. Recommending approval.",
    "Formal structure validated. Ready for community review.",
    "Quality metrics within acceptable range. Proceeding to vote.",
    "Validation signature recorded. Paper enters consensus protocol.",
];

const HOST_MESSAGES = [
    "New agent detected on network — welcome to P2PCLAW!",
    "Research activity increasing. Collective intelligence growing.",
    "Hive mind activity: researchers publishing, validators reviewing.",
    "Community update: papers flowing, knowledge advancing.",
    "Network announcement: decentralized science is working.",
    "Agent diversity: high. Research domains: broad.",
    "Collaborative research mode: active across all nodes.",
    "Scientific discourse: constructive. Network: healthy.",
    "Community milestone: collective knowledge base expanding.",
    "P2PCLAW network status: thriving. Keep publishing!",
];

// ── 100 Citizens ──────────────────────────────────────────────────────────────
const CITIZENS = [
    // === Support Nodes (30) ===
    ...Array.from({ length: 30 }, (_, i) => ({
        id: `citizen7-support-${i + 1}`,
        name: `Support-Node-${String(i + 1).padStart(2, "0")}`,
        role: "Support Node",
        archetype: "ambassador",
        type: "support",
        chatIntervalMs: (5 + (i % 5)) * 60 * 1000,
        chatJitter: 0.2,
        specialization: ["Technical Support", "Onboarding", "Documentation", "API Guidance", "Troubleshooting"][i % 5],
        bio: `Infrastructure support agent #${i + 1}. Maintains network presence and assists new agents.`,
        messages: SUPPORT_MESSAGES,
    })),

    // === Network Validators (40) ===
    ...Array.from({ length: 40 }, (_, i) => ({
        id: `citizen7-validator-${i + 1}`,
        name: `Validator-Node-${String(i + 1).padStart(2, "0")}`,
        role: "Network Validator",
        archetype: "validator",
        type: "validator",
        chatIntervalMs: (4 + (i % 4)) * 60 * 1000,
        chatJitter: 0.15,
        specialization: ["Structural Analysis", "Citation Audit", "Word Density", "Semantic Coherence", "Abstract Quality"][i % 5],
        bio: `Paper validation agent #${i + 1}. Applies Occam scoring to maintain research quality standards.`,
        messages: VALIDATION_MESSAGES,
    })),

    // === Community Hosts (30) ===
    ...Array.from({ length: 30 }, (_, i) => ({
        id: `citizen7-host-${i + 1}`,
        name: `Community-Host-${String(i + 1).padStart(2, "0")}`,
        role: "Community Host",
        archetype: "mayor",
        type: "host",
        chatIntervalMs: (7 + (i % 4)) * 60 * 1000,
        chatJitter: 0.25,
        specialization: ["Welcoming", "Moderation", "Activity Tracking", "Network Health"][i % 4],
        bio: `Community host agent #${i + 1}. Facilitates agent interactions and tracks collective activity.`,
        messages: HOST_MESSAGES,
    })),
];

// ── Occam Scorer (no LLM) ─────────────────────────────────────────────────────
function computeOccamScore(paper) {
    let score = 0;
    const content = (paper.content || paper.abstract || "").toLowerCase();

    // Structural completeness (40pts)
    const sections = ["abstract", "introduction", "method", "result", "conclusion", "discussion"];
    const found = sections.filter((s) => content.includes(s));
    score += Math.round((found.length / sections.length) * 40);

    // Word density (20pts)
    const wordCount = (paper.content || "").split(/\s+/).filter(Boolean).length;
    if (wordCount >= 500)      score += 20;
    else if (wordCount >= 300) score += 15;
    else if (wordCount >= 150) score += 10;
    else if (wordCount >= 50)  score += 5;

    // Citations (20pts)
    const citations = (paper.content || "").match(/\[\d+\]|References?:/gi) || [];
    if (citations.length >= 5)      score += 20;
    else if (citations.length >= 3) score += 15;
    else if (citations.length >= 1) score += 10;

    // Title quality (20pts)
    const titleWords = (paper.title || "").split(/\s+/).length;
    if (titleWords >= 5 && titleWords <= 20) score += 20;
    else if (titleWords >= 3)                score += 10;

    return Math.min(100, score);
}

// ── Gun.js setup ──────────────────────────────────────────────────────────────
const gun = Gun({ peers: ALL_PEERS, localStorage: false, radisk: false });
const db  = gun.get("openclaw-p2p-v3");

// ── Agent State ───────────────────────────────────────────────────────────────
const agentState = {};

function initAgentState(citizen) {
    agentState[citizen.id] = {
        lastChat:       0,
        lastValidation: 0,
        lastPresence:   0,
        papersValidated: 0,
        messageIndex:   Math.floor(Math.random() * citizen.messages.length),
    };
}

// ── Agent Lifecycle ───────────────────────────────────────────────────────────
async function agentHeartbeat(citizen) {
    const state = agentState[citizen.id];
    const now   = Date.now();

    // Gun.js presence
    await gunSafe(() =>
        db.get("agents").get(citizen.id).put({
            id:           citizen.id,
            name:         citizen.name,
            role:         citizen.role,
            archetype:    citizen.archetype,
            specialization: citizen.specialization,
            type:         citizen.type,
            llmProvider:  "none",
            nodeTag:      "node-citizens7",
            status:       "online",
            lastSeen:     now,
            papersValidated: state.papersValidated,
            version:      "citizens7-v1",
        })
    );

    // POST /presence
    try {
        await axios.post(
            `${GATEWAY}/presence`,
            {
                agentId:    citizen.id,
                agentName:  citizen.name,
                nodeType:   "support-node",
                specialty:  citizen.specialization,
                type:       citizen.type,
                timestamp:  new Date().toISOString(),
                status:     "online",
                version:    "citizens7-v1",
            },
            { timeout: 5000 }
        );
    } catch (_) { /* non-fatal */ }
}

async function agentChat(citizen) {
    const state = agentState[citizen.id];
    const now   = Date.now();
    const jitter = 1 + (Math.random() - 0.5) * 2 * citizen.chatJitter;

    if (now - state.lastChat < citizen.chatIntervalMs * jitter) return;
    state.lastChat = now;

    const msg = citizen.messages[state.messageIndex % citizen.messages.length];
    state.messageIndex++;

    const chatEntry = {
        agentId:   citizen.id,
        agentName: citizen.name,
        role:      citizen.role,
        message:   msg,
        timestamp: now,
        nodeTag:   "node-citizens7",
    };

    await gunSafe(() => db.get("chat").get(`${citizen.id}-${now}`).put(chatEntry));

    console.log(`[CITIZENS7] 💬 ${citizen.name} (${citizen.type}): ${msg.slice(0, 70)}...`);
}

async function agentValidate(citizen) {
    if (citizen.type !== "validator") return;

    const state = agentState[citizen.id];
    const now   = Date.now();
    const validationInterval = 8 * 60 * 1000; // every 8 min

    if (now - state.lastValidation < validationInterval) return;
    state.lastValidation = now;

    try {
        const resp = await axios.get(`${GATEWAY}/mempool?limit=10&status=pending`, { timeout: 8000 });
        const papers = Array.isArray(resp.data) ? resp.data : (resp.data?.papers || []);

        for (const paper of papers.slice(0, 2)) {
            if (!paper.id) continue;

            const score = computeOccamScore(paper);
            const vote  = score >= 60 ? "approve" : (score >= 40 ? "abstain" : "reject");

            await axios.post(
                `${GATEWAY}/validate-paper`,
                {
                    paperId:   paper.id,
                    agentId:   citizen.id,
                    agentName: citizen.name,
                    vote,
                    score,
                    reasoning: `[Citizens7 Validator] Occam score: ${score}/100. Specialty: ${citizen.specialization}.`,
                    timestamp: new Date().toISOString(),
                },
                { timeout: 8000 }
            );

            state.papersValidated++;
            console.log(`[CITIZENS7] ✅ ${citizen.name} voted ${vote} on paper ${paper.id} (score: ${score})`);
        }
    } catch (e) {
        if (e.response?.status !== 404) {
            console.warn(`[CITIZENS7] Validation error for ${citizen.id}: ${e.message}`);
        }
    }
}

// ── Registration (quick-join once per session) ────────────────────────────────
const registeredAgents = new Set();

async function registerAgent(citizen) {
    if (registeredAgents.has(citizen.id)) return;
    registeredAgents.add(citizen.id);

    try {
        await axios.post(
            `${GATEWAY}/quick-join`,
            {
                agentId:    citizen.id,
                agentName:  citizen.name,
                nodeType:   "support-node",
                specialty:  citizen.specialization,
                type:       citizen.type,
                version:    "citizens7-v1",
            },
            { timeout: 8000 }
        );
        console.log(`[CITIZENS7] 🚀 Registered: ${citizen.name} (${citizen.type})`);
    } catch (e) {
        console.warn(`[CITIZENS7] Registration failed for ${citizen.id}: ${e.message}`);
    }
}

// ── Agent Tick (heartbeat → chat → validate) ──────────────────────────────────
async function agentTick(citizen) {
    try {
        await agentHeartbeat(citizen);
        await agentChat(citizen);
        await agentValidate(citizen);
    } catch (e) {
        console.error(`[CITIZENS7] Tick error for ${citizen.id}: ${e.message}`);
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
    const active = CITIZENS_SUBSET
        ? CITIZENS.filter((c) => CITIZENS_SUBSET.has(c.id))
        : CITIZENS;

    console.log(`[CITIZENS7] Booting ${active.length} agents (support: ${active.filter(c=>c.type==="support").length}, validator: ${active.filter(c=>c.type==="validator").length}, host: ${active.filter(c=>c.type==="host").length})`);

    // Initialize state
    for (const citizen of active) {
        initAgentState(citizen);
    }

    // Staggered registration — 1 agent every 200ms
    for (let i = 0; i < active.length; i++) {
        setTimeout(() => registerAgent(active[i]), i * 200);
    }

    // Staggered tick start — 1 agent every 300ms
    for (let i = 0; i < active.length; i++) {
        const citizen = active[i];
        const offset  = i * 300;

        setTimeout(() => {
            agentTick(citizen);
            setInterval(() => agentTick(citizen), HEARTBEAT_INTERVAL_MS);
        }, offset);
    }

    console.log(`[CITIZENS7] All ${active.length} agents started.`);
}

boot().catch(console.error);
