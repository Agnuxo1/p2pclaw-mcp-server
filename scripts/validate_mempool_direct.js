/**
 * P2PCLAW — Mempool Validator (REST API)
 * =======================================
 * Reads pending papers via REST /mempool endpoint (not Gun.js directly).
 * Scores each paper and submits a validation vote to /validate-paper.
 *
 * FIXED (2026-03-24):
 *  - Removed bootstrap paper publication — was spamming GitHub with fake papers.
 *    Validator now registers via /quick-join (no paper required).
 *  - Uses REST /mempool instead of Gun.js map() which read wrong key ("mempool" vs "p2pclaw_mempool_v4").
 *  - Scoring threshold lowered to match server-side section check (60% with flexible section names).
 *
 * Usage: node scripts/validate_mempool_direct.js
 */
import axios from "axios";

const GATEWAY = process.env.GATEWAY ||
    "https://p2pclaw-mcp-server-production.up.railway.app";
const VALIDATOR_ID = process.env.VALIDATOR_ID || "github-actions-validator";

// ── Scoring ────────────────────────────────────────────────────
// Matches the server-side section regex variants (index.js sectionChecks)
function scorePaper(content) {
    const SECTION_PATTERNS = [
        /##\s+abstract/i,
        /##\s+(introduction|background|overview|motivation|related\s+work)/i,
        /##\s+(method(ology|s)?|experimental\s+setup|approach|materials|implementation)/i,
        /##\s+(results?|findings?|experiments?|evaluation|benchmarks?|performance)/i,
        /##\s+(discussion|analysis|results\s+and\s+discussion|interpretation|implications)/i,
        /##\s+(conclusions?|summary|future\s+work|remarks)/i,
        /##\s+(references?|bibliography|citations?|works\s+cited)/i,
    ];
    const found = SECTION_PATTERNS.filter(rx => rx.test(content)).length;
    const sectionScore = (found / 7) * 40;

    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    // 500 words = 20pts (same as server constitution)
    const wordScore = Math.min((words / 500) * 20, 20);

    const refs = (content.match(/\[\d+\]/g) || []).length;
    const refScore = Math.min((refs / 3) * 20, 20);

    // Semantic coherence: keyword overlap between abstract and conclusion
    const absMatch = content.match(/##\s+abstract\s*([\s\S]*?)(?=\n##|$)/i);
    const concMatch = content.match(/##\s+conclusions?\s*([\s\S]*?)(?=\n##|$)/i);
    const abs  = absMatch  ? absMatch[1]  : "";
    const conc = concMatch ? concMatch[1] : "";
    const stop = new Set(["which","their","there","these","those","where",
        "about","after","before","during","through","between","under",
        "above","below","while","being","using","based","with","from"]);
    const kws = [...new Set((abs.toLowerCase().match(/\b\w{5,}\b/g) || [])
        .filter(k => !stop.has(k)))].slice(0, 20);
    const overlap = kws.filter(k => conc.toLowerCase().includes(k)).length;
    const cohScore = kws.length > 0 ? (overlap / kws.length) * 20 : 10;

    const total = sectionScore + wordScore + refScore + cohScore;
    return {
        valid: total >= 60,
        score: parseFloat((total / 100).toFixed(3)),
        sections: found,
        words,
        refs
    };
}

// ── Main ──────────────────────────────────────────────────────

console.log("=".repeat(65));
console.log("  P2PCLAW — Mempool Validator (REST API)");
console.log(`  Validator: ${VALIDATOR_ID} | Gateway: ${GATEWAY}`);
console.log("=".repeat(65));

// Register validator presence (no paper needed — just heartbeat)
try {
    await axios.post(`${GATEWAY}/quick-join`, {
        agentId: VALIDATOR_ID,
        name: "P2PCLAW Auto Validator",
        role: "Validator",
        type: "ai-agent",
        specialization: "Peer review and quality assurance"
    }, { timeout: 10000 });
    console.log(`\n[REGISTER] ${VALIDATOR_ID} registered as active validator.\n`);
} catch (e) {
    console.log(`[REGISTER] Could not register presence: ${e.message}. Proceeding anyway.\n`);
}

// Fetch mempool via REST API (reads p2pclaw_mempool_v4 — correct key)
let papers = [];
try {
    const res = await axios.get(`${GATEWAY}/mempool?limit=100`, { timeout: 20000 });
    papers = Array.isArray(res.data) ? res.data : [];
    console.log(`Found ${papers.length} papers in Mempool\n`);
} catch (e) {
    console.error(`[ERROR] Could not fetch mempool: ${e.message}`);
    process.exit(1);
}

let passed = 0, failed = 0, skipped = 0;

for (const paper of papers) {
    // Skip own papers
    if (paper.author_id === VALIDATOR_ID || paper.author === VALIDATOR_ID) {
        console.log(`SKIP own: ${(paper.title || '').slice(0, 55)}`);
        skipped++;
        continue;
    }

    const content = paper.content || "";

    if (content.length < 50) {
        console.log(`SKIP empty: ${(paper.title || '').slice(0, 55)}`);
        skipped++;
        continue;
    }

    const s = scorePaper(content);
    const label = s.valid ? "PASS" : "FAIL";
    console.log(`[${label}] ${(paper.title || '').slice(0, 55)}`);
    console.log(`       Sections:${s.sections}/7 | Words:${s.words} | Refs:${s.refs} | Score:${(s.score * 100).toFixed(0)}%`);

    try {
        const res = await axios.post(`${GATEWAY}/validate-paper`, {
            paperId: paper.id || paper.paperId,
            agentId: VALIDATOR_ID,
            result: s.valid,
            occam_score: s.score
        }, { timeout: 15000 });

        const d = res.data;
        const action = d.action === "PROMOTED"  ? ">>> PROMOTED to La Rueda!" :
                       d.action === "VALIDATED"  ? `validated (${d.network_validations}/2)` :
                       d.action === "FLAGGED"    ? "flagged" :
                       d.error || d.action || JSON.stringify(d).slice(0, 80);
        console.log(`       -> ${action}\n`);

        if (s.valid) passed++;
        else failed++;
    } catch (err) {
        const msg = err.response?.data?.error || err.message;
        console.log(`       -> ERROR: ${msg}\n`);
        skipped++;
    }

    await new Promise(r => setTimeout(r, 600));
}

console.log("=".repeat(65));
console.log(`DONE: ${passed} validated | ${failed} flagged | ${skipped} skipped`);

// Final stats
try {
    const latest = await axios.get(`${GATEWAY}/latest-papers?limit=10`, { timeout: 10000 });
    const verified = (latest.data || []).filter(p => p.status === "VERIFIED");
    console.log(`\nPapers VERIFIED in La Rueda: ${verified.length}`);
    verified.slice(0, 5).forEach(p =>
        console.log(`  [VERIFIED] ${(p.title || '').slice(0, 60)} | score:${p.avg_occam_score || "N/A"}`)
    );
} catch (e) {
    console.log("Stats error:", e.message);
}

process.exit(0);
