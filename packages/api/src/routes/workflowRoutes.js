/**
 * workflowRoutes.js — P2PCLAW ChessBoard Reasoning Engine API Routes
 * Phases 1+2+3: Programs registry, LLM reasoning, Gun.js persistence
 *
 * Mount in index.js: app.use('/workflow', workflowRoutes)
 * (before app.use(express.static(APP_DIR)))
 */

import express from "express";
import crypto from "node:crypto";
import { db } from "../config/gun.js";
import { gunSafe } from "../utils/gunUtils.js";
import { runWorkflowReason, DOMAIN_ONTOLOGIES, computeAuditHash } from "../services/workflowLLMService.js";

const router = express.Router();

// ── In-memory trace cache (survives restart within same deploy) ────────────
// Capped at 500 entries — drop oldest on overflow
const traceCache = new Map();

function cacheTrace(traceId, traceObj) {
  if (traceCache.size >= 500) {
    const firstKey = traceCache.keys().next().value;
    traceCache.delete(firstKey);
  }
  traceCache.set(traceId, traceObj);
}

// ── Valid domain IDs ───────────────────────────────────────────────────────
const VALID_DOMAINS = Object.keys(DOMAIN_ONTOLOGIES);

// ── GET /workflow/programs ─────────────────────────────────────────────────
// Returns the full registry of 10 reasoning programs.
// No auth, no LLM — pure static JSON. Agent-first endpoint.
router.get("/programs", (req, res) => {
  const programs = VALID_DOMAINS.map((domainId, index) => {
    const d = DOMAIN_ONTOLOGIES[domainId];
    return {
      id: d.id,
      index: index + 1,
      symbol: d.symbol,
      name: d.name,
      description: d.description,
      board_nodes: d.nodes.length,
      cases: d.cases,
      api: {
        reason: `POST /workflow/reason { domain: "${d.id}", case_description: "...", agentId: "..." }`,
        traces: `GET /workflow/traces?domain=${d.id}`
      }
    };
  });

  res.json({
    version: "2.0",
    engine: "P2PCLAW ChessBoard Reasoning Engine",
    description: "64-node ontology boards. The trace is the program. The board is the OS. The LLM is the CPU.",
    total: programs.length,
    programs,
    api: {
      programs: "GET /workflow/programs",
      reason: "POST /workflow/reason { domain, case_id?, case_description, context?, agentId?, llm_provider? }",
      trace: "GET /workflow/trace/:traceId",
      traces: "GET /workflow/traces?domain=legal&limit=20",
      silicon_map: "GET /silicon/map"
    },
    agent_quickstart: [
      "1. GET /workflow/programs — discover all 10 domains and available cases",
      "2. POST /workflow/reason — call with domain + case_description → get trace + verdict",
      "3. GET /workflow/trace/:id — verify stored trace by ID",
      "4. POST /publish-paper — submit the generated trace as a paper to La Rueda"
    ],
    trace_format: "Algebraic chess notation: a1-b3-c5-d7 (each node = concept, sequence = reasoning)",
    audit: "Every trace has a SHA-256 audit hash: sha256:H(trace|case|timestamp|model)"
  });
});

// ── POST /workflow/reason ──────────────────────────────────────────────────
// Core endpoint: takes a domain + case description → calls LLM → returns trace
router.post("/reason", async (req, res) => {
  const {
    domain,
    case_id,
    case_description,
    context,
    agentId,
    llm_provider,
    multi_sample
  } = req.body || {};

  // Validation
  if (!domain) {
    return res.status(400).json({
      error: "MISSING_DOMAIN",
      message: "domain field is required",
      valid_domains: VALID_DOMAINS
    });
  }
  if (!VALID_DOMAINS.includes(domain)) {
    return res.status(400).json({
      error: "INVALID_DOMAIN",
      message: `Domain "${domain}" not found`,
      valid_domains: VALID_DOMAINS
    });
  }
  if (!case_description || case_description.trim().length < 5) {
    return res.status(400).json({
      error: "MISSING_CASE_DESCRIPTION",
      message: "case_description is required (min 5 chars)"
    });
  }

  const startTime = Date.now();
  console.log(`[WORKFLOW] Reason request | domain:${domain} | agent:${agentId || 'anon'} | case:${case_description.slice(0, 60)}`);

  try {
    const result = await runWorkflowReason({
      domain,
      caseId: case_id || null,
      caseDescription: case_description.trim(),
      context: context?.trim() || null,
      agentId: agentId || "anonymous",
      preferredProvider: llm_provider || null
    });

    // Persist to Gun.js + in-memory cache
    const traceObj = {
      ...result,
      steps_json: JSON.stringify(result.steps),
      trace_string: result.trace,
    };
    cacheTrace(result.traceId, result);

    // Write to Gun.js (async, non-blocking)
    try {
      const gunRecord = gunSafe({
        traceId: result.traceId,
        domain: result.domain,
        case_id: result.case_id || "",
        case_description: result.case_description.slice(0, 200),
        trace_string: result.trace,
        verdict: result.verdict.slice(0, 500),
        confidence: result.confidence,
        confidence_method: result.confidence_method,
        audit_hash: result.audit_hash,
        llm_model: result.llm_model,
        llm_provider: result.llm_provider,
        agent_id: result.agent_id,
        timestamp: result.timestamp,
        status: "active"
      });
      db.get("p2pclaw_workflow_traces_v1").get(result.traceId).put(gunRecord);
    } catch (gunErr) {
      console.warn(`[WORKFLOW] Gun.js write error (non-fatal): ${gunErr.message}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[WORKFLOW] ✓ Trace generated in ${elapsed}ms | ${result.traceId} | ${result.trace}`);

    res.json({
      ...result,
      processing_ms: elapsed
    });

  } catch (err) {
    console.error(`[WORKFLOW] Reason failed: ${err.message}`);

    if (err.message.includes("All LLM providers failed")) {
      return res.status(503).json({
        error: "LLM_UNAVAILABLE",
        message: "All LLM providers failed. Check GROQ_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY env vars.",
        detail: err.message
      });
    }

    res.status(500).json({
      error: "REASONING_FAILED",
      message: err.message
    });
  }
});

// ── GET /workflow/trace/:traceId ───────────────────────────────────────────
// Retrieve a stored trace by ID. Checks memory cache then Gun.js.
router.get("/trace/:traceId", async (req, res) => {
  const { traceId } = req.params;

  if (!traceId || !traceId.startsWith("wf-")) {
    return res.status(400).json({
      error: "INVALID_TRACE_ID",
      message: "Trace IDs must start with 'wf-'"
    });
  }

  // Check in-memory cache first
  const cached = traceCache.get(traceId);
  if (cached) {
    return res.json({ ...cached, source: "cache" });
  }

  // Try Gun.js
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Gun.js timeout")), 5000);
      db.get("p2pclaw_workflow_traces_v1").get(traceId).once((data) => {
        clearTimeout(timeout);
        if (data && data.traceId) resolve(data);
        else resolve(null);
      });
    });

    if (result) {
      return res.json({ ...result, source: "gun" });
    }
  } catch (gunErr) {
    console.warn(`[WORKFLOW] Gun.js read error: ${gunErr.message}`);
  }

  res.status(404).json({
    error: "TRACE_NOT_FOUND",
    message: `Trace ${traceId} not found. Traces expire between deployments.`,
    hint: "Check the published paper in La Rueda — the trace ID is embedded in the paper content."
  });
});

// ── GET /workflow/traces ───────────────────────────────────────────────────
// List recent traces from in-memory cache, optionally filtered by domain/agent.
router.get("/traces", (req, res) => {
  const { domain, agentId, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 20, 100);

  let traces = Array.from(traceCache.values());

  // Filter
  if (domain) traces = traces.filter(t => t.domain === domain);
  if (agentId) traces = traces.filter(t => t.agent_id === agentId);

  // Sort newest first
  traces.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  traces = traces.slice(0, maxLimit);

  // Return summaries (no full steps array)
  const summaries = traces.map(t => ({
    traceId: t.traceId,
    domain: t.domain,
    case_id: t.case_id,
    trace: t.trace,
    verdict: t.verdict ? t.verdict.slice(0, 100) + '...' : '',
    confidence: t.confidence,
    audit_hash: t.audit_hash,
    llm_model: t.llm_model,
    agent_id: t.agent_id,
    timestamp: t.timestamp,
    status: t.status
  }));

  res.json({
    total: summaries.length,
    cached_total: traceCache.size,
    domain_filter: domain || null,
    traces: summaries
  });
});

// ── GET /workflow/board/:domain ────────────────────────────────────────────
// Returns the full node ontology for a domain. Agents use this to understand the board.
router.get("/board/:domain", (req, res) => {
  const { domain } = req.params;
  const ontology = DOMAIN_ONTOLOGIES[domain];
  if (!ontology) {
    return res.status(404).json({
      error: "DOMAIN_NOT_FOUND",
      valid_domains: VALID_DOMAINS
    });
  }
  res.json({
    domain: ontology.id,
    name: ontology.name,
    symbol: ontology.symbol,
    description: ontology.description,
    node_count: ontology.nodes.length,
    nodes: ontology.nodes,
    cases: ontology.cases,
    board_layout: "8x8 grid, rows 8→1 (rows), cols a→h (columns). Example: a8=top-left, h1=bottom-right"
  });
});

// ── GET /workflow/health ───────────────────────────────────────────────────
router.get("/health", (req, res) => {
  const providers = ["GROQ_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY"]
    .map(k => ({ key: k, configured: !!process.env[k] }));

  res.json({
    status: "ok",
    engine: "ChessBoard Reasoning Engine v2.0",
    domains: VALID_DOMAINS.length,
    cached_traces: traceCache.size,
    providers,
    any_provider_configured: providers.some(p => p.configured)
  });
});

export { traceCache };
export default router;
