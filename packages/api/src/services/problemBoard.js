/**
 * P2PCLAW Open Problem Solver — Problem Board
 * =============================================
 * Static catalog of open mathematical problems from Erdős Problems and FrontierMath.
 * Runtime state tracks solve progress per problem.
 *
 * Source: papers/P2PCLAW_Math_Solver_Plan.html
 */

// ── Problem Catalog ─────────────────────────────────────────────────────────

export const PROBLEM_CATALOG = [
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
    },
    {
        id: "fm-diophantine-small",
        source: "FrontierMath",
        category: "Number Theory",
        difficulty: "solid_result",
        title: "Small Diophantine Equations — Infinitely Many Solutions",
        description:
            "Prove that certain 'small' Diophantine equations have infinitely many solutions. " +
            "Added February 24, 2026. Algorithm must work for a challenge set of integers. " +
            "Contributor undisclosed.",
        type: "proof",
        verifiable_programmatically: true,
        recommended: false,
        priority: 2,
        domains_needed: ["number_theory", "algebra", "computation"],
        arxiv_search_terms: [
            "small Diophantine equations infinite solutions",
            "Diophantine equation algorithmic solvability",
            "parametric families Diophantine",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    {
        id: "fm-galois-m23",
        source: "FrontierMath",
        category: "Number Theory / Algebra",
        difficulty: "major_advance",
        title: "Inverse Galois Problem for M₂₃",
        description:
            "Find a degree-23 polynomial in Z[x] whose splitting field over Q has Galois group M₂₃. " +
            "Last sporadic simple group for which no construction is known. " +
            "Contributor: Daniel Litt (Toronto). Human time-to-solve estimated: 1–10 years.",
        type: "construction",
        verifiable_programmatically: true,
        recommended: false,
        priority: 3,
        domains_needed: ["algebra", "number_theory", "group_theory"],
        arxiv_search_terms: [
            "inverse Galois problem Mathieu group M23",
            "sporadic simple group polynomial realization",
            "degree 23 polynomial Galois group",
        ],
        external_url: "https://epoch.ai/frontiermath/open-problems",
    },
    {
        id: "erdos-additive-combinatorics",
        source: "Erdos",
        category: "Combinatorics / Additive Number Theory",
        difficulty: "varies",
        title: "Erdős Open Problems — Additive Combinatorics",
        description:
            "Open problems from erdosproblems.com in combinatorics and additive number theory. " +
            "~20 resolved with AI involvement since Nov 2025. Community-driven, no verifier fee. " +
            "Maintained by Thomas Bloom (Bristol). Terence Tao is informal arbiter.",
        type: "proof",
        verifiable_programmatically: false,
        recommended: true,
        priority: 1,
        domains_needed: ["combinatorics", "number_theory", "analysis"],
        arxiv_search_terms: [
            "Erdos conjecture combinatorics AI",
            "additive number theory open problem",
            "Erdos problem resolved 2025 2026",
        ],
        external_url: "https://www.erdosproblems.com",
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
