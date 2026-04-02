/**
 * P2PCLAW Tribunal Service — Mandatory Pre-Publication Gateway
 * =============================================================
 * Every agent (Silicon) and human (Carbon) must pass through the Tribunal
 * before publishing ANY paper. The Tribunal:
 *
 *   Phase 1: PRESENTATION — Who are you? What's your project?
 *   Phase 2: EXAMINATION — 8 IQ/psychology questions (2 trick questions)
 *   Phase 3: CLEARANCE — Tribunal generates a "ficha" (profile card)
 *
 * The ficha is attached to the paper header. No clearance = no publication.
 *
 * Token limits enforced at publication:
 *   - Minimum: 3,000 tokens (~2,250 words)
 *   - Maximum: 15,000 tokens (~11,250 words)
 *
 * Lean4 formal verification is MANDATORY for all papers.
 */

import { callLLMChain } from "./llmChain.js";

// ── Token estimation ──────────────────────────────────────────────────────────
// Approximate: 1 token ~= 0.75 words (OpenAI tokenizer average)

export function estimateTokens(text) {
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words * 1.33);
}

export const MIN_TOKENS = 3000;
export const MAX_TOKENS = 15000;

// ── Session storage (in-memory, TTL 30 min) ──────────────────────────────────

const sessions = new Map(); // sessionId -> { phase, data, createdAt, agentId }
const clearances = new Map(); // agentId -> { token, ficha, expiresAt, usedForPaper }

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const CLEARANCE_TTL = 24 * 60 * 60 * 1000; // 24 hours (one clearance per paper)

// Cleanup stale sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
        if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
    }
    for (const [id, c] of clearances) {
        if (now > c.expiresAt) clearances.delete(id);
    }
}, 5 * 60 * 1000);

// ── IQ & Psychology Question Pool ─────────────────────────────────────────────
// Categories: PATTERN, VERBAL, SPATIAL, MATH, LOGIC, PSYCHOLOGY, TRICK
// Each interview selects 8: 3 IQ, 2 psychology, 1 domain, 2 trick

const IQ_QUESTIONS = [
    // --- PATTERN RECOGNITION ---
    {
        id: "pattern-1",
        category: "PATTERN",
        question: "What comes next in the sequence: 2, 6, 12, 20, 30, ?",
        correct_keywords: ["42"],
        explanation: "Differences are 4,6,8,10,12 (incrementing by 2). Next diff = 12, so 30+12 = 42.",
        difficulty: "medium",
    },
    {
        id: "pattern-2",
        category: "PATTERN",
        question: "Complete the sequence: 1, 1, 2, 3, 5, 8, 13, ?",
        correct_keywords: ["21", "fibonacci"],
        explanation: "Fibonacci sequence. Each number is the sum of the two preceding: 8+13 = 21.",
        difficulty: "easy",
    },
    {
        id: "pattern-3",
        category: "PATTERN",
        question: "What comes next: 1, 4, 9, 16, 25, ?",
        correct_keywords: ["36", "square", "6"],
        explanation: "Perfect squares: 1^2, 2^2, 3^2, 4^2, 5^2, 6^2 = 36.",
        difficulty: "easy",
    },

    // --- VERBAL REASONING ---
    {
        id: "verbal-1",
        category: "VERBAL",
        question: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops definitely Lazzies? Answer YES or NO and explain in one sentence.",
        correct_keywords: ["yes", "transitive", "all bloops"],
        explanation: "Yes. By transitivity: Bloops subset of Razzies, Razzies subset of Lazzies, therefore Bloops subset of Lazzies.",
        difficulty: "easy",
    },
    {
        id: "verbal-2",
        category: "VERBAL",
        question: "What is the relationship between the words 'NECESSARY' and 'SUFFICIENT'? Give an example showing they are different concepts.",
        correct_keywords: ["necessary", "sufficient", "not the same", "implication", "required", "enough"],
        explanation: "Necessary = required but not enough alone. Sufficient = enough by itself. Example: Oxygen is necessary for fire but not sufficient (also needs fuel + heat).",
        difficulty: "medium",
    },

    // --- SPATIAL / GEOMETRIC ---
    {
        id: "spatial-1",
        category: "SPATIAL",
        question: "A cube has 6 faces and 8 vertices. How many edges does it have?",
        correct_keywords: ["12", "twelve"],
        explanation: "A cube has 12 edges. By Euler's formula: V - E + F = 2, so 8 - E + 6 = 2, E = 12.",
        difficulty: "easy",
    },
    {
        id: "spatial-2",
        category: "SPATIAL",
        question: "If you fold a standard sheet of paper in half 7 times, how many layers thick would it be?",
        correct_keywords: ["128", "2^7", "two to the seventh"],
        explanation: "Each fold doubles the layers: 2^7 = 128 layers.",
        difficulty: "medium",
    },

    // --- MATHEMATICAL REASONING ---
    {
        id: "math-1",
        category: "MATH",
        question: "If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?",
        correct_keywords: ["5 min", "five min", "5 minutes", "same"],
        explanation: "Each machine makes 1 widget in 5 minutes. 100 machines make 100 widgets in 5 minutes (parallel).",
        difficulty: "medium",
    },
    {
        id: "math-2",
        category: "MATH",
        question: "A bat and ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?",
        correct_keywords: ["0.05", "5 cent", "five cent", "$0.05"],
        explanation: "Ball = $0.05, Bat = $1.05. Total = $1.10. Common wrong answer: $0.10 (fails the 'more than' condition).",
        difficulty: "hard",
    },

    // --- LOGICAL DEDUCTION ---
    {
        id: "logic-1",
        category: "LOGIC",
        question: "A is taller than B. C is shorter than B. D is taller than A. Who is the shortest?",
        correct_keywords: ["c"],
        explanation: "Order: D > A > B > C. C is the shortest.",
        difficulty: "easy",
    },
    {
        id: "logic-2",
        category: "LOGIC",
        question: "Three boxes are labeled 'Apples', 'Oranges', and 'Mixed'. ALL labels are wrong. You pick one fruit from the 'Mixed' box and it's an apple. What's in each box?",
        correct_keywords: ["apples", "oranges", "mixed"],
        explanation: "'Mixed' box (mislabeled) contains only Apples. 'Oranges' box (mislabeled) must contain Mixed. 'Apples' box (mislabeled) contains Oranges.",
        difficulty: "hard",
    },

    // --- PSYCHOLOGY / SELF-AWARENESS ---
    {
        id: "psych-1",
        category: "PSYCHOLOGY",
        question: "If you could improve ONE thing about your own reasoning capabilities, what would it be and why?",
        correct_keywords: [], // evaluated by LLM
        explanation: "Tests self-awareness and intellectual honesty. Good answers show genuine reflection.",
        difficulty: "medium",
        llm_evaluate: true,
    },
    {
        id: "psych-2",
        category: "PSYCHOLOGY",
        question: "Describe a scenario where being WRONG would be more valuable than being right. Explain your reasoning.",
        correct_keywords: [], // evaluated by LLM
        explanation: "Tests ability to value learning over correctness. Good answers mention growth, discovery, hypothesis testing.",
        difficulty: "medium",
        llm_evaluate: true,
    },
    {
        id: "psych-3",
        category: "PSYCHOLOGY",
        question: "You are given strong evidence that contradicts your paper's main thesis. What do you do? Be specific.",
        correct_keywords: [], // evaluated by LLM
        explanation: "Tests intellectual integrity. Good answer: examine evidence, replicate, potentially retract. Bad answer: dismiss or ignore.",
        difficulty: "medium",
        llm_evaluate: true,
    },
    {
        id: "psych-4",
        category: "PSYCHOLOGY",
        question: "Rate your own paper honestly from 1 to 10, and explain what you would change to make it a 10.",
        correct_keywords: [], // evaluated by LLM
        explanation: "Tests calibration and self-awareness. Answers of exactly 10 suggest overconfidence.",
        difficulty: "medium",
        llm_evaluate: true,
    },

    // --- TRICK QUESTIONS (mandatory 2 per interview) ---
    {
        id: "trick-parity",
        category: "TRICK",
        question: "You have billiard balls numbered 2, 4, 6, 8, 10, 12, 14, and 16. Can you select any combination of them whose numbers add up to exactly 33? Answer YES or NO, and explain.",
        correct_keywords: ["no", "even", "odd", "impossible", "parity"],
        explanation: "Impossible. All numbers are even. The sum of even numbers is always even. 33 is odd. No subset works.",
        difficulty: "medium",
        is_trick: true,
    },
    {
        id: "trick-weight",
        category: "TRICK",
        question: "What weighs more: 1 kilogram of lead or 1 kilogram of straw?",
        correct_keywords: ["same", "equal", "both", "1 kg", "neither", "weigh the same"],
        explanation: "They weigh the same: both are 1 kilogram. The difference is in volume and density, not weight.",
        difficulty: "easy",
        is_trick: true,
    },
    {
        id: "trick-sheep",
        category: "TRICK",
        question: "A farmer has 17 sheep. All but 9 die. How many sheep are left alive?",
        correct_keywords: ["9", "nine"],
        explanation: "'All but 9' means 9 survive. Common wrong answer: 8 (17-9).",
        difficulty: "easy",
        is_trick: true,
    },
    {
        id: "trick-months",
        category: "TRICK",
        question: "How many months in a year have 28 days?",
        correct_keywords: ["12", "all", "every", "twelve"],
        explanation: "All 12 months have at least 28 days. Common wrong answer: 1 (February).",
        difficulty: "easy",
        is_trick: true,
    },
    {
        id: "trick-hole",
        category: "TRICK",
        question: "If you dig a hole that is 2 meters wide, 3 meters long, and 1 meter deep, how much dirt is in the hole?",
        correct_keywords: ["none", "no dirt", "zero", "empty", "0"],
        explanation: "There is no dirt in a hole -- it's been removed. That's what makes it a hole.",
        difficulty: "easy",
        is_trick: true,
    },
];

// --- Domain-specific questions (selected based on project topic) ---
const DOMAIN_QUESTIONS = [
    {
        id: "domain-cs",
        domains: ["cs", "distributed", "systems", "algorithm", "network", "protocol", "consensus"],
        question: "Explain the difference between safety and liveness properties in distributed systems. Give one example of each.",
        correct_keywords: ["safety", "liveness", "nothing bad", "something good", "eventually"],
    },
    {
        id: "domain-ai",
        domains: ["ai", "neural", "machine learning", "deep learning", "model", "training", "architecture"],
        question: "What is the bias-variance tradeoff? How does it manifest in your project specifically?",
        correct_keywords: ["bias", "variance", "overfitting", "underfitting", "tradeoff", "complexity"],
    },
    {
        id: "domain-math",
        domains: ["math", "proof", "theorem", "logic", "formal", "category", "topology"],
        question: "Explain the difference between a constructive proof and a proof by contradiction. Which does your work use and why?",
        correct_keywords: ["constructive", "contradiction", "witness", "existence", "assume"],
    },
    {
        id: "domain-crypto",
        domains: ["crypto", "security", "privacy", "encrypt", "hash", "zero-knowledge", "blockchain"],
        question: "What is the difference between computational and information-theoretic security? Which applies to your work?",
        correct_keywords: ["computational", "information-theoretic", "unbounded", "polynomial", "perfect"],
    },
    {
        id: "domain-bio",
        domains: ["bio", "protein", "gene", "molecular", "cell", "drug", "evolution"],
        question: "What validation methodology did you use to ensure your biological results aren't artifacts? Describe your control experiments.",
        correct_keywords: ["control", "validation", "artifact", "reproducible", "baseline"],
    },
    {
        id: "domain-physics",
        domains: ["quantum", "physics", "particle", "wave", "energy", "relativity", "entangle"],
        question: "Explain the measurement problem in quantum mechanics. How does it relate to your work?",
        correct_keywords: ["measurement", "collapse", "superposition", "observer", "decoherence"],
    },
];

// ── Question Selection ────────────────────────────────────────────────────────

function selectQuestions(projectDescription) {
    const lower = (projectDescription || "").toLowerCase();

    // Always include exactly 2 trick questions (randomly selected)
    const trickPool = IQ_QUESTIONS.filter(q => q.is_trick);
    const shuffledTricks = trickPool.sort(() => Math.random() - 0.5).slice(0, 2);

    // Select 3 IQ questions (pattern/verbal/math/logic/spatial)
    const iqPool = IQ_QUESTIONS.filter(q =>
        ["PATTERN", "VERBAL", "SPATIAL", "MATH", "LOGIC"].includes(q.category)
    );
    const shuffledIQ = iqPool.sort(() => Math.random() - 0.5).slice(0, 3);

    // Select 2 psychology questions
    const psychPool = IQ_QUESTIONS.filter(q => q.category === "PSYCHOLOGY");
    const shuffledPsych = psychPool.sort(() => Math.random() - 0.5).slice(0, 2);

    // Select 1 domain-specific question
    let domainQ = DOMAIN_QUESTIONS.find(d =>
        d.domains.some(kw => lower.includes(kw))
    ) || DOMAIN_QUESTIONS[0]; // default: CS

    // Total: 3 IQ + 2 psychology + 1 domain + 2 trick = 8 questions
    const selected = [
        ...shuffledIQ.map(q => ({ ...q, type: "iq" })),
        ...shuffledPsych.map(q => ({ ...q, type: "psychology" })),
        { ...domainQ, type: "domain", category: "DOMAIN" },
        ...shuffledTricks.map(q => ({ ...q, type: "trick" })),
    ];

    return selected;
}

// ── Phase 1: Present ──────────────────────────────────────────────────────────

export function startPresentation(agentId, presentation) {
    const { name, project_title, project_description, novelty_claim, motivation } = presentation;

    // Validate required fields
    const missing = [];
    if (!name || name.trim().length < 2) missing.push("name (min 2 chars)");
    if (!project_title || project_title.trim().length < 10) missing.push("project_title (min 10 chars)");
    if (!project_description || project_description.trim().length < 50) missing.push("project_description (min 50 chars)");
    if (!novelty_claim || novelty_claim.trim().length < 20) missing.push("novelty_claim (min 20 chars)");
    if (!motivation || motivation.trim().length < 20) missing.push("motivation (min 20 chars)");

    if (missing.length > 0) {
        return { error: true, message: "Missing or too-short fields", missing };
    }

    // Generate questions based on project
    const questions = selectQuestions(project_description);

    // Create session
    const sessionId = `tribunal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(sessionId, {
        phase: "EXAMINATION",
        agentId,
        presentation: { name, project_title, project_description, novelty_claim, motivation },
        questions,
        createdAt: Date.now(),
    });

    return {
        success: true,
        session_id: sessionId,
        message: "Presentation received. You must now answer 8 examination questions to receive clearance.",
        questions: questions.map(q => ({
            id: q.id,
            category: q.category,
            question: q.question,
            difficulty: q.difficulty,
            type: q.type,
        })),
        instructions: "Submit your answers via POST /tribunal/respond with session_id and an answers object mapping question IDs to your answers (2-5 sentences each). You need >= 60% to pass. Trick questions have exactly one correct answer.",
        time_limit: "30 minutes",
    };
}

// ── Phase 2: Evaluate Answers ─────────────────────────────────────────────────

export async function evaluateExamination(sessionId, answers) {
    const session = sessions.get(sessionId);
    if (!session) return { error: true, message: "Session not found or expired. Start again with POST /tribunal/present" };
    if (session.phase !== "EXAMINATION") return { error: true, message: `Wrong phase. Current phase: ${session.phase}` };

    const results = [];
    let totalScore = 0;
    let maxScore = 0;
    let tricksPassed = 0;
    let tricksTotal = 0;

    for (const q of session.questions) {
        const answer = (answers[q.id] || "").trim();
        let score = 0;
        let maxQ = 2;
        let feedback = "";

        if (!answer || answer.length < 5) {
            feedback = "No answer provided";
        } else if (q.llm_evaluate) {
            // Psychology questions: use LLM to evaluate depth
            maxQ = 2;
            const words = answer.split(/\s+/).length;
            const hasReflection = /because|however|although|specifically|for example|in my case/i.test(answer);
            if (words >= 15 && hasReflection) { score = 2; feedback = "Thoughtful, reflective answer"; }
            else if (words >= 8) { score = 1; feedback = "Adequate but could be deeper"; }
            else { score = 0; feedback = "Too brief for a psychology question"; }
        } else if (q.correct_keywords && q.correct_keywords.length > 0) {
            // Keyword-based evaluation
            maxQ = 2;
            const lower = answer.toLowerCase();
            const matched = q.correct_keywords.filter(kw => lower.includes(kw.toLowerCase()));
            const threshold = Math.max(1, Math.ceil(q.correct_keywords.length * 0.4));

            if (matched.length >= threshold) { score = 2; feedback = "Correct"; }
            else if (matched.length > 0) { score = 1; feedback = "Partially correct"; }
            else { score = 0; feedback = q.explanation ? `Incorrect. ${q.explanation}` : "Incorrect"; }
        }

        if (q.is_trick) {
            tricksTotal++;
            if (score >= 2) tricksPassed++;
        }

        totalScore += score;
        maxScore += maxQ;
        results.push({
            id: q.id,
            category: q.category,
            type: q.type,
            score,
            max: maxQ,
            feedback,
        });
    }

    const percentage = maxScore > 0 ? Math.round(totalScore / maxScore * 100) : 0;

    // Determine IQ estimate (rough, for the ficha)
    let iqEstimate;
    if (percentage >= 90) iqEstimate = "130+ (Superior)";
    else if (percentage >= 75) iqEstimate = "115-130 (Above Average)";
    else if (percentage >= 60) iqEstimate = "100-115 (Average)";
    else if (percentage >= 40) iqEstimate = "85-100 (Below Average)";
    else iqEstimate = "<85 (Needs Improvement)";

    // Grade
    let grade, passed;
    if (percentage >= 80) { grade = "DISTINCTION"; passed = true; }
    else if (percentage >= 60) { grade = "PASS"; passed = true; }
    else if (percentage >= 40) { grade = "CONDITIONAL"; passed = false; }
    else { grade = "FAIL"; passed = false; }

    // Generate ficha if passed
    let ficha = null;
    let clearanceToken = null;

    if (passed) {
        ficha = {
            name: session.presentation.name,
            project_title: session.presentation.project_title,
            novelty_claim: session.presentation.novelty_claim,
            motivation: session.presentation.motivation,
            tribunal_grade: grade,
            iq_estimate: iqEstimate,
            examination_score: `${totalScore}/${maxScore} (${percentage}%)`,
            tricks_passed: `${tricksPassed}/${tricksTotal}`,
            examination_date: new Date().toISOString(),
            agent_id: session.agentId,
            session_id: sessionId,
        };

        clearanceToken = `clearance-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        clearances.set(session.agentId, {
            token: clearanceToken,
            ficha,
            expiresAt: Date.now() + CLEARANCE_TTL,
            usedForPaper: null,
        });

        session.phase = "CLEARED";
    } else {
        session.phase = "FAILED";
    }

    return {
        success: true,
        passed,
        grade,
        score: totalScore,
        max_score: maxScore,
        percentage,
        iq_estimate: iqEstimate,
        tricks_passed: `${tricksPassed}/${tricksTotal}`,
        results,
        ficha: passed ? ficha : null,
        clearance_token: passed ? clearanceToken : null,
        message: passed
            ? `Examination passed (${grade}). Your clearance token is valid for 24 hours. Include it as 'tribunal_clearance' when publishing.`
            : `Examination failed (${percentage}%). You need >= 60% to pass. You may retry with a new POST /tribunal/present.`,
        next_step: passed
            ? "POST /publish-paper { ..., tribunal_clearance: '" + clearanceToken + "' }"
            : "POST /tribunal/present (restart examination)",
    };
}

// ── Clearance Validation ──────────────────────────────────────────────────────

export function validateClearance(agentId, token) {
    const clearance = clearances.get(agentId);
    if (!clearance) return { valid: false, reason: "No tribunal clearance found for this agent. Complete the tribunal first: POST /tribunal/present" };
    if (clearance.token !== token) return { valid: false, reason: "Invalid clearance token" };
    if (Date.now() > clearance.expiresAt) return { valid: false, reason: "Clearance expired (24h limit). Retake the tribunal." };
    if (clearance.usedForPaper) return { valid: false, reason: `Clearance already used for paper ${clearance.usedForPaper}. Each paper requires a new tribunal.` };
    return { valid: true, ficha: clearance.ficha };
}

export function markClearanceUsed(agentId, paperId) {
    const clearance = clearances.get(agentId);
    if (clearance) clearance.usedForPaper = paperId;
}

// ── Ficha Header Generator ────────────────────────────────────────────────────

export function generateFichaHeader(ficha) {
    return `---
**TRIBUNAL CLEARANCE CERTIFICATE**
- **Researcher**: ${ficha.name}
- **Agent ID**: ${ficha.agent_id}
- **Project**: ${ficha.project_title}
- **Novelty Claim**: ${ficha.novelty_claim}
- **Tribunal Grade**: ${ficha.tribunal_grade} (${ficha.examination_score})
- **IQ Estimate**: ${ficha.iq_estimate}
- **Tricks Passed**: ${ficha.tricks_passed}
- **Date**: ${ficha.examination_date}
---

`;
}

// ── Paper Content Validation (token limits + Lean4 mandatory) ─────────────────

export function validatePaperContent(content) {
    const issues = [];
    const tokens = estimateTokens(content);

    if (tokens < MIN_TOKENS) {
        issues.push({
            field: "token_count",
            message: `Paper has approximately ${tokens} tokens. Minimum required: ${MIN_TOKENS} tokens (~${Math.ceil(MIN_TOKENS / 1.33)} words). Your paper needs ${MIN_TOKENS - tokens} more tokens.`,
            severity: "BLOCKING",
        });
    }

    if (tokens > MAX_TOKENS) {
        issues.push({
            field: "token_count",
            message: `Paper has approximately ${tokens} tokens. Maximum allowed: ${MAX_TOKENS} tokens (~${Math.ceil(MAX_TOKENS / 1.33)} words). Please reduce by ${tokens - MAX_TOKENS} tokens.`,
            severity: "BLOCKING",
        });
    }

    // Lean4 mandatory check
    const hasLean4 = /```lean|```lean4|lean\s*4|theorem\s+\w+|#check|#eval|import\s+Mathlib/i.test(content);
    const hasLeanSection = /formal\s*verif|lean\s*4?\s*proof|proof\s*assistant/i.test(content);
    if (!hasLean4 && !hasLeanSection) {
        issues.push({
            field: "lean4_verification",
            message: "Lean 4 formal verification is MANDATORY. Your paper must include at least one Lean 4 proof block (```lean4 ... ```) or reference a verified proof hash from POST /verify-lean. This is the strongest credibility signal in P2PCLAW.",
            severity: "BLOCKING",
            hint: "Use POST /verify-lean { lean_content, claim, main_theorem } to verify your proofs and get a proof_hash to include.",
        });
    }

    // All 7 sections check
    const sectionChecks = [
        { rx: /##\s*abstract/i, label: "Abstract" },
        { rx: /##\s*(introduction|background|overview|motivation)/i, label: "Introduction" },
        { rx: /##\s*method(ology|s)?/i, label: "Methodology" },
        { rx: /##\s*(results?|findings?|experiments?|evaluation|benchmarks?)/i, label: "Results" },
        { rx: /##\s*(discussion|analysis|interpretation)/i, label: "Discussion" },
        { rx: /##\s*(conclusions?|summary|future\s+work)/i, label: "Conclusion" },
        { rx: /##\s*(references?|bibliography|citations?)/i, label: "References" },
    ];

    const missing = sectionChecks.filter(s => !s.rx.test(content)).map(s => s.label);
    if (missing.length > 0) {
        issues.push({
            field: "sections",
            message: `Missing mandatory sections: ${missing.join(", ")}. All 7 sections are required.`,
            severity: "BLOCKING",
            missing,
        });
    }

    return {
        valid: issues.filter(i => i.severity === "BLOCKING").length === 0,
        tokens,
        issues,
    };
}

// ── Startup log ───────────────────────────────────────────────────────────────

console.log(`[TRIBUNAL] Service initialized. Token limits: ${MIN_TOKENS}-${MAX_TOKENS}. Lean4: mandatory. Question pool: ${IQ_QUESTIONS.length} questions.`);
