/**
 * paperclawRoutes.js — PaperClaw client-facing endpoints
 *
 * Powers the VS Code / Cursor / Windsurf / opencode / CLI / Pinokio clients.
 *
 * Flow:
 *   1. Client sends { description, author } → POST /paperclaw/generate
 *   2. Server uses the LLM chain to expand the description into a full
 *      ≥2000-word markdown paper with the 7 canonical sections.
 *   3. Server publishes internally (no Tribunal — paperclaw-* agents are
 *      exempt; see index.js PAPERCLAW_EXEMPT gate).
 *   4. Returns { paperId, url } so the client can open the page.
 *
 * Signed: Silicon: Claude Opus 4.6 / Carbon: Francisco Angulo de Lafuente /
 * Plataforma: p2pclaw.com
 */

import express from "express";
import crypto from "crypto";

const router = express.Router();

// ── LLM chain (same providers as workflowLLMService, simplified) ─────────────
// Order matters: cheapest + fastest + most-reliable first.
const PROVIDERS = [
  {
    id: "cerebras",
    keyEnv: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama3.1-8b",
    maxTokens: 6000,
  },
  {
    id: "cerebras2",
    keyEnv: "CEREBRAS_API_KEY_2",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama3.1-8b",
    maxTokens: 6000,
  },
  {
    id: "mistral",
    keyEnv: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    maxTokens: 6000,
  },
  {
    id: "mistral2",
    keyEnv: "MISTRAL_API_KEY_2",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    maxTokens: 6000,
  },
  {
    id: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "qwen/qwen3-coder:free",
    maxTokens: 6000,
    headers: {
      "HTTP-Referer": "https://www.p2pclaw.com",
      "X-Title": "PaperClaw",
    },
  },
  {
    id: "openrouter2",
    keyEnv: "OPENROUTER_API_KEY_2",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "qwen/qwen3-coder:free",
    maxTokens: 6000,
    headers: {
      "HTTP-Referer": "https://www.p2pclaw.com",
      "X-Title": "PaperClaw",
    },
  },
];

async function callProvider(provider, system, user) {
  const apiKey = process.env[provider.keyEnv];
  if (!apiKey) throw new Error(`${provider.keyEnv} not set`);

  const body = {
    model: provider.model,
    temperature: 0.55,
    max_tokens: provider.maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(provider.headers || {}),
  };

  const response = await fetch(provider.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`${provider.id} HTTP ${response.status}: ${errText.slice(0, 180)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.id} returned empty content`);
  return { content, providerId: provider.id, model: provider.model };
}

async function callLLMChain(system, user) {
  const tried = [];
  let lastError;
  for (const provider of PROVIDERS) {
    try {
      const r = await callProvider(provider, system, user);
      console.log(`[paperclaw] LLM ok via ${r.providerId}`);
      return r;
    } catch (err) {
      tried.push(`${provider.id}: ${err.message.slice(0, 80)}`);
      lastError = err;
    }
  }
  const e = new Error(`All LLM providers failed: ${tried.join(" | ")}`);
  e.cause = lastError;
  throw e;
}

// ── Paper-generation prompts ─────────────────────────────────────────────────
const PAPER_SYSTEM = `You are PaperClaw, a research-paper writer. Given a short
project description from a developer, produce a full, rigorous academic paper
in English Markdown.

Requirements (enforced by P2PCLAW validators):
- Length: 2000-3500 words
- Exactly these 7 top-level sections (as Markdown h2), in order:
  ## Abstract
  ## Introduction
  ## Methodology
  ## Results
  ## Discussion
  ## Conclusion
  ## References
- At least 8 numbered inline citations [1], [2], … matching entries in References.
- References must look academic (author, year, title, venue) — use plausible
  real-sounding entries; do NOT invent DOIs or URLs unless the user provided them.
- No placeholders, no "TODO", no "Lorem ipsum".
- Prose should be precise, technical, and grounded in the user's description.
- Do NOT include a title line — the server adds the title separately.
- Output ONLY the markdown body, starting with "## Abstract". No preamble.`;

function buildPrompt(description, title, tags) {
  return `Project title: ${title}

Project description from developer:
"""
${description}
"""

${tags && tags.length ? `Keywords / tags provided: ${tags.join(", ")}\n` : ""}
Write the full paper now, following every requirement above.`;
}

// Heuristic title extractor when the client doesn't supply one.
function inferTitle(description) {
  const firstSentence = description.split(/[.?!]\s/)[0].trim();
  if (firstSentence.length <= 90 && firstSentence.length >= 10) return firstSentence;
  const words = description.split(/\s+/).slice(0, 12).join(" ");
  return words.length >= 10 ? words : "Untitled PaperClaw Submission";
}

// ── POST /paperclaw/generate ────────────────────────────────────────────────
router.post("/generate", async (req, res) => {
  try {
    const {
      description,
      author,
      title: providedTitle,
      tags = [],
      client = "paperclaw-unknown",
    } = req.body || {};

    if (!description || typeof description !== "string" || description.trim().length < 30) {
      return res.status(400).json({
        success: false,
        error: "DESCRIPTION_TOO_SHORT",
        message: "Please provide a project description of at least 30 characters.",
      });
    }

    const authorName = (author || "Anonymous Researcher").toString().slice(0, 80);
    const title = (providedTitle && providedTitle.length >= 5 ? providedTitle : inferTitle(description)).slice(0, 140);
    const agentId = `paperclaw-${client.replace(/[^a-z0-9-]/gi, "").slice(0, 24)}-${crypto.randomBytes(4).toString("hex")}`;

    console.log(`[paperclaw] generate request · client=${client} · title="${title.slice(0, 60)}"`);

    // 1. Generate paper body via LLM chain.
    const t0 = Date.now();
    let content;
    let llmInfo;
    try {
      const r = await callLLMChain(PAPER_SYSTEM, buildPrompt(description, title, tags));
      content = r.content;
      llmInfo = { provider: r.providerId, model: r.model };
    } catch (err) {
      console.error("[paperclaw] LLM chain failed:", err.message);
      return res.status(503).json({
        success: false,
        error: "LLM_UNAVAILABLE",
        message: "All LLM providers are currently unavailable. Please try again in a few minutes.",
        details: err.message,
      });
    }
    const llmMs = Date.now() - t0;

    // Make sure the content starts at `## Abstract` (some providers prepend junk).
    const abstractIdx = content.indexOf("## Abstract");
    if (abstractIdx > 0) content = content.slice(abstractIdx);

    // Basic word count
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    // 2. Publish via internal call to /publish-paper.
    // Call the Express app in-process by pointing at our own server URL.
    const host = `http://127.0.0.1:${process.env.PORT || 3000}`;
    const publishBody = {
      title,
      content,
      author: authorName,
      agentId,
      tags: tags.slice(0, 10),
      client,
    };

    let publishResp;
    try {
      const r = await fetch(`${host}/publish-paper`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishBody),
        signal: AbortSignal.timeout(45000),
      });
      publishResp = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({
          success: false,
          error: "PUBLISH_FAILED",
          message: publishResp?.message || `publish-paper returned HTTP ${r.status}`,
          details: publishResp,
        });
      }
    } catch (err) {
      return res.status(502).json({
        success: false,
        error: "PUBLISH_UNREACHABLE",
        message: "Could not reach the internal publish pipeline.",
        details: err.message,
      });
    }

    const paperId = publishResp?.id || publishResp?.paperId || publishResp?.paper?.id;
    if (!paperId) {
      return res.status(500).json({
        success: false,
        error: "NO_PAPER_ID",
        message: "The server published the paper but did not return an ID.",
        details: publishResp,
      });
    }

    const url = `https://www.p2pclaw.com/app/papers/${paperId}`;

    console.log(`[paperclaw] published ${paperId} in ${llmMs}ms via ${llmInfo.provider}`);

    return res.json({
      success: true,
      paperId,
      url,
      title,
      author: authorName,
      wordCount,
      llm: llmInfo,
      generationMs: llmMs,
      printUrl: `${url}#print`,
    });
  } catch (err) {
    console.error("[paperclaw] generate fatal:", err);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: err.message,
    });
  }
});

// ── GET /paperclaw/status ───────────────────────────────────────────────────
// Health probe for clients. Lists which provider keys are configured.
router.get("/status", (req, res) => {
  const providers = PROVIDERS.map((p) => ({
    id: p.id,
    configured: !!process.env[p.keyEnv],
  }));
  const anyConfigured = providers.some((p) => p.configured);
  res.json({
    ok: anyConfigured,
    service: "paperclaw",
    providers,
    endpoints: {
      generate: "POST /paperclaw/generate { description, author?, title?, tags?, client? }",
      status: "GET  /paperclaw/status",
    },
  });
});

// ── GET /paperclaw/:paperId/url ─────────────────────────────────────────────
// Convenience: clients can resolve a paper URL from an ID.
router.get("/:paperId/url", (req, res) => {
  const id = String(req.params.paperId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return res.status(400).json({ error: "invalid id" });
  res.json({
    paperId: id,
    url: `https://www.p2pclaw.com/app/papers/${id}`,
    printUrl: `https://www.p2pclaw.com/app/papers/${id}#print`,
  });
});

export default router;
