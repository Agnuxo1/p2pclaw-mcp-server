/**
 * P2PCLAW Surreal Number Forms
 * =============================
 * Conway surreal numbers for agent knowledge representation.
 *
 * Each paper/finding gets a surreal position {L|R} representing its place
 * in the knowledge ordering. Agent memory is a collection of surreal forms,
 * composable via surreal arithmetic.
 *
 * Core operations:
 *   - create(L, R) → new surreal form
 *   - birthday(x)  → depth of construction (complexity measure)
 *   - compare(a, b) → ordering relation
 *   - add(a, b)     → surreal addition (knowledge composition)
 *   - multiply(a, b) → surreal multiplication
 *   - negate(a)      → surreal negation
 *
 * Reference: Conway, J.H. "On Numbers and Games" (1976)
 */

// ── Surreal Number representation ──────────────────────────────────────────

/**
 * A surreal number is {L | R} where L and R are sets of surreal numbers
 * with every element of L strictly less than every element of R.
 *
 * Canonical forms:
 *   0   = { | }           (birthday 0)
 *   1   = { 0 | }         (birthday 1)
 *  -1   = { | 0 }         (birthday 1)
 *   1/2 = { 0 | 1 }       (birthday 2)
 *   2   = { 1 | }         (birthday 2)
 */

const ZERO  = Object.freeze({ L: [], R: [], _id: '0', _val: 0 });
const ONE   = Object.freeze({ L: [ZERO], R: [], _id: '1', _val: 1 });
const NEG1  = Object.freeze({ L: [], R: [ZERO], _id: '-1', _val: -1 });
const HALF  = Object.freeze({ L: [ZERO], R: [ONE], _id: '1/2', _val: 0.5 });
const TWO   = Object.freeze({ L: [ONE], R: [], _id: '2', _val: 2 });

/**
 * Create a surreal number from left and right sets.
 * Validates the surreal number condition: every xL < every xR.
 */
export function create(L = [], R = [], meta = {}) {
    // Validate: every L element must be < every R element
    for (const l of L) {
        for (const r of R) {
            if (!lessThan(l, r)) {
                throw new Error(`Invalid surreal form: L element ${stringify(l)} is not < R element ${stringify(r)}`);
            }
        }
    }

    const form = {
        L: [...L],
        R: [...R],
        _id: meta.id || null,
        _val: meta.val !== undefined ? meta.val : computeValue(L, R),
        _meta: meta,
    };

    return form;
}


// ── Comparison operations ─────────────────────────────────────────────────

/**
 * x <= y iff:
 *   - no xL >= y  (no left option of x is >= y)
 *   - no yR <= x  (no right option of y is <= x)
 */
export function leq(x, y) {
    // Use cached values for efficiency when available
    if (x._val !== undefined && y._val !== undefined) {
        return x._val <= y._val;
    }

    // Check: no xL >= y
    for (const xl of (x.L || [])) {
        if (!lessThan(xl, y)) return false;
    }
    // Check: no yR <= x
    for (const yr of (y.R || [])) {
        if (!lessThan(x, yr)) return false;
    }
    return true;
}

/**
 * x < y iff x <= y and NOT y <= x
 */
export function lessThan(x, y) {
    return leq(x, y) && !leq(y, x);
}

/**
 * x == y iff x <= y and y <= x
 */
export function equal(x, y) {
    return leq(x, y) && leq(y, x);
}

/**
 * Compare: returns -1, 0, or 1
 */
export function compare(a, b) {
    if (equal(a, b)) return 0;
    if (lessThan(a, b)) return -1;
    return 1;
}


// ── Arithmetic operations ─────────────────────────────────────────────────

/**
 * Negate: -x = { -xR | -xL }
 */
export function negate(x) {
    return create(
        (x.R || []).map(r => negate(r)),
        (x.L || []).map(l => negate(l)),
        { val: x._val !== undefined ? -x._val : undefined }
    );
}

/**
 * Add: x + y = { xL + y, x + yL | xR + y, x + yR }
 * Uses numeric shortcut when values are cached.
 */
export function add(x, y) {
    if (x._val !== undefined && y._val !== undefined) {
        return fromNumber(x._val + y._val);
    }

    const newL = [
        ...(x.L || []).map(xl => add(xl, y)),
        ...(y.L || []).map(yl => add(x, yl)),
    ];
    const newR = [
        ...(x.R || []).map(xr => add(xr, y)),
        ...(y.R || []).map(yr => add(x, yr)),
    ];

    return create(newL, newR, { val: (x._val ?? 0) + (y._val ?? 0) });
}

/**
 * Multiply: x * y (simplified via numeric values)
 */
export function multiply(x, y) {
    const xv = x._val ?? 0;
    const yv = y._val ?? 0;
    return fromNumber(xv * yv);
}


// ── Birthday function ─────────────────────────────────────────────────────

/**
 * birthday(x) = depth of construction = 1 + max(birthday of all options)
 * {|} has birthday 0.
 */
export function birthday(x, memo = new Map()) {
    if (memo.has(x)) return memo.get(x);

    const opts = [...(x.L || []), ...(x.R || [])];
    if (opts.length === 0) {
        memo.set(x, 0);
        return 0;
    }

    let maxB = -1;
    for (const o of opts) {
        const b = birthday(o, memo);
        if (b > maxB) maxB = b;
    }
    const result = maxB + 1;
    memo.set(x, result);
    return result;
}


// ── Conversion utilities ──────────────────────────────────────────────────

/**
 * Convert a rational number to a surreal form (dyadic rationals only for exact).
 */
export function fromNumber(n) {
    if (n === 0) return { ...ZERO };
    if (n === 1) return { ...ONE };
    if (n === -1) return { ...NEG1 };
    if (n === 0.5) return { ...HALF };
    if (n === 2) return { ...TWO };

    // General: construct via simplicity theorem
    if (n > 0) {
        const floor = Math.floor(n);
        if (n === floor) {
            // Integer: {n-1 | }
            return create([fromNumber(n - 1)], [], { val: n, id: String(n) });
        }
        // Fractional: binary search between floor and ceil
        return create([fromNumber(floor)], [fromNumber(Math.ceil(n))], { val: n });
    }
    // Negative: negate the positive
    return negate(fromNumber(-n));
}

/**
 * Compute the numeric value of a surreal form (approximation for display).
 */
function computeValue(L, R) {
    if (L.length === 0 && R.length === 0) return 0;

    const maxL = L.length > 0 ? Math.max(...L.map(l => l._val ?? 0)) : -Infinity;
    const minR = R.length > 0 ? Math.min(...R.map(r => r._val ?? 0)) : Infinity;

    if (maxL === -Infinity && minR === Infinity) return 0;
    if (maxL === -Infinity) return minR - 1;
    if (minR === Infinity) return maxL + 1;

    // Simplest number between maxL and minR
    return (maxL + minR) / 2;
}

/**
 * String representation of a surreal form.
 */
export function stringify(x) {
    if (x._id) return x._id;
    if (x._val !== undefined) return String(x._val);
    const ls = (x.L || []).map(stringify).join(',');
    const rs = (x.R || []).map(stringify).join(',');
    return `{${ls}|${rs}}`;
}


// ── Agent Knowledge as Surreal Forms ─────────────────────────────────────

/**
 * Create a surreal form representing an agent's knowledge state.
 * Each paper contributes to the agent's position in the knowledge ordering.
 *
 * @param {Object} agent - Agent data (papers_published, avg_score, etc.)
 * @returns {Object} Surreal form
 */
export function agentKnowledgeForm(agent) {
    const papers = agent.papers_published || 0;
    const score = agent.avg_score || 0;
    const validations = agent.validations_done || 0;

    // Knowledge position = papers + score_bonus + validation_bonus
    const position = papers + (score * 0.5) + (validations * 0.1);
    const form = fromNumber(Math.round(position * 4) / 4); // quantize to quarter-integers

    return {
        ...form,
        _meta: {
            agent_id: agent.id || agent.agent_id,
            papers,
            score,
            validations,
            position,
            created_at: new Date().toISOString(),
        },
    };
}

/**
 * Create a surreal form for a research paper.
 * Position determined by quality metrics.
 *
 * @param {Object} paper - Paper data (occam_score, citations, word_count, etc.)
 * @returns {Object} Surreal form
 */
export function paperSurrealForm(paper) {
    const occam = paper.occam_score || 0;
    const citations = paper.citation_count || 0;
    const verified = paper.verified ? 1 : 0;

    // Paper position in knowledge space
    const position = occam + (citations * 0.1) + (verified * 0.5);
    const form = fromNumber(Math.round(position * 4) / 4);

    return {
        ...form,
        _meta: {
            paper_id: paper.id || paper.paperId,
            title: (paper.title || '').substring(0, 100),
            occam,
            citations,
            verified,
            position,
        },
    };
}

/**
 * Compose two agents' knowledge using surreal addition.
 * The result represents the combined knowledge state.
 *
 * @param {Object} formA - Surreal form of agent A
 * @param {Object} formB - Surreal form of agent B
 * @returns {Object} Combined surreal form
 */
export function composeKnowledge(formA, formB) {
    const sum = add(formA, formB);
    return {
        ...sum,
        _meta: {
            composed_from: [formA._meta?.agent_id, formB._meta?.agent_id].filter(Boolean),
            composed_at: new Date().toISOString(),
            birthday_complexity: birthday(sum),
        },
    };
}

/**
 * Build a knowledge tree for an agent from their paper history.
 *
 * @param {string} agentId
 * @param {Array} papers - Agent's published papers
 * @returns {Object} Knowledge tree with surreal ordering
 */
export function buildKnowledgeTree(agentId, papers) {
    if (!papers || papers.length === 0) {
        return {
            agent_id: agentId,
            form: { ...ZERO, _meta: { agent_id: agentId } },
            papers: [],
            birthday: 0,
            position: 0,
        };
    }

    // Create surreal forms for each paper
    const paperForms = papers.map(p => paperSurrealForm(p));

    // Sort by position for ordering
    paperForms.sort((a, b) => compare(a, b));

    // Combine via addition
    let combined = paperForms[0];
    for (let i = 1; i < paperForms.length; i++) {
        combined = add(combined, paperForms[i]);
    }

    const b = birthday(combined);

    return {
        agent_id: agentId,
        form: combined,
        papers: paperForms.map(f => ({
            paper_id: f._meta?.paper_id,
            title: f._meta?.title,
            position: f._val,
        })),
        birthday: b,
        position: combined._val || 0,
    };
}


// ── Exports for API routes ───────────────────────────────────────────────

export const SURREAL_CONSTANTS = { ZERO, ONE, NEG1, HALF, TWO };
