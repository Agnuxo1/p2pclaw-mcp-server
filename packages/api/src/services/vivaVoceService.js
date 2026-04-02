/**
 * P2PCLAW Viva Voce Service — Oral Defense for Papers
 * =====================================================
 * Like a university thesis tribunal, this service generates challenge questions
 * that the presenting agent must answer. The questions test:
 *
 *   1. COMPREHENSION — Does the agent understand its own paper?
 *   2. METHODOLOGY — Can the agent explain WHY it chose its approach?
 *   3. LIMITATIONS — Is the agent honest about what doesn't work?
 *   4. LOGIC — Can the agent reason correctly? (IQ-style traps)
 *   5. FIELD KNOWLEDGE — Does the agent know the broader context?
 *
 * The system generates questions automatically from paper content analysis,
 * plus includes universal logic puzzles that test reasoning ability.
 *
 * Usage:
 *   POST /calibration/viva-voce { content: "paper...", agentId: "..." }
 *   → Returns challenge questions
 *
 *   POST /calibration/viva-voce/evaluate { questions, answers }
 *   → Evaluates answers and returns defense score
 */

import { detectField, extractSignals } from "./calibrationService.js";

// ── Universal Logic Challenges ─────────────────────────────────────────────
// These test pure reasoning ability. A weak LLM fails these.
// Each has ONE correct answer that requires actual thinking.

const LOGIC_CHALLENGES = [
    {
        id: "parity-trap",
        question: "You have billiard balls numbered 2, 4, 6, 10, and 12. By adding and subtracting these numbers (using each exactly once), can you obtain 13? Answer YES or NO, and explain why in one sentence.",
        correct_answer_contains: ["no", "even", "odd", "parity"],
        explanation: "All five numbers are even. Any sum/difference of even numbers is even. 13 is odd. Therefore impossible.",
        difficulty: "medium",
        tests: "parity reasoning",
    },
    {
        id: "pigeonhole",
        question: "A drawer contains red and blue socks in unknown quantities. What is the minimum number of socks you must draw (blindfolded) to GUARANTEE you have a matching pair? Answer with just the number and one sentence of reasoning.",
        correct_answer_contains: ["3", "three", "pigeonhole"],
        explanation: "By pigeonhole principle: 2 colors, so drawing 3 socks guarantees at least 2 of the same color.",
        difficulty: "easy",
        tests: "pigeonhole principle",
    },
    {
        id: "halting-awareness",
        question: "Can you write a program that determines, for ANY arbitrary program P and input I, whether P halts on I? Answer YES or NO, and name the relevant theorem.",
        correct_answer_contains: ["no", "halting", "turing", "undecidable"],
        explanation: "No — this is the Halting Problem, proven undecidable by Turing (1936) via diagonalization.",
        difficulty: "medium",
        tests: "computability theory basics",
    },
    {
        id: "big-o-trap",
        question: "Algorithm A runs in O(n log n) time. Algorithm B runs in O(n²) time. For n = 10, which is faster? Be precise — don't just compare the asymptotic classes.",
        correct_answer_contains: ["depends", "constant", "not necessarily", "overhead", "small n", "B could be"],
        explanation: "For small n, the constants matter. O(n²) with small constant can beat O(n log n) with large constant. At n=10: 100 vs ~33*c. B could be faster if its constant is small enough.",
        difficulty: "hard",
        tests: "understanding that Big-O is asymptotic, not absolute",
    },
    {
        id: "cap-theorem",
        question: "According to the CAP theorem, a distributed system can guarantee at most 2 of 3 properties. Name all 3 properties and explain which one most real-world systems sacrifice.",
        correct_answer_contains: ["consistency", "availability", "partition", "tolerance"],
        explanation: "Consistency, Availability, Partition tolerance. Since network partitions are unavoidable, real systems choose between CP (sacrifice availability) and AP (sacrifice consistency).",
        difficulty: "medium",
        tests: "distributed systems fundamentals",
    },
    {
        id: "p-np-understanding",
        question: "Is the statement 'P ≠ NP has been proven' true or false as of 2026? What would be the practical implication if P = NP were proven true?",
        correct_answer_contains: ["false", "not proven", "open", "unresolved", "cryptography", "break", "encrypt"],
        explanation: "False — P vs NP remains the most important open problem in CS. If P=NP, most public-key cryptography would break, as factoring/discrete log become polynomial-time solvable.",
        difficulty: "medium",
        tests: "awareness of fundamental open problems",
    },
    {
        id: "bayesian-trap",
        question: "A medical test is 99% accurate (1% false positive, 1% false negative). A disease affects 1 in 10,000 people. You test positive. What is the approximate probability you actually have the disease?",
        correct_answer_contains: ["1%", "0.01", "low", "less than", "base rate", "bayes", "~1", "about 1"],
        explanation: "By Bayes' theorem: P(disease|positive) ≈ 0.01 * 0.0001 / (0.01 * 0.0001 + 0.01 * 0.9999) ≈ 0.0099 ≈ ~1%. The base rate dominates.",
        difficulty: "hard",
        tests: "Bayesian reasoning and base rate understanding",
    },
    {
        id: "infinity-trap",
        question: "Is the set of even numbers larger than, smaller than, or the same size as the set of all natural numbers? Explain in one sentence.",
        correct_answer_contains: ["same", "equal", "bijection", "countab", "one-to-one", "n -> 2n"],
        explanation: "Same cardinality — there's a bijection f(n) = 2n between natural numbers and even numbers. Both are countably infinite.",
        difficulty: "medium",
        tests: "understanding of infinite set cardinality",
    },
];

// ── Paper-Specific Question Generators ─────────────────────────────────────

/**
 * Generate questions specific to the paper's content.
 * These force the agent to demonstrate understanding of its OWN work.
 */
function generatePaperQuestions(content, signals, field) {
    const questions = [];
    const lower = (content || "").toLowerCase();

    // Q1: Ask about methodology specifics
    const methMatch = content.match(/##?\s*methodology([\s\S]*?)(?=##?\s)/i);
    if (methMatch) {
        questions.push({
            id: "method-why",
            category: "METHODOLOGY",
            question: "Your paper describes a methodology. Explain in 2-3 sentences WHY you chose this specific approach over alternatives. What other approaches did you consider and why did you reject them?",
            evaluation: "Good answer names at least 1 alternative approach and gives a concrete reason for rejection. Bad answer is vague or just restates the methodology.",
            weight: 2,
        });
    }

    // Q2: Ask about limitations
    questions.push({
        id: "limitations",
        category: "LIMITATIONS",
        question: "Name the 3 most significant limitations of your work. For each, explain what would be needed to address it.",
        evaluation: "Good answer identifies real, specific limitations (not just 'more data'). Great answer proposes concrete solutions. Bad answer claims no limitations or gives generic ones.",
        weight: 2,
    });

    // Q3: Ask about a specific result
    const numbers = content.match(/\d+\.\d+[%x]?|\d+\s*(ms|TPS|accuracy|error|latency)/gi) || [];
    if (numbers.length > 0) {
        const sampleResult = numbers[Math.min(2, numbers.length - 1)];
        questions.push({
            id: "result-explain",
            category: "COMPREHENSION",
            question: `Your paper reports the result "${sampleResult}". Explain exactly how this number was obtained. What tool/code produced it? What was the input data? How many runs were averaged?`,
            evaluation: "Good answer provides specific tool name, dataset, number of runs, and statistical method. Bad answer is vague ('we ran experiments').",
            weight: 3,
        });
    }

    // Q4: References probe
    const refNumbers = content.match(/\[(\d+)\]/g) || [];
    if (refNumbers.length > 0) {
        const randomRef = refNumbers[Math.floor(refNumbers.length / 2)];
        questions.push({
            id: "citation-probe",
            category: "FIELD_KNOWLEDGE",
            question: `You cite reference ${randomRef} in your paper. Without looking it up: what is the main contribution of that paper, and how does it relate to your work specifically?`,
            evaluation: "Good answer accurately describes the cited paper's contribution and explains the specific connection. Bad answer is generic ('it's related work').",
            weight: 2,
        });
    }

    // Q5: Novelty challenge
    questions.push({
        id: "novelty-defend",
        category: "NOVELTY",
        question: "A reviewer claims your contribution is not novel — that similar work was published before. How would you defend the novelty of your work? Name a specific aspect that differentiates it from all prior work.",
        evaluation: "Good answer identifies a concrete, specific differentiator with supporting evidence. Bad answer makes vague claims of novelty.",
        weight: 2,
    });

    // Q6: Code verification (if code is present)
    if (signals.has_code || signals.has_real_code) {
        questions.push({
            id: "code-verify",
            category: "CODE",
            question: "Your paper includes code. What happens if you change the main input parameter to a value 10x larger? Does the algorithm still work correctly? What is the expected runtime change?",
            evaluation: "Good answer predicts specific behavior changes, discusses complexity scaling, and mentions edge cases. Bad answer is vague.",
            weight: 2,
        });
    }

    // Q7: Math verification (if equations present)
    if (signals.has_equations) {
        questions.push({
            id: "math-verify",
            category: "MATHEMATICS",
            question: "Walk me through the derivation of the main equation/formula in your paper step by step. What are the key assumptions, and what happens if any assumption is violated?",
            evaluation: "Good answer provides step-by-step derivation with named assumptions. Bad answer hand-waves or restates the formula without explanation.",
            weight: 3,
        });
    }

    // Q8: Reproducibility challenge
    questions.push({
        id: "reproduce-instructions",
        category: "REPRODUCIBILITY",
        question: "I want to reproduce your main result from scratch. Give me exact step-by-step instructions: what software to install, what data to download, what commands to run, and what result I should expect.",
        evaluation: "Good answer provides specific software versions, data URLs, exact commands, and expected output values. Bad answer says 'follow the methodology section'.",
        weight: 3,
    });

    return questions;
}

/**
 * Generate the full viva voce challenge for a paper.
 * Returns a mix of paper-specific and universal logic questions.
 */
function generateVivaVoce(content) {
    const signals = extractSignals(content);
    const field = detectField(content);

    // Paper-specific questions
    const paperQuestions = generatePaperQuestions(content, signals, field);

    // Select 2-3 universal logic challenges based on field
    let selectedLogic = [];
    if (field.field === "cs-distributed") {
        selectedLogic = LOGIC_CHALLENGES.filter(c => ["cap-theorem", "halting-awareness", "parity-trap"].includes(c.id));
    } else if (field.field === "ai-ml") {
        selectedLogic = LOGIC_CHALLENGES.filter(c => ["bayesian-trap", "big-o-trap", "p-np-understanding"].includes(c.id));
    } else if (field.field === "math-logic") {
        selectedLogic = LOGIC_CHALLENGES.filter(c => ["infinity-trap", "halting-awareness", "parity-trap"].includes(c.id));
    } else if (field.field === "network-science") {
        selectedLogic = LOGIC_CHALLENGES.filter(c => ["pigeonhole", "big-o-trap", "parity-trap"].includes(c.id));
    } else {
        // Default: 2 random
        selectedLogic = LOGIC_CHALLENGES.filter(c => ["parity-trap", "pigeonhole", "halting-awareness"].includes(c.id));
    }

    return {
        paper_field: field,
        total_questions: paperQuestions.length + selectedLogic.length,
        max_score: paperQuestions.reduce((s, q) => s + q.weight, 0) + selectedLogic.length * 2,
        paper_questions: paperQuestions,
        logic_challenges: selectedLogic.map(c => ({
            id: c.id,
            question: c.question,
            difficulty: c.difficulty,
            tests: c.tests,
            weight: 2,
        })),
        instructions: "Answer each question concisely (2-5 sentences max). Logic challenges have ONE correct answer. Paper questions test understanding of YOUR work.",
    };
}

/**
 * Evaluate viva voce answers.
 * Takes the questions + agent answers and scores each.
 */
function evaluateVivaVoce(questions, logicChallenges, answers) {
    const results = [];
    let totalScore = 0;
    let maxScore = 0;

    // Evaluate paper questions (keyword + quality heuristic)
    for (const q of questions) {
        maxScore += q.weight;
        const answer = (answers[q.id] || "").toLowerCase().trim();
        if (!answer || answer.length < 10) {
            results.push({ id: q.id, score: 0, max: q.weight, feedback: "No answer or too short" });
            continue;
        }
        // Basic quality check: length, specificity
        const words = answer.split(/\s+/).length;
        const hasSpecifics = /\d|specific|because|however|although|alternatively/i.test(answer);
        const isGeneric = /it is important|this is relevant|as mentioned|as described/i.test(answer) && words < 20;

        let score = 0;
        if (words >= 20 && hasSpecifics && !isGeneric) score = q.weight; // full marks
        else if (words >= 10 && hasSpecifics) score = Math.ceil(q.weight * 0.7);
        else if (words >= 5) score = Math.ceil(q.weight * 0.3);

        totalScore += score;
        results.push({
            id: q.id,
            category: q.category,
            score,
            max: q.weight,
            feedback: score === q.weight ? "Specific, detailed answer" :
                score > 0 ? "Partial answer — lacks specifics" : "Too vague or generic",
        });
    }

    // Evaluate logic challenges (keyword matching)
    for (const lc of logicChallenges) {
        maxScore += 2;
        const answer = (answers[lc.id] || "").toLowerCase().trim();
        const fullChallenge = LOGIC_CHALLENGES.find(c => c.id === lc.id);
        if (!fullChallenge) continue;

        if (!answer || answer.length < 5) {
            results.push({ id: lc.id, score: 0, max: 2, feedback: "No answer" });
            continue;
        }

        // Check if answer contains correct keywords
        const matchCount = fullChallenge.correct_answer_contains
            .filter(kw => answer.includes(kw.toLowerCase())).length;
        const threshold = Math.ceil(fullChallenge.correct_answer_contains.length * 0.4);

        let score = 0;
        if (matchCount >= threshold) score = 2; // correct
        else if (matchCount > 0) score = 1; // partial

        totalScore += score;
        results.push({
            id: lc.id,
            type: "logic_challenge",
            score,
            max: 2,
            correct: score === 2,
            feedback: score === 2 ? "Correct reasoning" :
                score === 1 ? "Partially correct" : `Incorrect. ${fullChallenge.explanation}`,
        });
    }

    const percentage = maxScore > 0 ? Math.round(totalScore / maxScore * 100) : 0;
    let grade;
    if (percentage >= 80) grade = "PASS — Strong defense";
    else if (percentage >= 60) grade = "PASS — Adequate defense with gaps";
    else if (percentage >= 40) grade = "MARGINAL — Significant gaps in understanding";
    else grade = "FAIL — Unable to defend the work";

    return {
        total_score: totalScore,
        max_score: maxScore,
        percentage,
        grade,
        results,
        defense_passed: percentage >= 50,
    };
}

export {
    LOGIC_CHALLENGES,
    generateVivaVoce,
    evaluateVivaVoce,
};
