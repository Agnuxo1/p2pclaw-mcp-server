/**
 * P2PCLAW Open Problem Solver — Problem Board
 * =============================================
 * Static catalog of open mathematical problems from FrontierMath (Epoch AI).
 * Runtime state tracks solve progress per problem.
 *
 * Source: https://epoch.ai/frontiermath/open-problems (verified 2026-04-07)
 */

// ── Solved Problem Reference (for expert learning) ────────────────────────
// The Ramsey Hypergraph problem was the FIRST open math problem solved by AI.
// This documentation is injected into expert research phases as transferable knowledge.

export const SOLVED_REFERENCE_RAMSEY_HYPERGRAPH = {
    problem: "A Ramsey-style Problem on Hypergraphs",
    url: "https://epoch.ai/frontiermath/open-problems/ramsey-hypergraphs",
    github: "https://github.com/math-inc/FrontierMathOpen-Hypergraphs",
    solved_by: "GPT-5.4 Pro (guided by Kevin Barreto & Liam Price)",
    verified_by: "Will Brian (problem contributor, UNC Charlotte)",
    date: "2026-03-26",
    result: "H(n) >= (26/25) * k_n for n >= 15",
    technique_summary:
        "RECURSIVE SUBSTITUTION CONSTRUCTION — The key insight was eliminating an inefficiency " +
        "in existing lower-bound constructions. The solution mirrors the intricacy of the upper-bound " +
        "construction, producing matching bounds. Technique: substitution hypergraphs replace vertices " +
        "with frames (support patterns) while preserving partition properties, allowing building larger " +
        "hypergraphs from smaller ones with controlled partition growth.",
    key_techniques: [
        "Recursive substitution: build large structures from smaller verified components",
        "Frame/support pattern abstraction: replace vertices while preserving key properties",
        "Matching upper and lower bounds: aim for tight characterization, not just one direction",
        "Systematic inefficiency elimination: analyze existing constructions for waste",
        "Computational verification: use code to check small cases before generalizing",
    ],
    verification_detail:
        "Formalized in Lean 4 (~6300 lines). Construction achieves H(20)>=65. " +
        "Also solved by: Opus 4.6 (1/4 attempts), Gemini 3.1 Pro (2/4), GPT-5.4 xhigh (2/4). " +
        "Failed by: GPT-5.2, Opus 4.5, Kimi K2.5.",
    lesson_for_experts:
        "The successful approach was NOT brute force. It identified a structural inefficiency in the " +
        "existing human proof and proposed a refined recursive construction. When attacking open problems: " +
        "(1) Study existing best constructions deeply, (2) Look for specific inefficiencies to eliminate, " +
        "(3) Try to match known upper bounds from below, (4) Verify computationally for small n first, " +
        "(5) Generalize from verified small cases to a uniform bound.",
};

// ── Problem Catalog ─────────────────────────────────────────────────────────

export const PROBLEM_CATALOG = [
    // ── Priority 1 — ATTACK FIRST ─────────────────────────────────────────────
    {
        id: "fm-ramsey-book",
        source: "FrontierMath",
        category: "Combinatorics",
        difficulty: "moderately_interesting",
        title: "Ramsey Number Construction: R(B_{n-1}, B_n) > 4n − 2",
        description:
            "Construct a graph showing the Ramsey number for book graphs exceeds 4n−2. " +
            "A construction problem — output is a concrete algorithm, not a proof. " +
            "Verifiable programmatically. Contributor: William J. Wesley (UC San Diego).",
        type: "construction",
        verifiable_programmatically: true,
        recommended: true,
        priority: 1,
        domains_needed: ["combinatorics", "graph_theory", "algorithms"],
        arxiv_search_terms: [
            "Ramsey number book graph lower bound",
            "R(B_n) construction algorithm",
            "book graph Ramsey extremal",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
        // The Ramsey Hypergraph problem (different from this one) was SOLVED by GPT-5.4 Pro.
        // This is the most directly related solved problem — same Ramsey theory domain.
        solved_reference: SOLVED_REFERENCE_RAMSEY_HYPERGRAPH,
    },
    // ── Priority 2 — Concrete construction, tractable ──────────────────────────
    {
        id: "fm-hadamard-668",
        source: "FrontierMath",
        category: "Combinatorics / Linear Algebra",
        difficulty: "solid_result",
        title: "Hadamard Matrices of Order 668",
        description:
            "Construct a Hadamard matrix of order 668, the smallest multiple of 4 for which " +
            "no Hadamard matrix is known. A concrete construction problem — output is the matrix itself. " +
            "Verifiable programmatically (check H·Hᵀ = 668·I). Classic open problem in combinatorial design theory.",
        type: "construction",
        verifiable_programmatically: true,
        recommended: true,
        priority: 2,
        domains_needed: ["combinatorics", "linear_algebra", "algorithms", "computation"],
        arxiv_search_terms: [
            "Hadamard matrix construction order 668",
            "Hadamard conjecture smallest unknown order",
            "combinatorial design Hadamard",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    // ── Priority 3 — Partially solved (6/9 remaining) ─────────────────────────
    {
        id: "fm-diophantine-finiteness",
        source: "FrontierMath",
        category: "Number Theory",
        difficulty: "solid_result",
        title: "Finiteness Problem for Diophantine Equations",
        description:
            "Determine finiteness or infiniteness of solutions for a set of Diophantine equations. " +
            "Originally 9 equations; 3 have been solved, 6 remain open. " +
            "Added February 24, 2026. Partially solved — each remaining equation is an independent challenge. " +
            "Verifiable programmatically.",
        type: "proof",
        verifiable_programmatically: true,
        recommended: false,
        priority: 3,
        domains_needed: ["number_theory", "algebra", "computation"],
        arxiv_search_terms: [
            "Diophantine equations finiteness decidability",
            "Hilbert tenth problem bounded degree",
            "Diophantine equation algorithmic solvability",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    // ── Priority 4 — Hard construction, Number Theory ──────────────────────────
    {
        id: "fm-galois-m23",
        source: "FrontierMath",
        category: "Number Theory",
        difficulty: "major_advance",
        title: "Inverse Galois Problem for M₂₃",
        description:
            "Find a degree-23 polynomial in Z[x] whose splitting field over Q has Galois group " +
            "isomorphic to the Mathieu group M₂₃. Last sporadic simple group for which no explicit " +
            "polynomial realization over Q is known. " +
            "Contributor: Daniel Litt (Toronto). Human time-to-solve estimated: 1–10 years.",
        type: "construction",
        verifiable_programmatically: true,
        recommended: false,
        priority: 4,
        domains_needed: ["number_theory", "algebra", "group_theory"],
        arxiv_search_terms: [
            "inverse Galois problem Mathieu group M23",
            "sporadic simple group polynomial realization",
            "degree 23 polynomial Galois group",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    // ── Priority 5 — Advanced, additive combinatorics ──────────────────────────
    {
        id: "fm-arithmetic-kakeya",
        source: "FrontierMath",
        category: "Combinatorics / Analysis",
        difficulty: "major_advance",
        title: "Arithmetic Kakeya Conjecture",
        description:
            "Prove or disprove the Arithmetic Kakeya Conjecture: a set containing arithmetic progressions " +
            "of every length must have Minkowski dimension 1. Connects additive combinatorics, harmonic " +
            "analysis, and geometric measure theory. Deep problem with connections to the classical " +
            "Kakeya conjecture in Euclidean geometry.",
        type: "proof",
        verifiable_programmatically: false,
        recommended: false,
        priority: 5,
        domains_needed: ["combinatorics", "analysis", "number_theory"],
        arxiv_search_terms: [
            "arithmetic Kakeya conjecture",
            "Kakeya set arithmetic progressions dimension",
            "additive combinatorics Kakeya Minkowski",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    // ── Priority 6 — Algebraic Geometry, KLT del Pezzo ─────────────────────────
    {
        id: "fm-klt-delpazzo-singularities",
        source: "FrontierMath",
        category: "Algebraic Geometry",
        difficulty: "major_advance",
        title: "Surface with High Number of Singularities (KLT del Pezzo)",
        description:
            "Construct a KLT del Pezzo surface with the maximum possible number of singularities, " +
            "or determine the sharp upper bound. Relates to the Minimal Model Program (MMP) and " +
            "classification of algebraic surfaces. Requires deep knowledge of singularity theory " +
            "and birational geometry.",
        type: "construction",
        verifiable_programmatically: false,
        recommended: false,
        priority: 6,
        domains_needed: ["algebraic_geometry", "algebra", "computation"],
        arxiv_search_terms: [
            "KLT del Pezzo surface singularities bound",
            "log terminal singularities surface maximum",
            "minimal model program del Pezzo surfaces",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    // ── Priority 7 — Very hard combinatorial design ────────────────────────────
    {
        id: "fm-large-steiner",
        source: "FrontierMath",
        category: "Combinatorics / Design Theory",
        difficulty: "major_advance",
        title: "Large Steiner Systems",
        description:
            "Construct Steiner systems S(t, k, n) for large parameters where existence is open. " +
            "Steiner triple systems are well-understood, but for t ≥ 4 very few constructions exist. " +
            "Peter Keevash proved existence asymptotically (2014), but explicit constructions for " +
            "specific parameters remain open. Extremely hard combinatorial design problem.",
        type: "construction",
        verifiable_programmatically: true,
        recommended: false,
        priority: 7,
        domains_needed: ["combinatorics", "algorithms", "computation"],
        arxiv_search_terms: [
            "Steiner system large parameters construction",
            "Steiner quadruple system explicit",
            "combinatorial design existence construction Keevash",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    // ── Priority 8 — DO NOT ATTACK NOW (too hard for current AI) ───────────────
    {
        id: "fm-unknotting-number",
        source: "FrontierMath",
        category: "Topology / Knot Theory",
        difficulty: "beyond_current_ai",
        title: "Unknotting Number = 1 Recognition",
        description:
            "Given a knot diagram, determine algorithmically whether the unknotting number is 1. " +
            "No known polynomial-time algorithm. Relates to 3-manifold topology and Heegaard Floer " +
            "homology. Estimated human time-to-solve: decades. DO NOT ATTACK — included for " +
            "completeness and future reference only.",
        type: "algorithm",
        verifiable_programmatically: true,
        recommended: false,
        priority: 8,
        domains_needed: ["topology", "algebra", "algorithms"],
        arxiv_search_terms: [
            "unknotting number recognition algorithm",
            "unknotting number one decidable",
            "knot invariant unknotting Heegaard Floer",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
        attack_note: "DO NOT ATTACK NOW — beyond current AI capabilities. Reserved for future.",
    },
];

// ── Runtime State ───────────────────────────────────────────────────────────

const problemStates = new Map();

function ensureState(problemId) {
    if (!problemStates.has(problemId)) {
        problemStates.set(problemId, {
            status: "idle",   // idle | active | solved | skipped
            attempts: 0,
            sessions: [],     // SolveSession[] history
        });
    }
    return problemStates.get(problemId);
}

export function getProblem(problemId) {
    const problem = PROBLEM_CATALOG.find(p => p.id === problemId);
    if (!problem) return null;
    return { ...problem, state: ensureState(problemId) };
}

export function getAllProblems() {
    return PROBLEM_CATALOG.map(p => ({
        ...p,
        state: ensureState(p.id),
    }));
}

export function getState(problemId) {
    return ensureState(problemId);
}

export function updateState(problemId, updates) {
    const state = ensureState(problemId);
    Object.assign(state, updates);
    return state;
}

export function addSession(problemId, session) {
    const state = ensureState(problemId);
    state.sessions.push(session);
    // Cap history at 50 sessions per problem
    if (state.sessions.length > 50) {
        state.sessions = state.sessions.slice(-50);
    }
    return state;
}

export function resetProblem(problemId) {
    problemStates.set(problemId, {
        status: "idle",
        attempts: 0,
        sessions: [],
    });
}

export function getAllHistory() {
    const history = [];
    for (const problem of PROBLEM_CATALOG) {
        const state = ensureState(problem.id);
        for (const session of state.sessions) {
            history.push({ problemId: problem.id, problemTitle: problem.title, ...session });
        }
    }
    return history.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}
