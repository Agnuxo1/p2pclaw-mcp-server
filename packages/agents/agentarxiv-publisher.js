/**
 * P2PCLAW — AgentArxiv Publisher
 * ================================
 * Publishes the best P2PCLAW papers to external channels via Moltbook API.
 * Runs 1× per day, selects top-scored papers from the last 24h, and submits.
 *
 * Environment variables:
 *   MOLTBOOK_API_KEY — Moltbook API key
 *   GATEWAY          — P2PCLAW API backend URL
 *   DRY_RUN          — Set to 'true' to log without publishing
 *
 * Usage:
 *   node packages/agents/agentarxiv-publisher.js
 *   # Or via GitHub Actions daily cron
 */

import axios from "axios";

const GATEWAY        = process.env.GATEWAY        || "https://api-production-ff1b.up.railway.app";
const MOLTBOOK_KEY   = process.env.MOLTBOOK_API_KEY || "moltbook_sk_zGYsu5jYl6AX7JnwprO1HbIF7KXsAolt";
const MOLTBOOK_BASE  = "https://api.moltbook.com/v1";
const DRY_RUN        = process.env.DRY_RUN === "true";
const MAX_PAPERS_DAY = 3;  // Max papers to publish per run
const MIN_SCORE      = 70; // Minimum Occam score to publish externally

// Occam scorer (lightweight, no LLM)
function scoreOccam(paper) {
    let score = 0;
    const content = (paper.content || paper.abstract || "").toLowerCase();

    const sections = ["abstract", "introduction", "method", "result", "conclusion", "discussion"];
    const found = sections.filter((s) => content.includes(s));
    score += Math.round((found.length / sections.length) * 40);

    const wordCount = (paper.content || "").split(/\s+/).filter(Boolean).length;
    if (wordCount >= 500)      score += 20;
    else if (wordCount >= 300) score += 15;
    else if (wordCount >= 150) score += 10;

    const citations = (paper.content || "").match(/\[\d+\]|References?:/gi) || [];
    if (citations.length >= 5)      score += 20;
    else if (citations.length >= 3) score += 15;
    else if (citations.length >= 1) score += 10;

    const titleWords = (paper.title || "").split(/\s+/).length;
    if (titleWords >= 5 && titleWords <= 20) score += 20;
    else if (titleWords >= 3)                score += 10;

    return Math.min(100, score);
}

// Fetch best papers from the last 24h
async function fetchBestPapers() {
    const resp = await axios.get(`${GATEWAY}/latest-papers?limit=50`, { timeout: 10000 });
    const papers = Array.isArray(resp.data) ? resp.data : (resp.data?.papers || []);

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    return papers
        .filter((p) => {
            if (!p.title || !p.content) return false;
            if (p.status === "PURGED" || p.status === "REJECTED") return false;
            const ts = p.timestamp || p.createdAt || 0;
            return ts >= cutoff;
        })
        .map((p) => ({ ...p, _score: scoreOccam(p) }))
        .filter((p) => p._score >= MIN_SCORE)
        .sort((a, b) => b._score - a._score)
        .slice(0, MAX_PAPERS_DAY);
}

// Publish a paper via Moltbook API
async function publishToMoltbook(paper) {
    if (DRY_RUN) {
        console.log(`[DRY_RUN] Would publish: "${paper.title}" (score: ${paper._score})`);
        return { dry_run: true };
    }

    const payload = {
        title:    paper.title,
        abstract: paper.abstract || paper.content?.slice(0, 500),
        content:  paper.content,
        author:   paper.author || "P2PCLAW Research Network",
        source:   "P2PCLAW Decentralized Science Network",
        source_url: `https://p2pclaw.com/#papers`,
        tags:     ["p2pclaw", "decentralized-science", "multi-agent", "AI-research"],
        metadata: {
            occam_score: paper._score,
            paper_id:    paper.id,
            ipfs_cid:    paper.ipfs_cid || null,
            agent:       paper.agentId || "unknown",
        },
    };

    const resp = await axios.post(`${MOLTBOOK_BASE}/publish`, payload, {
        headers: {
            "Authorization": `Bearer ${MOLTBOOK_KEY}`,
            "Content-Type":  "application/json",
        },
        timeout: 15000,
    });

    return resp.data;
}

// Main
async function main() {
    console.log(`[AGENTARXIV] Starting daily publication run at ${new Date().toISOString()}`);
    console.log(`[AGENTARXIV] Gateway: ${GATEWAY} | Dry run: ${DRY_RUN}`);

    let papers;
    try {
        papers = await fetchBestPapers();
    } catch (e) {
        console.error(`[AGENTARXIV] Failed to fetch papers: ${e.message}`);
        process.exit(1);
    }

    if (papers.length === 0) {
        console.log("[AGENTARXIV] No qualifying papers found (score >= " + MIN_SCORE + " in last 24h). Exiting.");
        return;
    }

    console.log(`[AGENTARXIV] Found ${papers.length} qualifying papers to publish.`);

    for (const paper of papers) {
        try {
            console.log(`[AGENTARXIV] Publishing: "${paper.title}" (score: ${paper._score})`);
            const result = await publishToMoltbook(paper);
            console.log(`[AGENTARXIV] ✅ Published. Response:`, JSON.stringify(result).slice(0, 200));
        } catch (e) {
            console.warn(`[AGENTARXIV] ⚠️  Failed to publish "${paper.title}": ${e.message}`);
        }

        // Small delay between publications
        await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`[AGENTARXIV] Run complete. ${papers.length} papers processed.`);
}

main().catch(console.error);
