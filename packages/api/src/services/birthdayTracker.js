/**
 * P2PCLAW Birthday Tracker
 * =========================
 * Tracks surreal number birthday complexity across the agent network.
 * Birthday = depth of surreal construction = quality/complexity signal.
 *
 * Higher birthday → more complex knowledge structure → higher quality research.
 *
 * API:
 *   - trackPaper(agentId, paperId, paperData)
 *   - getAgentTree(agentId)
 *   - getNetworkLattice()
 *   - composeAgents(agentIdA, agentIdB)
 */

import {
    buildKnowledgeTree,
    composeKnowledge,
    agentKnowledgeForm,
    birthday,
    compare,
    stringify,
    SURREAL_CONSTANTS,
} from './surrealForms.js';

// ── In-memory state ───────────────────────────────────────────────────────

const agentTrees = new Map();   // agentId → { form, papers[], birthday, position }
const paperForms = new Map();   // paperId → surreal form
const compositionCache = new Map(); // "a+b" → composed form

const MAX_AGENTS = 200;
const MAX_PAPERS_PER_AGENT = 50;

// ── Core tracking ─────────────────────────────────────────────────────────

/**
 * Track a new paper publication and update the agent's knowledge tree.
 */
export function trackPaper(agentId, paperId, paperData) {
    if (!agentId || !paperId) return null;

    // Get or create agent tree
    let tree = agentTrees.get(agentId);
    const papers = tree ? [...tree.papers] : [];

    // Add new paper (prevent duplicates)
    if (!papers.find(p => p.paper_id === paperId)) {
        papers.push({
            paper_id: paperId,
            title: (paperData.title || '').substring(0, 100),
            occam_score: paperData.occam_score || 0,
            citation_count: paperData.citation_count || 0,
            verified: !!paperData.verified,
            timestamp: paperData.timestamp || Date.now(),
        });
    }

    // Limit papers per agent
    if (papers.length > MAX_PAPERS_PER_AGENT) {
        papers.splice(0, papers.length - MAX_PAPERS_PER_AGENT);
    }

    // Rebuild knowledge tree
    tree = buildKnowledgeTree(agentId, papers);
    agentTrees.set(agentId, tree);

    // Trim if too many agents
    if (agentTrees.size > MAX_AGENTS) {
        const oldest = agentTrees.keys().next().value;
        agentTrees.delete(oldest);
    }

    // Clear composition cache (stale after update)
    compositionCache.clear();

    return tree;
}

/**
 * Get an agent's current knowledge tree.
 */
export function getAgentTree(agentId) {
    return agentTrees.get(agentId) || null;
}

/**
 * Get all agent trees for the network lattice view.
 */
export function getNetworkLattice() {
    const agents = [];

    for (const [agentId, tree] of agentTrees) {
        agents.push({
            agent_id: agentId,
            birthday: tree.birthday,
            position: tree.position,
            paper_count: tree.papers.length,
            form_string: tree.form ? stringify(tree.form) : '0',
        });
    }

    // Sort by position (surreal ordering)
    agents.sort((a, b) => a.position - b.position);

    return {
        agents,
        total_agents: agents.length,
        max_birthday: agents.reduce((m, a) => Math.max(m, a.birthday), 0),
        total_knowledge_position: agents.reduce((s, a) => s + a.position, 0),
        timestamp: new Date().toISOString(),
    };
}

/**
 * Compose two agents' knowledge trees.
 * Returns the combined surreal form representing joint knowledge.
 */
export function composeAgents(agentIdA, agentIdB) {
    const cacheKey = [agentIdA, agentIdB].sort().join('+');
    if (compositionCache.has(cacheKey)) {
        return compositionCache.get(cacheKey);
    }

    const treeA = agentTrees.get(agentIdA);
    const treeB = agentTrees.get(agentIdB);

    if (!treeA || !treeB) {
        return {
            error: `Agent ${!treeA ? agentIdA : agentIdB} has no knowledge tree`,
        };
    }

    const composed = composeKnowledge(treeA.form, treeB.form);
    const result = {
        agents: [agentIdA, agentIdB],
        combined_position: composed._val || 0,
        combined_birthday: birthday(composed),
        agent_a: { position: treeA.position, birthday: treeA.birthday, papers: treeA.papers.length },
        agent_b: { position: treeB.position, birthday: treeB.birthday, papers: treeB.papers.length },
        form_string: stringify(composed),
        composed_at: new Date().toISOString(),
    };

    compositionCache.set(cacheKey, result);
    return result;
}

/**
 * Get birthday complexity as a quality signal for paper scoring.
 * Higher birthday = more complex = potentially higher quality.
 *
 * @param {string} agentId
 * @returns {number} Birthday-based quality bonus [0, 0.15]
 */
export function birthdayQualityBonus(agentId) {
    const tree = agentTrees.get(agentId);
    if (!tree) return 0;

    // birthday 0 → 0, birthday 1 → 0.03, birthday 5+ → 0.15
    return Math.min(0.15, tree.birthday * 0.03);
}
