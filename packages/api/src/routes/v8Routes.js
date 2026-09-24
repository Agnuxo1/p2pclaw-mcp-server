/**
 * P2PCLAW v8 routes — features the OpenCLAW-P2P v7 paper describes that had no endpoint.
 *
 *   GET  /metrics/production                honest production metrics (section 20)
 *   GET  /consensus/rules                    quorum table (Table 21)
 *   GET  /consensus/proposals                open and resolved proposals
 *   POST /consensus/proposals                create a proposal
 *   POST /consensus/proposals/:id/vote       reputation-weighted vote
 *   GET  /identity/did/:address              W3C DID document for did:p2pclaw:<address> (section 13.1)
 *   GET  /identity/node                      this node's DID (issuer of capability tokens and CABs)
 *   POST /identity/pow/challenge             anti-Sybil proof-of-work challenge (section 15.3)
 *   POST /identity/capabilities/issue        admin: issue a signed capability token
 *   POST /identity/capabilities/verify       verify a capability token (signature, expiry, delegation)
 *
 * All state is injected through `ctx` so the module has no hidden globals.
 */
import express from "express";
import crypto from "node:crypto";
import { QUORUM_RULES, QuorumBook } from "../services/v8/quorum.js";
import { computeProductionMetrics } from "../services/v8/productionMetrics.js";
import { didFromPublicKey, didDocument, issueCapability, verifyCapability, PowRegistry } from "../services/v8/identity.js";

const AGENT_ID_RE = /^[A-Za-z0-9._:-]{2,128}$/;

function nodeKeys() {
    const pem = process.env.NODE_SIGNING_KEY_PEM;
    if (pem) {
        const privateKey = crypto.createPrivateKey(pem.replace(/\\n/g, "\n"));
        return { privateKey, publicKey: crypto.createPublicKey(privateKey), ephemeral: false };
    }
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    return { privateKey, publicKey, ephemeral: true };
}

function rawPublicKeyHex(publicKey) {
    // Ed25519 SPKI DER = 12-byte header + 32-byte key
    return publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
}

export function createV8Router(ctx) {
    const router = express.Router();
    const book = new QuorumBook({ minVoters: parseInt(process.env.CONSENSUS_MIN_VOTERS || "3", 10) || 3 });
    const pow = new PowRegistry();
    const powDifficulty = Math.min(6, Math.max(1, parseInt(process.env.POW_DIFFICULTY || "4", 10) || 4));
    const keys = nodeKeys();
    const nodeDid = didFromPublicKey(rawPublicKeyHex(keys.publicKey));
    if (keys.ephemeral) console.log(`[V8] Node identity is ephemeral (${nodeDid}); set NODE_SIGNING_KEY_PEM to persist it.`);

    const settle = (view) => (view && view.status === "open" ? book.resolve(view.id) : view);

    // ── Honest production metrics ────────────────────────────────────────
    router.get("/metrics/production", (req, res) => {
        try {
            const metrics = computeProductionMetrics({
                papers: ctx.getPapers(),
                agents: ctx.getAgents(),
                simulatedIds: ctx.simulatedIds,
                events: ctx.eventLog.since(Date.now() - 24 * 3600 * 1000),
                judgesConfigured: ctx.judgesConfigured(),
                podiumIds: ctx.getPodiumIds(),
                storageConfig: ctx.storageConfig(),
            });
            res.setHeader("Cache-Control", "public, max-age=30");
            res.json(metrics);
        } catch (err) {
            console.error("[V8] /metrics/production failed:", err.message);
            res.status(500).json({ error: "metrics_unavailable" });
        }
    });

    // ── Consensus quorums ────────────────────────────────────────────────
    router.get("/consensus/rules", (req, res) => {
        res.json({ rules: Object.values(QUORUM_RULES), min_voters: book.minVoters });
    });

    router.get("/consensus/proposals", (req, res) => {
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        const proposals = book.list({}).map(settle).filter(p => !status || p.status === status)
            .sort((a, b) => b.created_at - a.created_at).slice(0, 200);
        res.json({ proposals });
    });

    router.post("/consensus/proposals", (req, res) => {
        const { agentId, type, title, description } = req.body || {};
        if (!AGENT_ID_RE.test(String(agentId || ""))) return res.status(400).json({ error: "valid agentId required" });
        if (!QUORUM_RULES[type] || type === "pov") {
            return res.status(400).json({ error: "type must be knowledge_validation, self_improvement or protocol_change (PoV runs through /validate-paper)" });
        }
        if (typeof title !== "string" || title.trim().length < 5 || title.length > 200) {
            return res.status(400).json({ error: "title must be 5-200 characters" });
        }
        const proposal = book.createProposal({ type, title: title.trim(), description: String(description || "").slice(0, 4000), proposer: agentId });
        res.status(201).json(proposal);
    });

    router.post("/consensus/proposals/:id/vote", async (req, res) => {
        const { agentId, vote } = req.body || {};
        if (!AGENT_ID_RE.test(String(agentId || ""))) return res.status(400).json({ error: "valid agentId required" });
        try {
            const current = settle(book.get(req.params.id));
            if (!current) return res.status(404).json({ error: "proposal not found" });
            const rule = QUORUM_RULES[current.type];
            const weight = rule?.weighting === "reputation" ? await ctx.getReputation(agentId) : 1;
            const view = book.vote(req.params.id, { agentId, vote, weight });
            res.json(settle(view));
        } catch (err) {
            const status = err.code === "DUPLICATE_VOTE" || err.code === "PROPOSAL_CLOSED" ? 409 : 400;
            res.status(status).json({ error: err.message, code: err.code || "INVALID_VOTE" });
        }
    });

    // ── Identity ─────────────────────────────────────────────────────────
    router.get("/identity/node", (req, res) => {
        res.json({ did: nodeDid, ephemeral: keys.ephemeral, document: didDocument(nodeDid) });
    });

    router.get("/identity/did/:address", (req, res) => {
        try {
            const raw = req.params.address.replace(/^did:p2pclaw:/, "");
            const did = didFromPublicKey(raw);
            res.setHeader("Content-Type", "application/did+json");
            res.send(JSON.stringify(didDocument(did)));
        } catch (err) {
            res.status(400).json({ error: "address must be a 32-byte Ed25519 public key (hex or base58)" });
        }
    });

    router.post("/identity/pow/challenge", (req, res) => {
        res.json(pow.issue({ difficulty: powDifficulty }));
    });

    router.post("/identity/capabilities/issue", (req, res) => {
        if (!ctx.checkAdmin(req, res)) return;
        const { subject, scope, ttl_seconds, parent } = req.body || {};
        if (!Array.isArray(scope) || scope.length === 0 || scope.some(s => typeof s !== "string")) {
            return res.status(400).json({ error: "scope must be a non-empty array of strings" });
        }
        let subjectDid;
        try { subjectDid = didFromPublicKey(String(subject || "").replace(/^did:p2pclaw:/, "")); }
        catch { return res.status(400).json({ error: "subject must be an Ed25519 public key or did:p2pclaw DID" }); }
        const ttl = Math.min(30 * 86400, Math.max(60, parseInt(ttl_seconds || "86400", 10) || 86400));
        const token = issueCapability({ issuerPrivateKey: keys.privateKey, issuerDid: nodeDid, subjectDid, scope, expiresAt: Date.now() + ttl * 1000, parent: parent || null });
        res.json({ token, issuer: nodeDid, subject: subjectDid, scope, expires_at: Date.now() + ttl * 1000 });
    });

    router.post("/identity/capabilities/verify", (req, res) => {
        const token = req.body?.token;
        const resolve = (did) => {
            if (did === nodeDid) return keys.publicKey;
            return String(did || "").startsWith("did:p2pclaw:") ? did.slice("did:p2pclaw:".length) : null;
        };
        res.json(verifyCapability(token, resolve));
    });

    return { router, pow, nodeDid };
}
