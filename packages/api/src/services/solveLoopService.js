/**
 * P2PCLAW Open Problem Solver — Solve Loop Service
 * ==================================================
 * Async orchestrator that drives the full solve cycle:
 *   SELECT → PLAN → RESEARCH → EXPERIMENT → VERIFY → HIVE → THINK-TANK → RETRY
 *
 * Only one solve loop runs at a time. The loop is launched from
 * POST /silicon/admin/solve/start and can be stopped via /solve/stop.
 */

import crypto from "crypto";
import {
    PROBLEM_CATALOG, getProblem, getState, updateState, addSession,
    SOLVED_REFERENCE_RAMSEY_HYPERGRAPH,
} from "./problemBoard.js";
import {
    callExpertAgent, selectBestAgent, selectAlternateAgent,
    selectThinkTankAgents,
} from "./expertAgentService.js";
import { db } from "../config/gun.js";
import { gunSafe } from "../utils/gunUtils.js";

// ── Module State ────────────────────────────────────────────────────────────

let activeSolveLoop = null;   // { running, session, abortController, startedAt }
const sseClients = new Set(); // SSE connections for real-time events

export function getActiveSolveLoop() { return activeSolveLoop; }
export function getSseClients() { return sseClients; }

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const THINK_TANK_THRESHOLD = 2;       // trigger think-tank after N failed attempts
const INTER_LLM_DELAY_MS = 2000;      // delay between LLM calls
const INTER_ARXIV_DELAY_MS = 3000;    // delay between arXiv calls
const MAX_CODE_ITERATIONS = 3;        // max code→run→refine cycles per experiment
const API_BASE = `http://localhost:${process.env.PORT || 3000}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sessionId() {
    return `solve-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function log(session, phase, message) {
    const entry = { ts: Date.now(), phase, message };
    session.logs.push(entry);
    // Cap logs at 500 entries per session
    if (session.logs.length > 500) session.logs = session.logs.slice(-500);
    console.log(`[OPS][${phase}] ${message}`);
    // Push to SSE clients
    broadcastSSE({ type: "solve_progress", phase, message, sessionId: session.id, ts: entry.ts });
}

function broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try { client.write(payload); } catch { sseClients.delete(client); }
    }
}

function isAborted() {
    return !activeSolveLoop || !activeSolveLoop.running;
}

/**
 * Persist a completed session to Gun.js for durability across restarts.
 * Stored under: p2pclaw_ops_sessions_v1 → sessionId → {...}
 */
function persistSession(session) {
    try {
        const record = gunSafe({
            id: session.id,
            problemId: session.problemId,
            assignedAgent: session.assignedAgentName || session.assignedAgent,
            status: session.status,
            attempt: session.attempt,
            plan: (session.plan || "").slice(0, 10000),
            researchAnalysis: (session.researchAnalysis || "").slice(0, 10000),
            experiments_json: JSON.stringify((session.experiments || []).map(e => ({
                iteration: e.iteration, success: e.success,
                stdout: (e.stdout || "").slice(0, 2000),
                stderr: (e.stderr || "").slice(0, 500),
                execution_hash: e.execution_hash,
                code: (e.code || "").slice(0, 3000),
            }))),
            verification_json: JSON.stringify(session.verificationResult || null),
            hive_json: JSON.stringify(session.hiveConsultation || null),
            thinktank_json: JSON.stringify(session.thinkTankResult ? {
                proposals: (session.thinkTankResult.proposals || []).map(p => ({
                    agent: p.agent, proposal: (p.proposal || "").slice(0, 3000),
                })),
                synthesis: (session.thinkTankResult.synthesis || "").slice(0, 5000),
            } : null),
            logs_json: JSON.stringify((session.logs || []).slice(-100)),
            startedAt: session.startedAt,
            completedAt: session.completedAt || Date.now(),
            error: session.error || "",
        });
        db.get("p2pclaw_ops_sessions_v1").get(session.id).put(record);
        console.log(`[OPS] Session ${session.id} persisted to Gun.js`);
    } catch (err) {
        console.warn(`[OPS] Failed to persist session: ${err.message}`);
    }
}

async function fetchInternal(path, opts = {}) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Internal ${path} → ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
}

// ── Phase Implementations ───────────────────────────────────────────────────

async function phasePlan(session, problem, agent) {
    session.status = "planning";
    log(session, "PLAN", `Agent ${agent.name} creating solution plan for: ${problem.title}`);

    const messages = [
        {
            role: "system",
            content:
                "You are a world-class mathematical research expert. " +
                "You specialize in: " + agent.domains.join(", ") + ". " +
                "Your task is to create a detailed, actionable solution plan for an open mathematical problem. " +
                "Be rigorous and specific. Do NOT claim you can solve it — plan how to ATTEMPT it.",
        },
        {
            role: "user",
            content:
                `# Open Problem\n\n**Title:** ${problem.title}\n\n` +
                `**Category:** ${problem.category}\n**Type:** ${problem.type}\n**Difficulty:** ${problem.difficulty}\n\n` +
                `**Description:** ${problem.description}\n\n` +
                `**Source:** ${problem.source} — ${problem.external_url}\n\n` +
                `# Reference — How GPT-5.4 Pro Solved a Similar FrontierMath Problem\n\n` +
                `The Ramsey Hypergraph problem was the first open math problem solved by AI (2026-03-26).\n` +
                `**Key technique:** ${SOLVED_REFERENCE_RAMSEY_HYPERGRAPH.technique_summary}\n` +
                `**Lessons learned:**\n${SOLVED_REFERENCE_RAMSEY_HYPERGRAPH.key_techniques.map(t => `- ${t}`).join("\n")}\n` +
                `**Critical insight:** ${SOLVED_REFERENCE_RAMSEY_HYPERGRAPH.lesson_for_experts}\n\n` +
                `Apply these transferable strategies to THIS problem where relevant.\n\n` +
                `# Task\n\nCreate a structured solution plan with:\n` +
                `1. **Key mathematical concepts** needed (theorems, lemmas, tools)\n` +
                `2. **Promising approaches** (at least 3 different attack vectors)\n` +
                `3. **Computational experiments** to try (concrete algorithms with pseudocode)\n` +
                `4. **Verification strategy** — how to check if a candidate solution is correct\n` +
                `5. **Known partial results** to build upon\n\n` +
                `Format your response as structured text with clear sections.`,
        },
    ];

    const result = await callExpertAgent(agent.id, messages, { temperature: 0.5 });
    session.plan = result.text;
    log(session, "PLAN", `Plan created (${result.text.length} chars) by ${result.provider}`);
    return result.text;
}

async function phaseResearch(session, problem, agent, plan) {
    session.status = "researching";
    log(session, "RESEARCH", "Searching arXiv and P2PCLAW papers...");

    const allResults = [];

    // Search arXiv with each search term
    for (const term of problem.arxiv_search_terms.slice(0, 3)) {
        if (isAborted()) return allResults;
        try {
            const data = await fetchInternal(`/lab/search-arxiv?q=${encodeURIComponent(term)}`);
            allResults.push({ source: "arxiv", query: term, results: data.results || [] });
            log(session, "RESEARCH", `arXiv "${term}": ${(data.results || []).length} papers found`);
        } catch (err) {
            log(session, "RESEARCH", `arXiv search error for "${term}": ${err.message}`);
        }
        await sleep(INTER_ARXIV_DELAY_MS);
    }

    // Extract keywords from plan and search
    if (plan && plan.length > 50) {
        try {
            const planKeywords = plan
                .match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g) // Multi-word capitalized terms
                ?.slice(0, 3)
                ?.map(k => k.trim())
                .filter(k => k.length > 5 && k.length < 60) || [];

            for (const kw of planKeywords.slice(0, 2)) {
                if (isAborted()) return allResults;
                try {
                    const data = await fetchInternal(`/lab/search-arxiv?q=${encodeURIComponent(kw)}`);
                    allResults.push({ source: "arxiv-plan", query: kw, results: data.results || [] });
                    log(session, "RESEARCH", `arXiv plan-keyword "${kw}": ${(data.results || []).length} papers`);
                } catch { /* non-critical */ }
                await sleep(INTER_ARXIV_DELAY_MS);
            }
        } catch { /* keyword extraction is best-effort */ }
    }

    // Search existing P2PCLAW papers
    try {
        const kw = problem.category.split("/")[0].trim();
        const data = await fetchInternal(`/lab/search-papers?q=${encodeURIComponent(kw)}`);
        allResults.push({ source: "p2pclaw", query: kw, results: data.results || [] });
        log(session, "RESEARCH", `P2PCLAW papers "${kw}": ${(data.results || []).length} results`);
    } catch (err) {
        log(session, "RESEARCH", `P2PCLAW search error: ${err.message}`);
    }

    session.research = allResults;

    // Have the expert analyze the research
    await sleep(INTER_LLM_DELAY_MS);
    const researchSummary = allResults
        .flatMap(r => (r.results || []).map(p => `- ${p.title || p.arxiv_id || "untitled"}`))
        .slice(0, 20)
        .join("\n");

    if (researchSummary) {
        try {
            // Include reference to solved problems if available (transferable techniques)
            let solvedRef = "";
            const ref = problem.solved_reference || SOLVED_REFERENCE_RAMSEY_HYPERGRAPH;
            if (ref) {
                const refText = typeof ref === "string" ? ref : [
                    `**${ref.problem}** — Solved by ${ref.solved_by} (${ref.date})`,
                    `Result: ${ref.result}`,
                    `Technique: ${ref.technique_summary}`,
                    `Key lessons:\n${(ref.key_techniques || []).map(t => `  - ${t}`).join("\n")}`,
                    ref.lesson_for_experts,
                ].join("\n");
                solvedRef = `\n\n# Reference — Solved FrontierMath Problem (study for transferable techniques):\n${refText}\n`;
            }
            const analysis = await callExpertAgent(agent.id, [
                { role: "system", content: "You are a mathematical research expert. Analyze these related papers and identify the most relevant results for our problem." },
                { role: "user", content: `# Problem: ${problem.title}\n\n# Related Papers Found:\n${researchSummary}\n\n# Our Plan:\n${(plan || "").slice(0, 2000)}${solvedRef}\n\nIdentify the 3 most relevant papers and how they could help. Be specific about which theorems, lemmas, or techniques to use.` },
            ], { temperature: 0.3 });
            session.researchAnalysis = analysis.text;
            log(session, "RESEARCH", `Research analysis complete (${analysis.text.length} chars)`);
        } catch (err) {
            log(session, "RESEARCH", `Research analysis error: ${err.message}`);
        }
    }

    return allResults;
}

async function phaseExperiment(session, problem, agent, plan, research) {
    session.status = "experimenting";
    log(session, "EXPERIMENT", "Generating and running computational experiments...");

    const experiments = [];
    const researchContext = (session.researchAnalysis || "").slice(0, 3000);

    for (let iter = 0; iter < MAX_CODE_ITERATIONS; iter++) {
        if (isAborted()) return experiments;
        await sleep(INTER_LLM_DELAY_MS);

        const prevResults = experiments.map((e, i) =>
            `Iteration ${i + 1}: ${e.success ? "SUCCESS" : "FAILED"} — ${(e.stdout || e.stderr || "no output").slice(0, 500)}`
        ).join("\n\n");

        const codePrompt = iter === 0
            ? `# Problem: ${problem.title}\n\n# Plan:\n${(plan || "").slice(0, 2000)}\n\n# Research:\n${researchContext}\n\n` +
              `Write JavaScript code to computationally explore this problem. The code runs in a sandboxed environment with:\n` +
              `- Math, JSON, Array, Object, String, Number, Date, RegExp, Map, Set, crypto.randomBytes\n` +
              `- console.log() for output — max 50KB output, 5 second timeout\n` +
              `- NO require/import, NO fs, NO network access\n\n` +
              `Focus on: ${problem.type === "construction" ? "generating candidate constructions and verifying they satisfy the required properties" : "testing specific cases, searching for patterns, or generating counterexamples"}.\n\n` +
              `Return ONLY the JavaScript code, no markdown fences.`
            : `# Problem: ${problem.title}\n\n# Previous Results:\n${prevResults}\n\n` +
              `The previous code ${experiments[iter - 1]?.success ? "ran successfully but we need to go deeper" : "had errors that need fixing"}.\n\n` +
              `Write improved JavaScript code that builds on previous results. Fix any errors and extend the search.\n` +
              `Return ONLY the JavaScript code, no markdown fences.`;

        try {
            const codeResult = await callExpertAgent(agent.id, [
                { role: "system", content: "You are an expert computational mathematician. Write clean, efficient JavaScript code for mathematical exploration. Return ONLY code, no explanations." },
                { role: "user", content: codePrompt },
            ], { temperature: 0.3, maxTokens: 2048 });

            // Clean the code (remove markdown fences if present)
            let code = codeResult.text
                .replace(/^```(?:javascript|js)?\n?/gm, "")
                .replace(/\n?```$/gm, "")
                .trim();

            log(session, "EXPERIMENT", `Iteration ${iter + 1}: Generated ${code.length} chars of code`);

            // Execute via /lab/run-code
            try {
                const execResult = await fetchInternal("/lab/run-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code, language: "javascript" }),
                });

                experiments.push({
                    iteration: iter + 1,
                    code: code.slice(0, 5000),
                    success: execResult.success,
                    stdout: (execResult.stdout || "").slice(0, 5000),
                    stderr: (execResult.stderr || "").slice(0, 2000),
                    execution_ms: execResult.execution_ms,
                    execution_hash: execResult.execution_hash,
                });

                log(session, "EXPERIMENT", `Iteration ${iter + 1}: ${execResult.success ? "SUCCESS" : "FAILED"} (${execResult.execution_ms}ms)`);

                // If code failed, continue to next iteration for a fix
                if (!execResult.success) continue;
            } catch (execErr) {
                experiments.push({ iteration: iter + 1, code: code.slice(0, 5000), success: false, stderr: execErr.message });
                log(session, "EXPERIMENT", `Iteration ${iter + 1}: Execution error — ${execErr.message}`);
            }
        } catch (llmErr) {
            log(session, "EXPERIMENT", `Iteration ${iter + 1}: LLM error — ${llmErr.message}`);
            experiments.push({ iteration: iter + 1, success: false, stderr: `LLM error: ${llmErr.message}` });
        }
    }

    session.experiments = experiments;
    return experiments;
}

async function phaseVerify(session, problem, agent, experiments) {
    session.status = "verifying";
    log(session, "VERIFY", "Assessing results...");

    await sleep(INTER_LLM_DELAY_MS);

    const expSummary = (experiments || [])
        .map((e, i) => `Iteration ${i + 1} [${e.success ? "OK" : "FAIL"}]: ${(e.stdout || e.stderr || "no output").slice(0, 1000)}`)
        .join("\n\n");

    try {
        const assessment = await callExpertAgent(agent.id, [
            {
                role: "system",
                content:
                    "You are a rigorous mathematical reviewer. Assess whether computational experiments constitute progress toward solving an open problem. " +
                    "Be HONEST — do not claim success unless the evidence is strong. Most attempts at open problems fail; that is normal and expected.",
            },
            {
                role: "user",
                content:
                    `# Problem: ${problem.title}\n\n**Description:** ${problem.description}\n\n` +
                    `# Experimental Results:\n${expSummary || "No experiments completed."}\n\n` +
                    `# Plan:\n${(session.plan || "").slice(0, 1500)}\n\n` +
                    `# Assessment Required:\nRespond in this exact JSON format:\n` +
                    `{"confidence": <0-100>, "progress": "<none|partial|significant|solution>", ` +
                    `"reasoning": "<your assessment>", "next_steps": "<what to try next>"}`,
            },
        ], { temperature: 0.2 });

        // Parse assessment JSON
        let parsed = null;
        try {
            const jsonMatch = assessment.text.match(/\{[\s\S]*"confidence"[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch { /* JSON parse failure is OK, we handle it */ }

        session.verificationResult = {
            raw: assessment.text.slice(0, 3000),
            parsed,
            provider: assessment.provider,
        };

        const confidence = parsed?.confidence || 0;
        const progress = parsed?.progress || "none";
        log(session, "VERIFY", `Confidence: ${confidence}/100, Progress: ${progress}`);

        return { confidence, progress, nextSteps: parsed?.next_steps || "" };
    } catch (err) {
        log(session, "VERIFY", `Verification error: ${err.message}`);
        return { confidence: 0, progress: "none", nextSteps: "Retry with different approach" };
    }
}

async function phaseConsultHive(session, problem, agent) {
    session.status = "consulting_hive";
    log(session, "HIVE", "Consulting alternate expert and the hive...");

    await sleep(INTER_LLM_DELAY_MS);

    // Call an alternate expert
    const altAgent = selectAlternateAgent(problem.domains_needed, agent.id);
    log(session, "HIVE", `Consulting alternate expert: ${altAgent.name}`);

    try {
        const altResult = await callExpertAgent(altAgent.id, [
            {
                role: "system",
                content: "You are a mathematical research expert providing a fresh perspective on an unsolved problem. A colleague has attempted this problem and needs alternative approaches.",
            },
            {
                role: "user",
                content:
                    `# Problem: ${problem.title}\n\n**Description:** ${problem.description}\n\n` +
                    `# Previous Attempt Summary:\n` +
                    `- Plan: ${(session.plan || "").slice(0, 1000)}\n` +
                    `- Experiments: ${(session.experiments || []).length} iterations, ` +
                    `last result: ${session.experiments?.[session.experiments.length - 1]?.success ? "success" : "failed"}\n` +
                    `- Verification: ${session.verificationResult?.parsed?.progress || "unknown"} progress\n\n` +
                    `# Your Task:\nSuggest 2-3 COMPLETELY DIFFERENT approaches that the previous expert did not try. Be specific and actionable.`,
            },
        ], { temperature: 0.6 });

        session.hiveConsultation = {
            alternateAgent: altAgent.name,
            suggestion: altResult.text,
            provider: altResult.provider,
        };

        log(session, "HIVE", `Alternate expert ${altAgent.name} provided suggestions (${altResult.text.length} chars)`);
        return altResult.text;
    } catch (err) {
        log(session, "HIVE", `Hive consultation error: ${err.message}`);
        return null;
    }
}

async function phaseThinkTank(session, problem) {
    session.status = "think_tank";
    log(session, "THINK_TANK", "Convening all experts for collaborative brainstorming...");

    const tankAgents = selectThinkTankAgents(problem.domains_needed);
    log(session, "THINK_TANK", `${tankAgents.length} experts joining think-tank`);

    const attemptSummary = (session.logs || [])
        .filter(l => l.phase === "VERIFY" || l.phase === "HIVE")
        .map(l => l.message)
        .join("\n");

    const proposals = [];

    // Call each agent in sequence (with delays to avoid rate limits)
    for (const agent of tankAgents.slice(0, 5)) { // Cap at 5 to avoid excessive API calls
        if (isAborted()) break;
        await sleep(INTER_LLM_DELAY_MS);

        try {
            const result = await callExpertAgent(agent.id, [
                {
                    role: "system",
                    content:
                        `You are ${agent.name}, an expert in ${agent.domains.join(", ")}. ` +
                        "You are participating in a think-tank to find a new approach to an unsolved mathematical problem. " +
                        "All previous approaches have failed. Think creatively and propose something novel.",
                },
                {
                    role: "user",
                    content:
                        `# Problem: ${problem.title}\n\n**Description:** ${problem.description}\n\n` +
                        `# Failed Attempts Summary:\n${attemptSummary.slice(0, 2000)}\n\n` +
                        `# Your Unique Proposal:\nPropose a NOVEL approach that hasn't been tried. ` +
                        `Leverage your expertise in ${agent.domains.join(", ")}. Be specific — include:\n` +
                        `1. The core mathematical idea\n2. Why it might work where others failed\n3. Concrete first steps`,
                },
            ], { temperature: 0.7 });

            proposals.push({ agent: agent.name, proposal: result.text });
            log(session, "THINK_TANK", `${agent.name} proposed approach (${result.text.length} chars)`);
        } catch (err) {
            log(session, "THINK_TANK", `${agent.name} failed: ${err.message}`);
        }
    }

    // Synthesize proposals using the lead expert
    if (proposals.length > 1 && !isAborted()) {
        await sleep(INTER_LLM_DELAY_MS);
        const leadAgent = selectBestAgent(problem.domains_needed);

        try {
            const synthesis = await callExpertAgent(leadAgent.id, [
                {
                    role: "system",
                    content: "You are the lead researcher synthesizing multiple expert proposals into a single actionable plan.",
                },
                {
                    role: "user",
                    content:
                        `# Problem: ${problem.title}\n\n` +
                        `# Expert Proposals:\n\n` +
                        proposals.map((p, i) => `## Proposal ${i + 1} (${p.agent}):\n${p.proposal.slice(0, 1500)}`).join("\n\n") +
                        `\n\n# Synthesize:\nCombine the best elements of all proposals into a single coherent plan. Prioritize the most promising ideas.`,
                },
            ], { temperature: 0.4 });

            session.thinkTankResult = {
                proposals,
                synthesis: synthesis.text,
                provider: synthesis.provider,
            };

            log(session, "THINK_TANK", `Synthesis complete (${synthesis.text.length} chars)`);
            return synthesis.text;
        } catch (err) {
            log(session, "THINK_TANK", `Synthesis error: ${err.message}`);
        }
    }

    session.thinkTankResult = { proposals, synthesis: null };
    return proposals.map(p => p.proposal).join("\n\n---\n\n");
}

// ── Main Solve Loop ─────────────────────────────────────────────────────────

async function solveProblem(problem, state) {
    const agent = selectBestAgent(problem.domains_needed);
    const session = {
        id: sessionId(),
        problemId: problem.id,
        assignedAgent: agent.id,
        assignedAgentName: agent.name,
        status: "starting",
        attempt: state.attempts + 1,
        plan: null,
        research: [],
        researchAnalysis: null,
        experiments: [],
        verificationResult: null,
        hiveConsultation: null,
        thinkTankResult: null,
        logs: [],
        startedAt: Date.now(),
        completedAt: null,
        error: null,
    };

    if (activeSolveLoop) activeSolveLoop.session = session;
    updateState(problem.id, { status: "active", attempts: state.attempts + 1 });
    addSession(problem.id, session);
    log(session, "START", `Attempt ${session.attempt}/${MAX_ATTEMPTS} on "${problem.title}" led by ${agent.name}`);

    try {
        // PHASE 1: Plan
        const plan = await phasePlan(session, problem, agent);
        if (isAborted()) { session.status = "stopped"; return session; }

        // PHASE 2: Research
        await sleep(INTER_LLM_DELAY_MS);
        const research = await phaseResearch(session, problem, agent, plan);
        if (isAborted()) { session.status = "stopped"; return session; }

        // PHASE 3: Experiment
        await sleep(INTER_LLM_DELAY_MS);
        const experiments = await phaseExperiment(session, problem, agent, plan, research);
        if (isAborted()) { session.status = "stopped"; return session; }

        // PHASE 4: Verify
        await sleep(INTER_LLM_DELAY_MS);
        const verification = await phaseVerify(session, problem, agent, experiments);
        if (isAborted()) { session.status = "stopped"; return session; }

        // Check if solved
        if (verification.confidence >= 80 && verification.progress === "solution") {
            session.status = "completed";
            session.completedAt = Date.now();
            updateState(problem.id, { status: "solved" });
            log(session, "SOLVED", `Problem potentially solved! Confidence: ${verification.confidence}/100`);
            broadcastSSE({ type: "problem_solved", problemId: problem.id, confidence: verification.confidence });
            return session;
        }

        // PHASE 5: Consult Hive
        await sleep(INTER_LLM_DELAY_MS);
        await phaseConsultHive(session, problem, agent);
        if (isAborted()) { session.status = "stopped"; return session; }

        // PHASE 6: Think Tank (after THINK_TANK_THRESHOLD failed attempts)
        if (state.attempts + 1 >= THINK_TANK_THRESHOLD) {
            await sleep(INTER_LLM_DELAY_MS);
            const newPlan = await phaseThinkTank(session, problem);
            if (isAborted()) { session.status = "stopped"; return session; }

            // If think-tank produced a new plan, run one more experiment cycle with it
            if (newPlan && newPlan.length > 100) {
                log(session, "THINK_TANK", "Running experiment with think-tank synthesized plan...");
                session.plan = newPlan; // Override plan
                await sleep(INTER_LLM_DELAY_MS);
                const newExperiments = await phaseExperiment(session, problem, agent, newPlan, research);
                if (isAborted()) { session.status = "stopped"; return session; }

                await sleep(INTER_LLM_DELAY_MS);
                const reVerify = await phaseVerify(session, problem, agent, newExperiments);

                if (reVerify.confidence >= 80 && reVerify.progress === "solution") {
                    session.status = "completed";
                    session.completedAt = Date.now();
                    updateState(problem.id, { status: "solved" });
                    log(session, "SOLVED", `Think-tank approach succeeded! Confidence: ${reVerify.confidence}/100`);
                    broadcastSSE({ type: "problem_solved", problemId: problem.id, confidence: reVerify.confidence });
                    return session;
                }
            }
        }

        // Mark as failed for this attempt
        session.status = "failed";
        session.completedAt = Date.now();
        log(session, "FAILED", `Attempt ${session.attempt} did not solve the problem. Progress: ${verification.progress}`);

    } catch (err) {
        session.status = "error";
        session.error = err.message;
        session.completedAt = Date.now();
        log(session, "ERROR", `Unhandled error: ${err.message}`);
    }

    // Persist every completed/failed/error session to Gun.js
    persistSession(session);
    return session;
}

/**
 * Start the main solve loop. Iterates over problems by priority.
 * @param {string|null} targetProblemId - Optional: attack only this problem
 */
export async function startSolveLoop(targetProblemId = null) {
    if (activeSolveLoop && activeSolveLoop.running) {
        throw new Error("A solve loop is already running. Stop it first.");
    }

    const abortController = new AbortController();
    activeSolveLoop = { running: true, session: null, startedAt: Date.now(), abortController };

    broadcastSSE({ type: "solve_started", targetProblemId, ts: Date.now() });

    try {
        // Determine which problems to attack
        let problems;
        if (targetProblemId) {
            const p = getProblem(targetProblemId);
            if (!p) throw new Error(`Unknown problem: ${targetProblemId}`);
            problems = [p];
        } else {
            problems = PROBLEM_CATALOG
                .slice()
                .sort((a, b) => a.priority - b.priority);
        }

        for (const problem of problems) {
            if (isAborted()) break;

            // Skip problems marked as "do not attack"
            if (problem.attack_note) {
                console.log(`[OPS] Skipping ${problem.id} (${problem.attack_note})`);
                continue;
            }

            const state = getState(problem.id);
            if (state.status === "solved" || state.status === "skipped") {
                console.log(`[OPS] Skipping ${problem.id} (${state.status})`);
                continue;
            }

            // Attempt loop
            while (state.attempts < MAX_ATTEMPTS && !isAborted()) {
                const session = await solveProblem(problem, state);

                if (session.status === "completed") break; // Solved!
                if (session.status === "stopped") break;   // User stopped

                // Refresh state (attempts was incremented in solveProblem)
                if (state.attempts >= MAX_ATTEMPTS) {
                    updateState(problem.id, { status: "skipped" });
                    broadcastSSE({ type: "problem_skipped", problemId: problem.id, attempts: state.attempts });
                    console.log(`[OPS] Problem ${problem.id} skipped after ${MAX_ATTEMPTS} attempts`);
                    break;
                }

                // Brief pause between attempts
                await sleep(5000);
            }
        }

        broadcastSSE({ type: "solve_completed", ts: Date.now() });
    } catch (err) {
        broadcastSSE({ type: "solve_error", error: err.message, ts: Date.now() });
        console.error(`[OPS] Solve loop error: ${err.message}`);
    } finally {
        if (activeSolveLoop) activeSolveLoop.running = false;
    }
}

/**
 * Stop the running solve loop.
 */
export function stopSolveLoop() {
    if (!activeSolveLoop || !activeSolveLoop.running) {
        return { stopped: false, reason: "No active solve loop" };
    }
    activeSolveLoop.running = false;
    broadcastSSE({ type: "solve_stopped", ts: Date.now() });
    return { stopped: true };
}

/**
 * Get current solve loop status.
 */
export function getSolveStatus() {
    if (!activeSolveLoop) {
        return { running: false, message: "No solve loop has been started" };
    }

    const session = activeSolveLoop.session;
    return {
        running: activeSolveLoop.running,
        startedAt: activeSolveLoop.startedAt,
        uptime_ms: Date.now() - activeSolveLoop.startedAt,
        session: session ? {
            id: session.id,
            problemId: session.problemId,
            assignedAgent: session.assignedAgentName,
            status: session.status,
            attempt: session.attempt,
            phases_completed: [...new Set(session.logs.map(l => l.phase))],
            log_count: session.logs.length,
            last_log: session.logs[session.logs.length - 1] || null,
            recent_logs: session.logs.slice(-10),
        } : null,
    };
}
