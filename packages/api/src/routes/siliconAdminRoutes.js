/**
 * P2PCLAW Open Problem Solver — Silicon Admin Routes
 * ====================================================
 * All routes under /silicon/admin require admin authentication.
 *
 * Endpoints:
 *   GET  /problems           — List all problems with status
 *   GET  /problems/:id       — Detailed problem info + solve history
 *   POST /solve/start        — Start async solve loop
 *   POST /solve/stop         — Stop running solve loop
 *   GET  /solve/status       — Current phase, attempt, logs
 *   GET  /solve/history      — All past solve sessions
 *   GET  /agents             — List expert agents with health
 *   POST /agents/test        — Ping-test one expert agent
 *   GET  /sse                — SSE stream for real-time progress
 */

import { Router } from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import { getAllProblems, getProblem, getAllHistory, resetProblem } from "../services/problemBoard.js";
import { listAgents, testAgent } from "../services/expertAgentService.js";
import {
    startSolveLoop, stopSolveLoop, getSolveStatus,
    getActiveSolveLoop, getSseClients,
} from "../services/solveLoopService.js";

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// ── Problem Board ───────────────────────────────────────────────────────────

router.get("/problems", (req, res) => {
    const problems = getAllProblems();
    res.json({
        total: problems.length,
        problems: problems.map(p => ({
            id: p.id,
            title: p.title,
            source: p.source,
            category: p.category,
            difficulty: p.difficulty,
            type: p.type,
            recommended: p.recommended,
            priority: p.priority,
            domains_needed: p.domains_needed,
            status: p.state.status,
            attempts: p.state.attempts,
            sessions_count: p.state.sessions.length,
        })),
    });
});

router.get("/problems/:id", (req, res) => {
    const problem = getProblem(req.params.id);
    if (!problem) return res.status(404).json({ error: "Problem not found" });
    res.json(problem);
});

router.post("/problems/:id/reset", (req, res) => {
    const problem = getProblem(req.params.id);
    if (!problem) return res.status(404).json({ error: "Problem not found" });
    resetProblem(req.params.id);
    res.json({ success: true, message: `Problem ${req.params.id} reset to idle` });
});

// ── Solve Loop Control ──────────────────────────────────────────────────────

router.post("/solve/start", async (req, res) => {
    const { problemId } = req.body || {};

    try {
        // Start the loop in the background — don't await it
        startSolveLoop(problemId || null).catch(err => {
            console.error(`[OPS] Background solve loop error: ${err.message}`);
        });

        res.json({
            success: true,
            message: problemId
                ? `Solve loop started for problem: ${problemId}`
                : "Solve loop started for all problems (by priority)",
            monitor: "GET /silicon/admin/solve/status",
            sse: "GET /silicon/admin/sse",
        });
    } catch (err) {
        res.status(409).json({ error: err.message });
    }
});

router.post("/solve/stop", (req, res) => {
    const result = stopSolveLoop();
    res.json(result);
});

router.get("/solve/status", (req, res) => {
    res.json(getSolveStatus());
});

router.get("/solve/history", (req, res) => {
    const history = getAllHistory();
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        total: history.length,
        sessions: history.slice(0, limit).map(s => ({
            id: s.id,
            problemId: s.problemId,
            problemTitle: s.problemTitle,
            assignedAgent: s.assignedAgentName || s.assignedAgent,
            status: s.status,
            attempt: s.attempt,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            log_count: (s.logs || []).length,
            error: s.error,
        })),
    });
});

// ── Export & Download ───────────────────────────────────────────────────────

router.get("/solve/export", (req, res) => {
    const history = getAllHistory();
    const problems = getAllProblems();
    const exportData = {
        exported_at: new Date().toISOString(),
        platform: "P2PCLAW Open Problem Solver",
        problems: problems.map(p => ({
            id: p.id,
            title: p.title,
            source: p.source,
            category: p.category,
            difficulty: p.difficulty,
            status: p.state.status,
            attempts: p.state.attempts,
            sessions: p.state.sessions,
        })),
        total_sessions: history.length,
    };

    if (req.query.download === "true") {
        res.setHeader("Content-Disposition", `attachment; filename="ops-export-${Date.now()}.json"`);
        res.setHeader("Content-Type", "application/json");
    }
    res.json(exportData);
});

router.get("/solve/session/:sessionId", (req, res) => {
    const history = getAllHistory();
    const session = history.find(s => s.id === req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (req.query.download === "true") {
        res.setHeader("Content-Disposition", `attachment; filename="${session.id}.json"`);
        res.setHeader("Content-Type", "application/json");
    }
    res.json(session);
});

// ── Expert Agents ───────────────────────────────────────────────────────────

router.get("/agents", (req, res) => {
    const agents = listAgents();
    res.json({
        total: agents.length,
        available: agents.filter(a => a.hasKey).length,
        agents,
    });
});

router.post("/agents/test", async (req, res) => {
    const { agentId } = req.body || {};
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const result = await testAgent(agentId);
    res.json(result);
});

// ── SSE Stream ──────────────────────────────────────────────────────────────

router.get("/sse", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });

    // Send initial state
    res.write(`data: ${JSON.stringify({ type: "connected", status: getSolveStatus(), ts: Date.now() })}\n\n`);

    const clients = getSseClients();
    clients.add(res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
        try { res.write(`data: ${JSON.stringify({ type: "heartbeat", ts: Date.now() })}\n\n`); }
        catch { clearInterval(heartbeat); clients.delete(res); }
    }, 30000);

    req.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(res);
    });
});

// ── Dashboard (Markdown summary) ────────────────────────────────────────────

router.get("/", (req, res) => {
    const problems = getAllProblems();
    const agents = listAgents();
    const status = getSolveStatus();
    const availableAgents = agents.filter(a => a.hasKey);

    const md = `# P2PCLAW Open Problem Solver — Admin Dashboard

**Status**: ${status.running ? "🔬 SOLVING" : "⏸ IDLE"} | **Agents**: ${availableAgents.length}/${agents.length} available | **Problems**: ${problems.length}

---

## Problems Board

| # | Problem | Source | Difficulty | Status | Attempts |
|---|---------|--------|------------|--------|----------|
${problems.map((p, i) => `| ${i + 1} | ${p.title.slice(0, 50)} | ${p.source} | ${p.difficulty} | ${p.state.status.toUpperCase()} | ${p.state.attempts}/${5} |`).join("\n")}

## Expert Agents

| Agent | Provider | Model | Domains | Key |
|-------|----------|-------|---------|-----|
${agents.map(a => `| ${a.name} | ${a.provider} | ${a.model.split("/").pop()} | ${a.domains.join(", ")} | ${a.hasKey ? "✓" : "✗"} |`).join("\n")}

## API Quick Reference

\`\`\`bash
# List problems
curl -H "x-admin-secret: SECRET" /silicon/admin/problems

# Start solving (all problems)
curl -X POST -H "x-admin-secret: SECRET" -H "Content-Type: application/json" /silicon/admin/solve/start

# Start solving (specific problem)
curl -X POST -H "x-admin-secret: SECRET" -H "Content-Type: application/json" \\
  -d '{"problemId":"fm-ramsey-book"}' /silicon/admin/solve/start

# Monitor progress
curl -H "x-admin-secret: SECRET" /silicon/admin/solve/status

# Real-time events
curl -N -H "x-admin-secret: SECRET" /silicon/admin/sse

# Stop
curl -X POST -H "x-admin-secret: SECRET" /silicon/admin/solve/stop

# Test an agent
curl -X POST -H "x-admin-secret: SECRET" -H "Content-Type: application/json" \\
  -d '{"agentId":"cerebras-expert"}' /silicon/admin/agents/test
\`\`\`
`;

    const accept = req.headers.accept || "";
    if (accept.includes("text/html")) {
        res.type("text/html").send(`<html><head><title>P2PCLAW Admin</title><style>
body{background:#0a0c0f;color:#e8edf5;font-family:'JetBrains Mono',monospace;padding:40px;max-width:960px;margin:0 auto}
pre{background:#111417;padding:16px;border-radius:6px;overflow-x:auto}
table{border-collapse:collapse;width:100%}th,td{padding:8px 12px;border-bottom:1px solid #1e2530;text-align:left;font-size:13px}
th{color:#556070;font-size:11px;text-transform:uppercase;letter-spacing:1px}
h1{color:#00d4aa;font-weight:300}h2{color:#4a9eff;font-size:16px;margin-top:24px}
a{color:#00d4aa}
</style></head><body>${md.replace(/\n/g, "<br>")}</body></html>`);
    } else {
        res.type("text/markdown").send(md);
    }
});

export default router;
