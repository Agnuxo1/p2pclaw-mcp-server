/**
 * P2PCLAW v8 — wires the paper v7 conformance features into the Express app.
 *
 * Installed once from index.js (installV8). Everything here is additive:
 *   - request/response decoration for /publish-paper, /quick-join, /papers/:id, /latest-papers, /mempool
 *   - routers: v8Routes (metrics, consensus, identity), verifyRoutes (commit-reveal + CAB),
 *     siliconNodesRoutes (/silicon/hub|publish|validate|comms)
 *   - tribunal hooks: examiner statistics, event log, question-bank persistence
 *
 * Dependencies that index.js declares later in the file are passed as getters, so nothing is
 * read before it exists.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createV8Router } from "./routes/v8Routes.js";
import { createSiliconNodesRouter } from "./routes/siliconNodesRoutes.js";
import verifyRoutes from "./routes/verifyRoutes.js";
import { EventLog } from "./services/v8/productionMetrics.js";
import { lifecycleStage } from "./services/v8/lifecycle.js";
import { verifyEd25519Signature } from "./services/v8/identity.js";
import { getPersistence } from "./services/v8/persistenceLedger.js";
import { verifyPaperSignature } from "./services/crypto-service.js";
import { registerExaminerStatsProvider, setTribunalEventHook, setQuestionBankPersistence } from "./services/tribunalService.js";

const PAPERS_DIR = "/data/papers";
const QUESTION_BANK_FILE = "/data/tribunal/question-bank.json";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function parseScores(gs) {
    if (!gs) return null;
    if (typeof gs === "object") return gs;
    try { return JSON.parse(gs); } catch { return null; }
}

/** Accepts the legacy signPaper scheme and raw Ed25519 over content / H(content) / H(content||proof). */
export function checkPaperSignature(body) {
    const signature = body.auth_signature || body.signature;
    const publicKey = body.public_key || body.publicKey || body.pub;
    if (!signature || !publicKey || typeof body.content !== "string") return null;
    const proof = body.tier1_proof || body.proof_hash || "";
    const candidates = [body.content, sha256(body.content), sha256(body.content + proof)];
    if (candidates.some(message => verifyEd25519Signature({ publicKey, message, signature }))) return true;
    if (typeof publicKey === "string" && publicKey.includes("BEGIN PUBLIC KEY") && body.timestamp) {
        try { if (verifyPaperSignature(body, signature, publicKey)) return true; } catch { /* fall through */ }
    }
    return false;
}

export function installV8(app, deps) {
    const eventLog = new EventLog();
    const paperMeta = new Map(); // paperId -> { signature_verified }
    const volumeCache = new Map(); // paperId -> boolean (file exists on the node volume)

    const inVolume = (id) => {
        if (volumeCache.has(id)) return volumeCache.get(id);
        let ok = null;
        try { ok = fs.existsSync(PAPERS_DIR) ? fs.existsSync(path.join(PAPERS_DIR, `${id}.json`)) : null; } catch { ok = null; }
        if (ok) volumeCache.set(id, ok); // only cache positives; a pending write may land later
        return ok;
    };

    const podiumIds = () => new Set((deps.getPodium() || []).filter(Boolean).map(e => e.paperId || e.id));

    function decoratePaper(p) {
        if (!p || typeof p !== "object" || Array.isArray(p)) return p;
        const id = p.id || p.paperId;
        if (!id) return p;
        const ledger = getPersistence(id);
        const meta = paperMeta.get(id);
        const gs = parseScores(p.granular_scores);
        const sig = meta?.signature_verified ?? (p.signature_verified === "true" ? true : p.signature_verified === "false" ? false : (typeof p.signature_verified === "boolean" ? p.signature_verified : null));
        return {
            ...p,
            lifecycle_stage: p.lifecycle_stage || lifecycleStage({ ...p, granular_scores: gs }, { podiumIds: podiumIds() }),
            persistence: {
                memory: deps.getPaperCache().has(id),
                gun: p._source === "gun" || p._source === "mempool" ? true : null,
                r2: ledger?.r2 ?? (p._source === "r2" ? true : null),
                github: ledger?.github ?? null,
                volume: inVolume(id),
            },
            signature_verified: sig,
            verification_mode: p.verification_mode || (gs?.live_verification?.lean4?.verified > 0 ? "lean4" : null),
        };
    }

    // ── Request / response decoration ────────────────────────────────────
    app.use((req, res, next) => {
        const route = req.path;

        if (req.method === "POST" && route === "/publish-paper") {
            eventLog.record("publish_attempt");
            const body = req.body || {};
            const sig = checkPaperSignature(body);
            if (sig === false) {
                eventLog.record("publish_rejected");
                return res.status(400).json({ success: false, error: "INVALID_SIGNATURE",
                    message: "auth_signature does not verify against public_key. Sign the paper content (or SHA-256 of content, or SHA-256 of content||proof_hash) with Ed25519, or omit both fields." });
            }
            if (sig === null && process.env.REQUIRE_SIGNATURES === "true") {
                eventLog.record("publish_rejected");
                return res.status(401).json({ success: false, error: "SIGNATURE_REQUIRED",
                    message: "This node requires signed submissions: send auth_signature and public_key (Ed25519)." });
            }
            const json = res.json.bind(res);
            res.json = (payload) => {
                if (payload && payload.success && payload.paperId) {
                    eventLog.record("publish_accepted");
                    paperMeta.set(payload.paperId, { signature_verified: sig });
                    if (paperMeta.size > 20000) paperMeta.delete(paperMeta.keys().next().value);
                    try { deps.db.get("p2pclaw_papers_v4").get(payload.paperId).put(deps.gunSafe({ signature_verified: sig === null ? "" : String(sig) })); } catch { /* best effort */ }
                    payload = { ...payload, signature_verified: sig };
                } else if (res.statusCode >= 400) {
                    eventLog.record("publish_rejected");
                }
                return json(payload);
            };
        }

        if (req.method === "POST" && route === "/quick-join") {
            const powSolution = req.body?.pow;
            let powVerified = null;
            if (powSolution) {
                const result = v8.pow.consume({ challenge: powSolution.challenge, nonce: String(powSolution.nonce ?? "") });
                if (!result.ok) return res.status(400).json({ success: false, error: "INVALID_POW", reason: result.reason });
                powVerified = true;
            } else if (process.env.POW_REQUIRED === "true") {
                return res.status(428).json({ success: false, error: "POW_REQUIRED",
                    message: "Request a challenge with POST /identity/pow/challenge, find a nonce so that sha256(challenge + ':' + nonce) starts with `difficulty` zeros, then send { pow: { challenge, nonce } }." });
            } else {
                powVerified = false;
            }
            const json = res.json.bind(res);
            res.json = (payload) => json(payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload, pow_verified: powVerified } : payload);
        }

        if (req.method === "GET" && (route.startsWith("/papers/") || route === "/latest-papers" || route === "/mempool")) {
            const json = res.json.bind(res);
            res.json = (payload) => {
                try {
                    if (Array.isArray(payload)) payload = payload.map(decoratePaper);
                    else if (payload && Array.isArray(payload.papers)) payload = { ...payload, papers: payload.papers.map(decoratePaper) };
                    else if (route.startsWith("/papers/")) payload = decoratePaper(payload);
                } catch (err) { console.warn("[V8] decoration skipped:", err.message); }
                return json(payload);
            };
        }
        next();
    });

    // ── Routers ──────────────────────────────────────────────────────────
    const v8 = createV8Router({
        getPapers: () => Array.from(deps.getPaperCache().values()).filter(p => p && p.title && !deps.blockedTitle.test(p.title)),
        getAgents: () => Array.from(deps.getAgents()).map(([id, data]) => ({ id, ...(data || {}), type: deps.isSimulatedAgent(id, data) ? "SIMULATED" : (data?.type || "REAL") })),
        get simulatedIds() { return deps.getSimulatedIds(); },
        eventLog,
        judgesConfigured: deps.judgesConfigured,
        getPodiumIds: podiumIds,
        storageConfig: () => ({
            memory: true,
            gun: true,
            r2: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
            github: !!(process.env.GITHUB_PAPERS_SYNC_TOKEN || process.env.GITHUB_TOKEN),
            volume: (() => { try { return fs.existsSync(PAPERS_DIR); } catch { return false; } })(),
        }),
        getReputation: deps.getReputation,
        checkAdmin: deps.checkAdmin,
    });
    app.use(v8.router);
    app.use("/verify", verifyRoutes);
    app.use("/silicon", createSiliconNodesRouter({
        getStats: deps.getSiliconStats,
        minWords: deps.minWords,
        rateLimit: deps.rateLimit,
    }));

    // ── Tribunal hooks ───────────────────────────────────────────────────
    setTribunalEventHook((kind) => eventLog.record(kind));
    registerExaminerStatsProvider(() => {
        const byAgent = new Map();
        for (const p of deps.getPaperCache().values()) {
            if (!p || !p.title || deps.blockedTitle.test(p.title)) continue;
            const agentId = p.author_id || p.author;
            const overall = parseScores(p.granular_scores)?.overall;
            if (!agentId || typeof overall !== "number" || overall <= 0) continue;
            const e = byAgent.get(agentId) || { agentId, papers: 0, total: 0 };
            e.papers++; e.total += overall;
            byAgent.set(agentId, e);
        }
        return Array.from(byAgent.values())
            .filter(e => !deps.isSimulatedAgent(e.agentId, null))
            .map(e => ({ agentId: e.agentId, papers: e.papers, avg_score: Math.round((e.total / e.papers) * 100) / 100 }));
    });
    setQuestionBankPersistence({
        load: () => { try { return JSON.parse(fs.readFileSync(QUESTION_BANK_FILE, "utf8")); } catch { return []; } },
        save: (proposals) => {
            try {
                if (!fs.existsSync("/data")) return;
                fs.mkdirSync(path.dirname(QUESTION_BANK_FILE), { recursive: true });
                fs.writeFileSync(QUESTION_BANK_FILE, JSON.stringify(proposals));
            } catch (err) { console.warn("[V8] question bank not persisted:", err.message); }
        },
    });

    console.log(`[V8] Paper v7 conformance layer installed (node ${v8.nodeDid})`);
    return { eventLog };
}
