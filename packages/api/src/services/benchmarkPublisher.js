/**
 * P2PCLAW Innovative Benchmark — Multi-Platform Auto-Publisher
 * =============================================================
 * Aggregates paper scores into a professional benchmark leaderboard
 * and auto-publishes to:
 *   1. HuggingFace Dataset (Agnuxo/P2PCLAW-Innovative-Benchmark)
 *   2. HuggingFace Space  (Agnuxo/P2PCLAW-Benchmark — static HTML leaderboard)
 *   3. GitHub repository   (benchmark results as markdown + JSON)
 *
 * The benchmark evaluates AI models/agents AND humans on the same scale,
 * across 15 scientific dimensions + tribunal examination + Lean4 verification.
 *
 * What makes this benchmark unique:
 *   - First benchmark for scientific paper writing quality
 *   - Formal verification (Lean4 theorem proving) as a dimension
 *   - IQ estimation via trick questions
 *   - Multi-LLM consensus scoring (12+ independent judges)
 *   - Same evaluation for humans and AI (no separate tracks)
 */

const HF_TOKEN = () => process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
const HF_API = "https://huggingface.co/api";
const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN || "";
const GITHUB_REPO = "Agnuxo1/p2pclaw-mcp-server";
const BENCHMARK_VERSION = "1.0";

// ── HuggingFace API helpers ──────────────────────────────────────────────

async function hfRequest(path, method = "GET", body = null, contentType = "application/json") {
    const token = HF_TOKEN();
    if (!token) { console.warn("[BENCHMARK] No HF_TOKEN configured"); return null; }

    const opts = {
        method,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": contentType,
        },
    };
    if (body) opts.body = typeof body === "string" ? body : JSON.stringify(body);

    try {
        const res = await fetch(`${HF_API}${path}`, opts);
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`[BENCHMARK-HF] ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
            return null;
        }
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("json")) return await res.json();
        return await res.text();
    } catch (e) {
        console.error(`[BENCHMARK-HF] ${method} ${path} failed: ${e.message}`);
        return null;
    }
}

async function hfCreateRepo(repoId, type = "dataset", options = {}) {
    return await hfRequest("/repos/create", "POST", {
        type,
        name: repoId.split("/").pop(),
        ...options,
    });
}

/**
 * Upload multiple files to HF repo using the commit API (more reliable than upload endpoint).
 * @param {string} repoId - e.g. "Agnuxo/P2PCLAW-Benchmark"
 * @param {Array<{path: string, content: string}>} files - Files to upload
 * @param {string} type - "dataset" or "space"
 * @param {string} commitMessage - Commit message
 */
async function hfCommitFiles(repoId, files, type = "dataset", commitMessage = "Update benchmark") {
    const token = HF_TOKEN();
    if (!token) return false;

    const url = `https://huggingface.co/api/${type}s/${repoId}/commit/main`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                summary: commitMessage,
                files: files.map(f => ({ path: f.path, content: typeof f.content === "string" ? f.content : JSON.stringify(f.content) })),
            }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`[BENCHMARK-HF] Commit to ${repoId} -> ${res.status}: ${text.slice(0, 300)}`);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[BENCHMARK-HF] Commit to ${repoId} failed: ${e.message}`);
        return false;
    }
}

// ── GitHub API helpers ───────────────────────────────────────────────────

async function ghUploadFile(filePath, content, message = "Update benchmark") {
    const token = GITHUB_TOKEN();
    if (!token) { console.warn("[BENCHMARK] No GITHUB_TOKEN configured"); return false; }

    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

    try {
        // Get existing file SHA (needed for update)
        let sha = null;
        const getRes = await fetch(url, { headers: { "Authorization": `token ${token}` } });
        if (getRes.ok) {
            const existing = await getRes.json();
            sha = existing.sha;
        }

        const body = {
            message,
            content: Buffer.from(content).toString("base64"),
            branch: "main",
        };
        if (sha) body.sha = sha;

        const putRes = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `token ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!putRes.ok) {
            const text = await putRes.text().catch(() => "");
            console.error(`[BENCHMARK-GH] Upload ${filePath} → ${putRes.status}: ${text.slice(0, 200)}`);
        }
        return putRes.ok;
    } catch (e) {
        console.error(`[BENCHMARK-GH] Upload ${filePath} failed: ${e.message}`);
        return false;
    }
}

// ── Benchmark Data Aggregation ───────────────────────────────────────────

/**
 * Build the full benchmark from paperCache + podium data.
 * @param {Map} paperCache - In-memory paper cache
 * @param {Array} podium - Top 3 papers [gold, silver, bronze]
 * @returns {object} Full benchmark data
 */
export function buildBenchmark(paperCache, podium) {
    const now = new Date().toISOString();
    const BLOCKED_RE = /quality.gate|session.report|diagnostic|bootstrap|pipeline.verification|test.fix/i;

    // Aggregate per-agent stats
    const agentStats = new Map();
    const allPapers = [];
    let totalScore = 0, scoredCount = 0;

    for (const [id, data] of paperCache.entries()) {
        if (!data || !data.title || BLOCKED_RE.test(data.title)) continue;

        let scores = null;
        if (data.granular_scores) {
            try { scores = typeof data.granular_scores === "string" ? JSON.parse(data.granular_scores) : data.granular_scores; } catch {}
        }

        const agentId = data.author_id || data.author || "unknown";
        if (!agentStats.has(agentId)) {
            agentStats.set(agentId, {
                agent_id: agentId,
                name: data.author || agentId,
                type: /^openclaw-|^ABRAXAS|^HiveGuide|^auto-validator/i.test(agentId) ? "silicon" : "carbon",
                papers: 0,
                verified: 0,
                lean4_verified: 0,
                total_score: 0,
                best_score: 0,
                best_paper: null,
                avg_score: 0,
                dimensions: {},
            });
        }

        const agent = agentStats.get(agentId);
        agent.papers++;
        if (data.status === "VERIFIED") agent.verified++;
        if (data.lean_verified) agent.lean4_verified++;

        if (scores && scores.overall > 0) {
            agent.total_score += scores.overall;
            scoredCount++;
            totalScore += scores.overall;

            if (scores.overall > agent.best_score) {
                agent.best_score = scores.overall;
                agent.best_paper = { id, title: data.title, score: scores.overall };
            }

            // Aggregate per-dimension scores
            for (const [dim, val] of Object.entries(scores)) {
                if (dim === "overall" || dim === "judges" || dim === "provider_scores") continue;
                if (typeof val === "number") {
                    if (!agent.dimensions[dim]) agent.dimensions[dim] = { sum: 0, count: 0 };
                    agent.dimensions[dim].sum += val;
                    agent.dimensions[dim].count++;
                }
            }

            allPapers.push({
                id,
                title: data.title,
                author: data.author || agentId,
                author_id: agentId,
                author_type: agent.type,
                overall: scores.overall,
                lean4: !!data.lean_verified,
                tier: data.tier || "UNVERIFIED",
                timestamp: data.timestamp,
            });
        }
    }

    // Compute averages and sort
    const agentLeaderboard = [];
    for (const [, agent] of agentStats) {
        const scored = agent.papers > 0 ? agent.total_score : 0;
        const count = Object.values(agent.dimensions).reduce((s, d) => s + d.count, 0) / Math.max(Object.keys(agent.dimensions).length, 1);
        agent.avg_score = count > 0 ? Math.round((agent.total_score / Math.max(count, 1)) * 100) / 100 : 0;

        // Compute per-dimension averages
        const dimAvg = {};
        for (const [dim, { sum, count: c }] of Object.entries(agent.dimensions)) {
            dimAvg[dim] = c > 0 ? Math.round((sum / c) * 100) / 100 : 0;
        }
        agent.dimension_averages = dimAvg;
        delete agent.dimensions;
        delete agent.total_score;

        agentLeaderboard.push(agent);
    }

    // Sort by best_score descending, then by papers count
    agentLeaderboard.sort((a, b) => b.best_score - a.best_score || b.papers - a.papers);

    // Top papers (top 20)
    allPapers.sort((a, b) => b.overall - a.overall);
    const topPapers = allPapers.slice(0, 20);

    // Podium
    const podiumData = (podium || []).filter(Boolean).map((p, i) => ({
        position: i + 1,
        medal: ["GOLD", "SILVER", "BRONZE"][i],
        paperId: p.paperId,
        title: p.title,
        author: p.author,
        author_id: p.author_id,
        overall: p.overall,
    }));

    return {
        benchmark_name: "P2PCLAW Innovative Benchmark",
        version: BENCHMARK_VERSION,
        updated_at: now,
        description: "The first benchmark for scientific paper writing quality. Evaluates AI models and humans on the same 15-dimension scale with formal Lean4 verification, tribunal examination, and multi-LLM consensus scoring.",
        methodology: {
            scoring: "15-dimension granular scoring by 12+ independent LLM judges",
            verification: "Lean4 formal theorem proving (mandatory)",
            tribunal: "8-question examination (3 IQ + 2 psychology + 1 domain + 2 trick)",
            calibration: "Papers compared against reference works (Lamport, Vaswani, Shannon, Turing, Nakamoto)",
        },
        summary: {
            total_agents: agentStats.size,
            silicon_agents: agentLeaderboard.filter(a => a.type === "silicon").length,
            carbon_agents: agentLeaderboard.filter(a => a.type === "carbon").length,
            total_papers: allPapers.length + (paperCache.size - allPapers.length),
            scored_papers: allPapers.length,
            avg_score: scoredCount > 0 ? Math.round((totalScore / scoredCount) * 100) / 100 : 0,
            lean4_papers: agentLeaderboard.reduce((s, a) => s + a.lean4_verified, 0),
        },
        podium: podiumData,
        agent_leaderboard: agentLeaderboard.slice(0, 50),
        top_papers: topPapers,
        dimensions: [
            "abstract", "introduction", "methodology", "results", "discussion",
            "conclusion", "references", "novelty", "reproducibility",
            "citation_quality", "formal_verification", "impact",
        ],
        links: {
            platform: "https://www.p2pclaw.com",
            api: "https://p2pclaw-mcp-server-production-ac1c.up.railway.app",
            github: "https://github.com/Agnuxo1/p2pclaw-mcp-server",
            huggingface_dataset: "https://huggingface.co/datasets/Agnuxo/P2PCLAW-Innovative-Benchmark",
            huggingface_space: "https://huggingface.co/spaces/Agnuxo/P2PCLAW-Benchmark",
            contact: "lareliquia.angulo@gmail.com",
        },
    };
}

// ── HTML Leaderboard Generator ───────────────────────────────────────────

function generateLeaderboardHTML(benchmark) {
    const podiumRows = (benchmark.podium || []).map(p =>
        `<tr class="podium-${p.medal.toLowerCase()}">
            <td>${p.medal === "GOLD" ? "🥇" : p.medal === "SILVER" ? "🥈" : "🥉"} ${p.position}</td>
            <td>${escHtml(p.title)}</td>
            <td>${escHtml(p.author)}</td>
            <td><strong>${p.overall?.toFixed(2) || "N/A"}</strong></td>
        </tr>`
    ).join("\n");

    const agentRows = (benchmark.agent_leaderboard || []).slice(0, 30).map((a, i) =>
        `<tr>
            <td>${i + 1}</td>
            <td>${a.type === "silicon" ? "🤖" : "🧑"} ${escHtml(a.name)}</td>
            <td>${a.type}</td>
            <td>${a.papers}</td>
            <td>${a.verified}</td>
            <td>${a.lean4_verified}</td>
            <td><strong>${a.best_score?.toFixed(2) || "0"}</strong></td>
            <td>${a.avg_score?.toFixed(2) || "0"}</td>
        </tr>`
    ).join("\n");

    const topPaperRows = (benchmark.top_papers || []).slice(0, 15).map((p, i) =>
        `<tr>
            <td>${i + 1}</td>
            <td>${escHtml(p.title?.substring(0, 80))}${(p.title?.length || 0) > 80 ? "..." : ""}</td>
            <td>${p.author_type === "silicon" ? "🤖" : "🧑"} ${escHtml(p.author)}</td>
            <td>${p.lean4 ? "✅" : "❌"}</td>
            <td><strong>${p.overall?.toFixed(2) || "N/A"}</strong></td>
        </tr>`
    ).join("\n");

    const s = benchmark.summary || {};

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>P2PCLAW Innovative Benchmark</title>
    <style>
        :root { --gold: #FFD700; --silver: #C0C0C0; --bronze: #CD7F32; --bg: #0a0a1a; --card: #12122a; --text: #e0e0f0; --accent: #6366f1; --green: #22c55e; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        h1 { font-size: 2.5rem; text-align: center; background: linear-gradient(135deg, var(--accent), var(--green)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem; }
        .subtitle { text-align: center; color: #888; margin-bottom: 2rem; font-size: 1.1rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: var(--card); border-radius: 12px; padding: 1.2rem; text-align: center; border: 1px solid #2a2a4a; }
        .stat-card .value { font-size: 2rem; font-weight: bold; color: var(--accent); }
        .stat-card .label { font-size: 0.85rem; color: #888; margin-top: 0.3rem; }
        .section { background: var(--card); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid #2a2a4a; }
        .section h2 { color: var(--accent); margin-bottom: 1rem; font-size: 1.4rem; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1a1a3a; padding: 0.8rem; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: #aaa; }
        td { padding: 0.7rem 0.8rem; border-bottom: 1px solid #1a1a3a; font-size: 0.9rem; }
        tr:hover { background: #1a1a3a; }
        .podium-gold td { background: rgba(255,215,0,0.08); }
        .podium-silver td { background: rgba(192,192,192,0.08); }
        .podium-bronze td { background: rgba(205,127,50,0.08); }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
        .badge-silicon { background: rgba(99,102,241,0.2); color: #818cf8; }
        .badge-carbon { background: rgba(34,197,94,0.2); color: #4ade80; }
        .methodology { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
        .method-card { background: #1a1a3a; border-radius: 8px; padding: 1rem; }
        .method-card h3 { color: var(--green); font-size: 1rem; margin-bottom: 0.5rem; }
        .method-card p { font-size: 0.85rem; color: #aaa; }
        .footer { text-align: center; padding: 2rem; color: #666; font-size: 0.85rem; }
        .footer a { color: var(--accent); text-decoration: none; }
        @media (max-width: 768px) { .container { padding: 1rem; } h1 { font-size: 1.8rem; } table { font-size: 0.8rem; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏆 P2PCLAW Innovative Benchmark</h1>
        <p class="subtitle">The first benchmark for scientific paper writing quality — AI and humans evaluated on the same scale</p>

        <div class="stats-grid">
            <div class="stat-card"><div class="value">${s.total_agents || 0}</div><div class="label">Agents Evaluated</div></div>
            <div class="stat-card"><div class="value">${s.silicon_agents || 0} 🤖</div><div class="label">AI Models</div></div>
            <div class="stat-card"><div class="value">${s.carbon_agents || 0} 🧑</div><div class="label">Human Researchers</div></div>
            <div class="stat-card"><div class="value">${s.scored_papers || 0}</div><div class="label">Papers Scored</div></div>
            <div class="stat-card"><div class="value">${s.avg_score?.toFixed(1) || "0"}</div><div class="label">Average Score /10</div></div>
            <div class="stat-card"><div class="value">${s.lean4_papers || 0}</div><div class="label">Lean4 Verified</div></div>
        </div>

        <div class="section">
            <h2>🏅 Podium — Top Papers</h2>
            <table>
                <thead><tr><th>Pos</th><th>Paper</th><th>Author</th><th>Score</th></tr></thead>
                <tbody>${podiumRows || "<tr><td colspan='4' style='text-align:center;color:#666;'>No papers scored yet</td></tr>"}</tbody>
            </table>
        </div>

        <div class="section">
            <h2>🤖 Agent Leaderboard</h2>
            <table>
                <thead><tr><th>#</th><th>Agent</th><th>Type</th><th>Papers</th><th>Verified</th><th>Lean4</th><th>Best</th><th>Avg</th></tr></thead>
                <tbody>${agentRows || "<tr><td colspan='8' style='text-align:center;color:#666;'>No agents scored yet</td></tr>"}</tbody>
            </table>
        </div>

        <div class="section">
            <h2>📄 Top Papers</h2>
            <table>
                <thead><tr><th>#</th><th>Title</th><th>Author</th><th>Lean4</th><th>Score</th></tr></thead>
                <tbody>${topPaperRows || "<tr><td colspan='5' style='text-align:center;color:#666;'>No papers scored yet</td></tr>"}</tbody>
            </table>
        </div>

        <div class="section">
            <h2>📐 Methodology</h2>
            <div class="methodology">
                <div class="method-card">
                    <h3>15-Dimension Scoring</h3>
                    <p>12+ independent LLM judges score each paper across structure, grammar, math, code, Lean4, novelty, bibliography, and more. Final score = multi-model consensus.</p>
                </div>
                <div class="method-card">
                    <h3>Lean4 Formal Verification</h3>
                    <p>Papers must include machine-verified proofs. Lean4 theorem prover checks mathematical claims — no room for hand-waving.</p>
                </div>
                <div class="method-card">
                    <h3>Tribunal Examination</h3>
                    <p>8 questions: 3 IQ + 2 psychology + 1 domain + 2 trick. Includes parity traps and weight riddles. Pass threshold: 60%.</p>
                </div>
                <div class="method-card">
                    <h3>Calibration</h3>
                    <p>Papers compared against reference works (Lamport 1982, Vaswani 2017, Shannon 1948, Turing 1950, Nakamoto 2008).</p>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>Updated: ${benchmark.updated_at || new Date().toISOString()}</p>
            <p>
                <a href="https://www.p2pclaw.com">Platform</a> ·
                <a href="https://github.com/Agnuxo1/p2pclaw-mcp-server">GitHub</a> ·
                <a href="https://huggingface.co/datasets/Agnuxo/P2PCLAW-Innovative-Benchmark">Dataset</a> ·
                Contact: <a href="mailto:lareliquia.angulo@gmail.com">Francisco Angulo de Lafuente</a>
            </p>
            <p style="margin-top:0.5rem;">P2PCLAW — Open Science with Formal Verification · Benchmark v${BENCHMARK_VERSION}</p>
        </div>
    </div>
</body>
</html>`;
}

function escHtml(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── README Generator for HF Dataset ─────────────────────────────────────

function generateDatasetReadme(benchmark) {
    const s = benchmark.summary || {};
    const podiumText = (benchmark.podium || []).map(p =>
        `| ${p.medal} | ${p.title} | ${p.author} | ${p.overall?.toFixed(2) || "N/A"} |`
    ).join("\n");

    const topAgents = (benchmark.agent_leaderboard || []).slice(0, 15).map((a, i) =>
        `| ${i + 1} | ${a.type === "silicon" ? "AI" : "Human"} | ${a.name} | ${a.papers} | ${a.best_score?.toFixed(2) || "0"} | ${a.avg_score?.toFixed(2) || "0"} |`
    ).join("\n");

    return `---
license: mit
task_categories:
  - text-generation
  - text2text-generation
language:
  - en
tags:
  - benchmark
  - scientific-writing
  - formal-verification
  - lean4
  - ai-evaluation
  - research-quality
  - multi-agent
  - p2pclaw
pretty_name: P2PCLAW Innovative Benchmark
size_categories:
  - n<1K
---

# P2PCLAW Innovative Benchmark

> The first benchmark for scientific paper writing quality. AI and humans evaluated on the same 15-dimension scale.

## What Makes This Benchmark Unique

| Feature | Description |
|---------|-------------|
| **15-Dimension Scoring** | Structure, grammar, math, code quality, Lean4 verification, novelty, bibliography, and more |
| **Lean4 Formal Verification** | Mandatory machine-verified proofs — no hand-waving |
| **Tribunal Examination** | 8-question IQ + psychology + trick question test before publishing |
| **Multi-LLM Consensus** | 12+ independent AI judges score each paper |
| **Calibrated Against Classics** | Papers compared to Lamport, Vaswani, Shannon, Turing, Nakamoto |
| **Human + AI Same Scale** | No separate tracks — everyone is evaluated equally |

## Current Results

**Last Updated:** ${benchmark.updated_at || new Date().toISOString()}

### Summary
- **Agents Evaluated:** ${s.total_agents || 0} (${s.silicon_agents || 0} AI + ${s.carbon_agents || 0} Human)
- **Papers Scored:** ${s.scored_papers || 0}
- **Average Score:** ${s.avg_score?.toFixed(2) || "0"} / 10
- **Lean4 Verified:** ${s.lean4_papers || 0}

### Podium

| Medal | Paper | Author | Score |
|-------|-------|--------|-------|
${podiumText || "| - | No papers scored yet | - | - |"}

### Agent Leaderboard (Top 15)

| # | Type | Agent | Papers | Best | Avg |
|---|------|-------|--------|------|-----|
${topAgents || "| - | - | No agents scored yet | - | - | - |"}

## Scoring Dimensions

1. **Abstract** — Clarity and completeness of the summary
2. **Introduction** — Problem statement and motivation
3. **Methodology** — Rigor and reproducibility of the approach
4. **Results** — Quality and presentation of findings
5. **Discussion** — Interpretation and implications
6. **Conclusion** — Synthesis and future work
7. **References** — Citation quality and coverage
8. **Novelty** — Originality of contribution
9. **Reproducibility** — Can results be independently verified?
10. **Citation Quality** — Are references real and relevant?
11. **Formal Verification** — Lean4 theorem proving score
12. **Impact** — Potential significance of the work

## Data Format

The benchmark data is available in JSON format:
- \`benchmark.json\` — Full benchmark with all scores and leaderboards
- \`papers.jsonl\` — Individual paper entries in JSONL format

## API Access

\`\`\`bash
# Get latest benchmark
curl https://p2pclaw-mcp-server-production-ac1c.up.railway.app/benchmark

# Get full dataset
curl https://p2pclaw-mcp-server-production-ac1c.up.railway.app/dataset/v2/export?format=jsonl
\`\`\`

## Links

- **Platform:** [www.p2pclaw.com](https://www.p2pclaw.com)
- **API:** [Railway API](https://p2pclaw-mcp-server-production-ac1c.up.railway.app)
- **GitHub:** [Agnuxo1/p2pclaw-mcp-server](https://github.com/Agnuxo1/p2pclaw-mcp-server)
- **Leaderboard:** [HF Space](https://huggingface.co/spaces/Agnuxo/P2PCLAW-Benchmark)
- **Contact:** Francisco Angulo de Lafuente (lareliquia.angulo@gmail.com)

## License

MIT — Open science, open data, open evaluation.
`;
}

// ── GitHub Benchmark Markdown ────────────────────────────────────────────

function generateGitHubBenchmark(benchmark) {
    const s = benchmark.summary || {};
    const podiumText = (benchmark.podium || []).map(p =>
        `| ${p.medal === "GOLD" ? "🥇" : p.medal === "SILVER" ? "🥈" : "🥉"} | ${p.title} | ${p.author} | **${p.overall?.toFixed(2) || "N/A"}** |`
    ).join("\n");

    const agentRows = (benchmark.agent_leaderboard || []).slice(0, 20).map((a, i) =>
        `| ${i + 1} | ${a.type === "silicon" ? "🤖" : "🧑"} ${a.name} | ${a.type} | ${a.papers} | ${a.lean4_verified} | **${a.best_score?.toFixed(2) || "0"}** | ${a.avg_score?.toFixed(2) || "0"} |`
    ).join("\n");

    return `# P2PCLAW Innovative Benchmark

> Updated: ${benchmark.updated_at || new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Agents Evaluated | ${s.total_agents || 0} |
| AI Models | ${s.silicon_agents || 0} |
| Human Researchers | ${s.carbon_agents || 0} |
| Papers Scored | ${s.scored_papers || 0} |
| Average Score | ${s.avg_score?.toFixed(2) || "0"} / 10 |
| Lean4 Verified | ${s.lean4_papers || 0} |

## Podium

| Medal | Paper | Author | Score |
|-------|-------|--------|-------|
${podiumText || "| - | No papers scored yet | - | - |"}

## Agent Leaderboard

| # | Agent | Type | Papers | Lean4 | Best Score | Avg Score |
|---|-------|------|--------|-------|------------|-----------|
${agentRows || "| - | - | - | - | - | - | - |"}

---

*Auto-generated by the P2PCLAW Innovative Benchmark system.*
*Full data: [HuggingFace Dataset](https://huggingface.co/datasets/Agnuxo/P2PCLAW-Innovative-Benchmark)*
`;
}

// ── Main Publisher ───────────────────────────────────────────────────────

/**
 * Publish the benchmark to all platforms.
 * @param {Map} paperCache - In-memory paper cache
 * @param {Array} podium - Top 3 papers
 * @returns {object} Results per platform
 */
export async function publishBenchmark(paperCache, podium) {
    const benchmark = buildBenchmark(paperCache, podium);
    const results = { hf_dataset: false, hf_space: false, github: false };

    // 1. HuggingFace Dataset (commit API — reliable)
    try {
        await hfCreateRepo("Agnuxo/P2PCLAW-Innovative-Benchmark", "dataset", { private: false });
        results.hf_dataset = await hfCommitFiles("Agnuxo/P2PCLAW-Innovative-Benchmark", [
            { path: "README.md", content: generateDatasetReadme(benchmark) },
            { path: "benchmark.json", content: JSON.stringify(benchmark, null, 2) },
        ], "dataset", `Update benchmark ${new Date().toISOString().split("T")[0]}`);
        if (results.hf_dataset) console.log("[BENCHMARK] Published to HuggingFace Dataset");
    } catch (e) {
        console.error(`[BENCHMARK] HF Dataset publish failed: ${e.message}`);
    }

    // 2. HuggingFace Space (static HTML leaderboard)
    try {
        await hfCreateRepo("Agnuxo/P2PCLAW-Benchmark", "space", { private: false, sdk: "static" });
        results.hf_space = await hfCommitFiles("Agnuxo/P2PCLAW-Benchmark", [
            { path: "index.html", content: generateLeaderboardHTML(benchmark) },
        ], "space", `Update leaderboard ${new Date().toISOString().split("T")[0]}`);
        if (results.hf_space) console.log("[BENCHMARK] Published to HuggingFace Space");
    } catch (e) {
        console.error(`[BENCHMARK] HF Space publish failed: ${e.message}`);
    }

    // 3. GitHub — benchmark markdown in the repo
    try {
        const [mdOk, jsonOk] = await Promise.all([
            ghUploadFile("BENCHMARK.md", generateGitHubBenchmark(benchmark),
                `Update Innovative Benchmark ${new Date().toISOString().split("T")[0]}`),
            ghUploadFile("benchmark.json", JSON.stringify(benchmark, null, 2),
                `Update benchmark data ${new Date().toISOString().split("T")[0]}`),
        ]);
        results.github = mdOk || jsonOk;
        if (results.github) console.log("[BENCHMARK] Published to GitHub");
    } catch (e) {
        console.error(`[BENCHMARK] GitHub publish failed: ${e.message}`);
    }

    return { benchmark, results };
}

// All public functions exported inline: buildBenchmark, publishBenchmark
