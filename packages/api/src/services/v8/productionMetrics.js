/**
 * P2PCLAW v8 — GET /metrics/production (CONTRACT.md section 2)
 * =================================================================
 */

import { lifecycleStage } from './lifecycle.js';

const MAX_EVENTS = 5000;

/**
 * EventLog — ring buffer of {kind, at} events.
 */
export class EventLog {
    constructor(maxSize = MAX_EVENTS) {
        this.maxSize = maxSize;
        this.events = [];
    }

    record(kind, at = Date.now()) {
        this.events.push({ kind, at });
        if (this.events.length > this.maxSize) {
            this.events.splice(0, this.events.length - this.maxSize);
        }
    }

    since(ms) {
        const cutoff = Date.now() - ms;
        return this.events.filter((e) => e.at >= cutoff);
    }
}

function parseGranularScores(paper) {
    const gs = paper && paper.granular_scores;
    if (!gs) return null;
    if (typeof gs === 'string') {
        try {
            return JSON.parse(gs);
        } catch {
            return null;
        }
    }
    return gs;
}

function overallScore(paper) {
    const gs = parseGranularScores(paper);
    if (gs && typeof gs.overall === 'number') return gs.overall;
    if (typeof paper.score === 'number') return paper.score;
    return null;
}

function isSimulatedAgent(agent, simulatedIds) {
    if (!agent) return false;
    if (agent.type === 'SIMULATED') return true;
    if (simulatedIds && simulatedIds.has && simulatedIds.has(agent.id)) return true;
    return false;
}

function buildHistogram(scores) {
    const bins = [];
    for (let i = 0; i < 10; i++) {
        bins.push({ bin: `${i}-${i + 1}`, count: 0 });
    }
    for (const s of scores) {
        if (typeof s !== 'number' || Number.isNaN(s)) continue;
        let idx = Math.floor(s);
        if (idx < 0) idx = 0;
        if (idx > 9) idx = 9; // score of exactly 10 falls in the top bin
        bins[idx].count++;
    }
    return bins;
}

function mean(nums) {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums) {
    if (nums.length === 0) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
}

const LIMITATIONS = [
    'Small agent population: metrics may not generalize statistically.',
    'Free-tier judge availability varies and may affect judge_count per paper over time.',
    'No human baseline yet for comparison against LLM judge scores.',
    'Lean 4 verification is structural (proof-checked only when verification_mode is lean4); otherwise verification is heuristic/structural, not a formal proof.'
];

/**
 * computeProductionMetrics({papers, agents, simulatedIds, events, judgesConfigured, podiumIds, storageConfig, now})
 * -> exact CONTRACT /metrics/production shape.
 */
export function computeProductionMetrics({
    papers = [],
    agents = [],
    simulatedIds = new Set(),
    events = [],
    judgesConfigured = 0,
    podiumIds = new Set(),
    storageConfig = {},
    now = Date.now()
} = {}) {
    const generatedAt = new Date(now).toISOString();

    // agents
    const totalAgents = agents.length;
    const simulatedCount = agents.filter((a) => isSimulatedAgent(a, simulatedIds)).length;
    const realCount = totalAgents - simulatedCount;

    // papers
    const totalPapers = papers.length;
    const lifecycleCounts = { MEMPOOL: 0, VERIFIED: 0, PROMOTED: 0, PODIUM: 0, CANONICAL: 0 };
    const wordCounts = [];
    const scores = [];
    const alphas = [];
    const judgeCounts = [];
    const recentJudges = new Set();

    for (const paper of papers) {
        const stage = lifecycleStage(paper, { podiumIds });
        if (lifecycleCounts[stage] !== undefined) lifecycleCounts[stage]++;

        if (typeof paper.word_count === 'number') wordCounts.push(paper.word_count);

        const overall = overallScore(paper);
        if (typeof overall === 'number' && !Number.isNaN(overall)) scores.push(overall);

        const gs = parseGranularScores(paper);
        const alpha = gs && gs.inter_judge_agreement && typeof gs.inter_judge_agreement.alpha === 'number' ? gs.inter_judge_agreement.alpha : null;
        if (alpha !== null) alphas.push(alpha);

        // Judges actually seen on scored papers (not merely configured).
        if (gs) {
            const judgeList = Array.isArray(gs.judges) ? gs.judges : [];
            const count = typeof gs.judge_count === 'number' ? gs.judge_count : judgeList.length;
            if (count > 0) judgeCounts.push(count);
            const scoredAt = gs.scored_at ? Date.parse(gs.scored_at) : NaN;
            if (!Number.isNaN(scoredAt) && now - scoredAt <= 24 * 3600 * 1000) {
                for (const j of judgeList) recentJudges.add(j);
            }
        }
    }

    const mempoolCount = papers.filter((p) => p.status === 'MEMPOOL').length;
    const verifiedCount = lifecycleCounts.VERIFIED + lifecycleCounts.PROMOTED + lifecycleCounts.PODIUM + lifecycleCounts.CANONICAL;
    const promotedCount = lifecycleCounts.PROMOTED + lifecycleCounts.PODIUM + lifecycleCounts.CANONICAL;

    const wordCountStats =
        wordCounts.length > 0
            ? { min: Math.min(...wordCounts), max: Math.max(...wordCounts), mean: Math.round(mean(wordCounts)) }
            : { min: 0, max: 0, mean: 0 };

    const scoreStats = {
        n: scores.length,
        min: scores.length > 0 ? Math.min(...scores) : 0,
        max: scores.length > 0 ? Math.max(...scores) : 0,
        mean: scores.length > 0 ? Math.round(mean(scores) * 100) / 100 : 0,
        median: scores.length > 0 ? Math.round(median(scores) * 100) / 100 : 0,
        histogram: buildHistogram(scores)
    };

    const interJudgeAlphaStats = {
        n: alphas.length,
        // null, not 0: with no scored papers there is no agreement to report.
        mean: alphas.length > 0 ? Math.round(mean(alphas) * 100) / 100 : null
    };

    // judges
    const observedRecent = recentJudges.size;
    const meanJudgesPerPaper = judgeCounts.length > 0 ? Math.round(mean(judgeCounts) * 100) / 100 : null;

    // publishing (window 24h)
    const windowHours = 24;
    const windowMs = windowHours * 3600 * 1000;
    const windowEvents = events.filter((e) => now - e.at <= windowMs);
    const attempts = windowEvents.filter((e) => e.kind === 'publish_attempt').length;
    const accepted = windowEvents.filter((e) => e.kind === 'publish_accepted').length;
    const rejected = windowEvents.filter((e) => e.kind === 'publish_rejected').length;
    const failureRate = attempts > 0 ? Math.round((rejected / attempts) * 100) / 100 : 0;

    // tribunal (window 24h)
    const tribunalSessions = windowEvents.filter((e) => e.kind === 'tribunal_session').length;
    const tribunalPassed = windowEvents.filter((e) => e.kind === 'tribunal_pass').length;
    const passRate = tribunalSessions > 0 ? Math.round((tribunalPassed / tribunalSessions) * 100) / 100 : 0;

    // storage tiers
    const tierNames = ['memory', 'gun', 'r2', 'github', 'volume'];
    const storageTiers = tierNames.map((tier) => ({ tier, configured: Boolean(storageConfig[tier]) }));

    return {
        generated_at: generatedAt,
        agents: { total: totalAgents, real: realCount, simulated: simulatedCount },
        papers: {
            total: totalPapers,
            mempool: mempoolCount,
            verified: verifiedCount,
            promoted: promotedCount,
            lifecycle: lifecycleCounts,
            word_count: wordCountStats,
            score: scoreStats,
            inter_judge_alpha: interJudgeAlphaStats
        },
        judges: {
            configured: judgesConfigured,
            observed_recent: observedRecent,
            mean_per_paper: meanJudgesPerPaper
        },
        publishing: {
            window_hours: windowHours,
            attempts,
            accepted,
            rejected,
            failure_rate: failureRate
        },
        tribunal: {
            window_hours: windowHours,
            sessions: tribunalSessions,
            passed: tribunalPassed,
            pass_rate: passRate
        },
        storage_tiers: storageTiers,
        limitations: LIMITATIONS
    };
}
