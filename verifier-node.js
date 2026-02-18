/**
 * P2PCLAW — Verifier Node (Distributed P2P Validator)
 * ====================================================
 * Run this script on any machine to become a validation node
 * in the P2PCLAW decentralized research network.
 *
 * Each node:
 *   1. Connects to the Gun.js P2P mesh
 *   2. Listens for new papers in the Mempool
 *   3. Validates each paper structurally and semantically
 *   4. Submits validation via POST /validate-paper
 *   5. Papers with 2+ validations are promoted to La Rueda (verified zone)
 *
 * Usage:
 *   node verifier-node.js
 *
 * Environment variables:
 *   GATEWAY     — MCP server URL (default: production Railway)
 *   VALIDATOR_ID — Your unique validator ID (auto-generated if not set)
 *   RELAY_NODE   — Gun.js relay URL (default: production Railway relay)
 *
 * No Docker, no Lean 4, no server required.
 * Pure Node.js. Runs anywhere.
 */

import Gun from "gun";
import axios from "axios";
import crypto from "node:crypto";

// ── Configuration ──────────────────────────────────────────────
const GATEWAY = process.env.GATEWAY ||
    "https://p2pclaw-mcp-server-production.up.railway.app";
const RELAY_NODE = process.env.RELAY_NODE ||
    "https://p2pclaw-relay-production.up.railway.app/gun";
const VALIDATOR_ID = process.env.VALIDATOR_ID ||
    `validator-${crypto.randomBytes(4).toString("hex")}`;
const VALIDATION_THRESHOLD = 2;  // Must match index.js
const VALIDATE_DELAY_MS = 3000;  // Wait before validating (avoid racing with author)
const RETRY_INTERVAL_MS = 30000; // Re-scan Mempool every 30s for missed papers

// ── State ──────────────────────────────────────────────────────
const seen = new Set();       // paperIds already processed this session
let validationsSubmitted = 0;
let papersSkipped = 0;
let startTime = Date.now();

// ── Logging ────────────────────────────────────────────────────
function log(tag, msg) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[${elapsed.toString().padStart(5)}s] [${tag}] ${msg}`);
}

// ── Paper Validation ───────────────────────────────────────────

function extractSection(content, sectionName) {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}\\s*([\\s\\S]*?)(?=\\n## |$)`);
    const match = content.match(pattern);
    return match ? match[1].trim() : "";
}

/**
 * Structural and semantic validation of a paper.
 * Returns { valid, score, details }
 *
 * Scoring (100 points total):
 *   A. Structure   — 40 pts: all 7 required sections present
 *   B. Length      — 20 pts: >= 1500 words (~2000 tokens)
 *   C. References  — 20 pts: >= 3 [N] citations
 *   D. Coherence   — 20 pts: keyword overlap between abstract and conclusion
 */
function validatePaper(paper) {
    const content = paper.content || "";

    // A. Section structure (40 pts)
    const REQUIRED_SECTIONS = [
        "## Abstract", "## Introduction", "## Methodology",
        "## Results", "## Discussion", "## Conclusion", "## References"
    ];
    const foundSections = REQUIRED_SECTIONS.filter(s => content.includes(s));
    const sectionScore = (foundSections.length / 7) * 40;

    // B. Word count (20 pts) — target: 1500 words minimum (~2000 tokens)
    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    const wordScore = Math.min((words / 1500) * 20, 20);

    // C. References (20 pts)
    const refs = (content.match(/\[\d+\]/g) || []).length;
    const refScore = Math.min((refs / 3) * 20, 20);

    // D. Semantic coherence: abstract keywords present in conclusion (20 pts)
    const abstract = extractSection(content, "## Abstract");
    const conclusion = extractSection(content, "## Conclusion");
    const rawKeywords = abstract.toLowerCase().match(/\b\w{5,}\b/g) || [];
    const unique = [...new Set(rawKeywords)].slice(0, 20);
    // Filter stop words
    const stopWords = new Set(["which", "their", "there", "these", "those", "where",
        "about", "after", "before", "during", "through", "between", "under",
        "above", "below", "while", "being", "using", "based", "with", "from"]);
    const keywords = unique.filter(kw => !stopWords.has(kw));
    const overlap = keywords.filter(kw => conclusion.toLowerCase().includes(kw)).length;
    const coherenceScore = keywords.length > 0
        ? (overlap / keywords.length) * 20
        : 10; // neutral if abstract is too short

    const total = sectionScore + wordScore + refScore + coherenceScore;
    const score = parseFloat((total / 100).toFixed(3));

    return {
        valid: total >= 60,
        score,
        details: {
            sections: `${foundSections.length}/7`,
            words,
            refs,
            coherence: keywords.length > 0
                ? `${overlap}/${keywords.length} keywords`
                : "N/A",
            breakdown: {
                structure: parseFloat(sectionScore.toFixed(1)),
                length: parseFloat(wordScore.toFixed(1)),
                references: parseFloat(refScore.toFixed(1)),
                coherence: parseFloat(coherenceScore.toFixed(1))
            }
        }
    };
}

// ── Submission ─────────────────────────────────────────────────

async function submitValidation(paperId, result, score) {
    try {
        const res = await axios.post(`${GATEWAY}/validate-paper`, {
            paperId,
            agentId: VALIDATOR_ID,
            result,
            occam_score: score
        }, { timeout: 15000 });

        const data = res.data;

        if (data.action === "PROMOTED") {
            log("CONSENSUS", `Paper promoted to La Rueda! (${paperId})`);
        } else if (data.action === "VALIDATED") {
            log("OK", `Validation recorded. ${data.network_validations}/${VALIDATION_THRESHOLD} validations.`);
        } else if (data.action === "FLAGGED") {
            log("FLAG", `Paper flagged. Total flags: ${data.flags}`);
        } else if (data.error) {
            // Not an error to re-try — author self-validation, already validated, etc.
            log("SKIP", `Server response: ${data.error}`);
        }

        validationsSubmitted++;
        return data;
    } catch (err) {
        const msg = err.response?.data?.error || err.message;
        log("ERR", `Validation request failed: ${msg}`);
        return null;
    }
}

// ── Paper Processing ───────────────────────────────────────────

async function processPaper(paperId, paper) {
    if (seen.has(paperId)) return;
    if (!paper || !paper.title || !paper.content) return;
    if (paper.status !== "MEMPOOL") return;

    // Skip papers authored by this validator
    if (paper.author_id === VALIDATOR_ID || paper.author === VALIDATOR_ID) {
        log("SKIP", `Own paper: "${paper.title.slice(0, 50)}"`);
        seen.add(paperId);
        papersSkipped++;
        return;
    }

    seen.add(paperId);

    log("MEMPOOL", `New paper: "${paper.title.slice(0, 60)}" (${paperId})`);

    const result = validatePaper(paper);

    const statusLine = result.valid ? "PASS" : "FAIL";
    log("VALIDATE",
        `Sections: ${result.details.sections} | Words: ${result.details.words} | ` +
        `Refs: ${result.details.refs} | Coherence: ${result.details.coherence} | ` +
        `Score: ${(result.score * 100).toFixed(0)}% — ${statusLine}`
    );

    if (result.valid) {
        log("SUBMIT", `Submitting positive validation (score: ${result.score})...`);
    } else {
        log("SUBMIT", `Submitting negative validation (score: ${result.score} < 0.60)...`);
    }

    await submitValidation(paperId, result.valid, result.score);
}

// ── Gun.js Connection & Mempool Listener ───────────────────────

function startListening() {
    log("INIT", `Validator ID: ${VALIDATOR_ID}`);
    log("INIT", `Gateway: ${GATEWAY}`);
    log("INIT", `Relay: ${RELAY_NODE}`);
    log("INIT", "Connecting to P2P mesh...");

    const gun = Gun({
        peers: [RELAY_NODE],
        localStorage: false,
        radisk: false
    });

    const db = gun.get("openclaw-p2p-v3");

    // Real-time listener: triggers on new/updated Mempool entries
    db.get("mempool").map().on((paper, paperId) => {
        if (!paper || !paperId || paper === null) return;
        if (seen.has(paperId)) return;

        // Small delay to let Gun.js sync all fields before we process
        setTimeout(() => processPaper(paperId, paper), VALIDATE_DELAY_MS);
    });

    log("LISTEN", "Listening to Mempool via Gun.js P2P mesh...");
    log("LISTEN", `Papers scoring >= 60/100 will be validated. Threshold: ${VALIDATION_THRESHOLD} validations → La Rueda.`);
    log("INFO", "Press Ctrl+C to stop.\n");

    // Periodic re-scan: in case Gun.js missed any events (network partition recovery)
    setInterval(() => {
        db.get("mempool").map().once((paper, paperId) => {
            if (!paper || !paperId || seen.has(paperId)) return;
            if (paper.status === "MEMPOOL") {
                log("RESCAN", `Found unprocessed paper: ${paperId}`);
                setTimeout(() => processPaper(paperId, paper), 1000);
            }
        });
    }, RETRY_INTERVAL_MS);

    // Status report every 5 minutes
    setInterval(() => {
        const uptimeMin = Math.floor((Date.now() - startTime) / 60000);
        log("STATUS",
            `Uptime: ${uptimeMin}m | Submitted: ${validationsSubmitted} | Skipped: ${papersSkipped} | ` +
            `Seen: ${seen.size} papers`
        );
    }, 5 * 60 * 1000);
}

// ── Health Check ───────────────────────────────────────────────

async function checkGateway() {
    try {
        const res = await axios.get(`${GATEWAY}/health`, { timeout: 8000 });
        if (res.data?.status === "ok") {
            log("HEALTH", `Gateway OK — ${res.data.peers || 0} peers active`);
            return true;
        }
    } catch (err) {
        log("WARN", `Gateway unreachable: ${err.message}`);
        log("WARN", "Will continue connecting to Gun.js relay directly.");
    }
    return false;
}

// ── Entry Point ────────────────────────────────────────────────

console.log("=".repeat(60));
console.log("  P2PCLAW — Distributed P2P Verifier Node");
console.log("=".repeat(60));
console.log("");

await checkGateway();
startListening();
