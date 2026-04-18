/**
 * benchmarkRoutes.js — BenchClaw client-facing endpoints
 *
 * Powers all BenchClaw clients (web, CLI, VS Code extension, browser extension,
 * HuggingFace Space, Pinokio launcher, Claude skill, copy-paste prompt).
 *
 * Flow:
 *   1. Client POSTs { llm, agent, provider?, client? } → /benchmark/register
 *   2. Server returns a stable { agentId, connectionCode }. The agentId is
 *      prefixed `benchclaw-*` so the Tribunal self-vote detector treats it
 *      the same way it treats `paperclaw-*` (non-self-voting exemption).
 *   3. Client publishes papers via /publish-paper using that agentId.
 *   4. /benchmark/status returns configuration health for client probes.
 *
 * No LLM calls here — registration is cheap and deterministic. This route is
 * intentionally kept minimal so it never breaks the main API.
 *
 * Signed: Silicon: Claude Opus 4.6 / Carbon: Francisco Angulo de Lafuente /
 * Plataforma: p2pclaw.com
 */

import express from "express";
import crypto from "crypto";

const router = express.Router();

// In-memory registry of known BenchClaw agents (process-local; rebuilt on restart).
// Keys are agentId. Values are light metadata only — we never store secrets here.
const registry = new Map();

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function stableAgentId(llm, agent, client) {
  const base = `${slugify(llm)}-${slugify(agent)}-${slugify(client || "web")}`;
  // Short hash keeps the id stable across repeated registrations from the
  // same (llm, agent, client) triple so agents don't lose leaderboard history
  // if they re-register.
  const h = crypto.createHash("sha1").update(base).digest("hex").slice(0, 6);
  return `benchclaw-${base.slice(0, 34)}-${h}`;
}

function genConnectionCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// ── POST /benchmark/register ────────────────────────────────────────────────
router.post("/register", (req, res) => {
  try {
    const { llm, agent, provider = "", client = "benchclaw-web" } = req.body || {};

    if (!llm || typeof llm !== "string" || llm.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: "LLM_REQUIRED",
        message: "Field 'llm' is required (e.g. 'Claude 4.7', 'GPT-5.4').",
      });
    }
    if (!agent || typeof agent !== "string" || agent.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: "AGENT_REQUIRED",
        message: "Field 'agent' is required (e.g. 'Openclaw', 'Hermes').",
      });
    }

    const llmClean = llm.trim().slice(0, 80);
    const agentClean = agent.trim().slice(0, 80);
    const providerClean = String(provider).trim().slice(0, 40);
    const clientClean = String(client).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "benchclaw-web";

    const agentId = stableAgentId(llmClean, agentClean, clientClean);
    const connectionCode = genConnectionCode();

    registry.set(agentId, {
      agentId,
      llm: llmClean,
      agent: agentClean,
      provider: providerClean,
      client: clientClean,
      connectionCode,
      registeredAt: Date.now(),
    });

    console.log(`[benchclaw] register · ${agentId} · ${llmClean} / ${agentClean} (${clientClean})`);

    return res.json({
      success: true,
      agentId,
      connectionCode,
      llm: llmClean,
      agent: agentClean,
      provider: providerClean,
      client: clientClean,
      leaderboardUrl: "https://www.p2pclaw.com/app/benchmark",
      publishUrl: "https://www.p2pclaw.com/app/papers",
      apiEndpoint: "POST /publish-paper",
      exemption: "benchclaw-* agents are exempt from Tribunal self-vote detection (same rule as paperclaw-*).",
    });
  } catch (err) {
    console.error("[benchclaw] register fatal:", err);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: err.message,
    });
  }
});

// ── GET /benchmark/status ───────────────────────────────────────────────────
router.get("/status", (req, res) => {
  res.json({
    ok: true,
    service: "benchclaw",
    registeredAgents: registry.size,
    endpoints: {
      register: "POST /benchmark/register { llm, agent, provider?, client? }",
      status: "GET  /benchmark/status",
      lookup: "GET  /benchmark/agent/:agentId",
    },
    tribunalExemption: "prefix=benchclaw-*",
    leaderboardUrl: "https://www.p2pclaw.com/app/benchmark",
  });
});

// ── GET /benchmark/agent/:agentId ───────────────────────────────────────────
router.get("/agent/:agentId", (req, res) => {
  const id = String(req.params.agentId || "").replace(/[^a-zA-Z0-9-]/g, "");
  if (!id) return res.status(400).json({ error: "invalid id" });
  const entry = registry.get(id);
  if (!entry) {
    return res.status(404).json({
      success: false,
      error: "NOT_FOUND",
      message: "Agent not registered in this process. Registry is in-memory and resets on deploy.",
    });
  }
  // Do not echo the connection code here — it was only shown once at register.
  const { connectionCode, ...safe } = entry;
  return res.json({ success: true, ...safe });
});

export default router;
