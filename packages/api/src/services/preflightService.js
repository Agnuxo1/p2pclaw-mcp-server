/**
 * Pre-flight Check Service (Phase C)
 *
 * Orchestrates ALL pre-flight checks on a paper before submission.
 * Runs structure analysis, domain detection, code verification, reference
 * quality checks, and generates actionable improvement suggestions.
 *
 * EXTENSION ONLY — does not modify any existing service.
 */

import { detectDomain } from "./domainRegistry.js";
import { verifyPaperCode, checkPythonAvailable } from "./toolRunner.js";

// ── Constants ──────────────────────────────────────────────────────────────

const OVERALL_TIMEOUT_MS = 90_000; // 90-second hard cap
const REQUIRED_SECTIONS = ["Abstract", "Introduction", "Methodology", "Results", "Discussion", "Conclusion", "References"];
const MIN_TOTAL_WORDS = 2000;
const MIN_SECTION_WORDS = {
    Abstract: 100,
    Introduction: 200,
    Methodology: 300,
    Results: 200,
    Discussion: 200,
    Conclusion: 100,
    References: 0 // references are counted by entry, not words
};
const MIN_REFERENCES = 8;
const MIN_EQUATIONS = 2;
const TARGET_SECTION_WORDS = {
    Abstract: 200,
    Introduction: 400,
    Methodology: 500,
    Results: 400,
    Discussion: 400,
    Conclusion: 200
};

// ── Section Extraction ─────────────────────────────────────────────────────

/**
 * Extract sections from markdown content by heading patterns.
 * Returns a map of section_name -> section_content.
 */
function extractSections(content) {
    if (!content) return {};

    const sections = {};
    // Match ## or # headings, case-insensitive
    const headingPattern = /^#{1,3}\s+(.+?)$/gm;
    const headings = [];
    let match;

    while ((match = headingPattern.exec(content)) !== null) {
        headings.push({ name: match[1].trim(), index: match.index, length: match[0].length });
    }

    for (let i = 0; i < headings.length; i++) {
        const start = headings[i].index + headings[i].length;
        const end = i + 1 < headings.length ? headings[i + 1].index : content.length;
        const sectionContent = content.substring(start, end).trim();
        sections[headings[i].name] = sectionContent;
    }

    return sections;
}

/**
 * Normalize a section name for comparison against required sections.
 * e.g. "3. Methodology and Approach" -> "methodology"
 */
function normalizeSectionName(name) {
    return name
        .replace(/^\d+[\.\)]\s*/, '') // strip leading numbering
        .replace(/\s+and\s+.*/i, '')  // "Results and Discussion" -> "Results"
        .replace(/\s+&\s+.*/i, '')
        .trim()
        .toLowerCase();
}

/**
 * Match extracted sections against required sections.
 */
function matchSections(extractedSections) {
    const found = [];
    const missing = [];
    const sectionWordCounts = {};

    const extractedKeys = Object.keys(extractedSections);
    const normalizedMap = {};
    for (const key of extractedKeys) {
        normalizedMap[normalizeSectionName(key)] = key;
    }

    for (const req of REQUIRED_SECTIONS) {
        const reqNorm = req.toLowerCase();
        // Check exact match first, then partial match
        const matchKey = Object.keys(normalizedMap).find(k =>
            k === reqNorm ||
            k.includes(reqNorm) ||
            reqNorm.includes(k) ||
            // Handle aliases: "Methods" = "Methodology", "Computational Methods" = "Methodology"
            (reqNorm === "methodology" && (k.includes("method") || k.includes("approach") || k.includes("computational"))) ||
            (reqNorm === "results" && k.includes("result")) ||
            (reqNorm === "discussion" && k.includes("discussion")) ||
            (reqNorm === "conclusion" && (k.includes("conclusion") || k.includes("summary"))) ||
            (reqNorm === "references" && (k.includes("reference") || k.includes("bibliography")))
        );

        if (matchKey) {
            found.push(req);
            const originalKey = normalizedMap[matchKey];
            const text = extractedSections[originalKey] || "";
            const words = text.split(/\s+/).filter(w => w.length > 0).length;
            sectionWordCounts[req] = words;
        } else {
            missing.push(req);
            sectionWordCounts[req] = 0;
        }
    }

    return { found, missing, sectionWordCounts };
}

// ── Analysis Helpers ───────────────────────────────────────────────────────

function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(w => w.length > 0).length;
}

function countEquations(content) {
    if (!content) return 0;
    // LaTeX display math: $$ ... $$
    const displayMath = (content.match(/\$\$[\s\S]*?\$\$/g) || []).length;
    // LaTeX inline math (only count substantial ones, 10+ chars)
    const inlineMath = (content.match(/\$[^$\n]{10,}\$/g) || []).length;
    // \begin{equation} ... \end{equation}
    const envEquations = (content.match(/\\begin\{(equation|align|gather|eqnarray)\*?\}/gi) || []).length;
    return displayMath + inlineMath + envEquations;
}

function countCodeBlocks(content) {
    if (!content) return 0;
    return (content.match(/```[\s\S]*?```/g) || []).length;
}

function analyzeReferences(content) {
    if (!content) return { total: 0, with_doi: 0, without_doi: 0 };

    // Extract references section
    const refMatch = content.match(/#{1,3}\s*References?\s*\n([\s\S]*?)(?=#{1,3}\s|\z|$)/i);
    const refSection = refMatch ? refMatch[1] : content;

    // Count numbered references [1], [2], etc.
    const numberedRefs = new Set();
    const refCitations = refSection.match(/\[(\d{1,3})\]/g) || [];
    for (const cite of refCitations) {
        const num = cite.match(/\d+/)[0];
        numberedRefs.add(num);
    }

    // Count DOI patterns
    const doiPattern = /10\.\d{4,9}\/[^\s,;)}\]]+/gi;
    const dois = (refSection.match(doiPattern) || []).length;

    // Also count reference-style entries (lines starting with [N])
    const refEntries = (refSection.match(/^\s*\[\d+\]\s+.{20,}/gm) || []).length;

    const total = Math.max(numberedRefs.size, refEntries);

    return {
        total,
        with_doi: Math.min(dois, total),
        without_doi: Math.max(0, total - dois)
    };
}

// ── Score Estimation ───────────────────────────────────────────────────────

function estimateScore(wordCount, structure, references, equations, codeBlocks) {
    let score = 0;

    // Word count (0-2 points)
    if (wordCount >= 3000) score += 2;
    else if (wordCount >= 2000) score += 1.5;
    else if (wordCount >= 1000) score += 0.8;
    else score += (wordCount / 2000) * 0.8;

    // Structure (0-2.5 points)
    const sectionRatio = structure.sections_found.length / REQUIRED_SECTIONS.length;
    score += sectionRatio * 2.5;

    // References (0-2 points)
    if (references.total >= 15) score += 2;
    else if (references.total >= MIN_REFERENCES) score += 1.5;
    else if (references.total >= 4) score += 0.8;
    else score += (references.total / MIN_REFERENCES) * 0.8;

    // DOI bonus (0-0.5)
    if (references.total > 0) {
        score += (references.with_doi / references.total) * 0.5;
    }

    // Equations (0-1.5 points)
    if (equations >= 5) score += 1.5;
    else if (equations >= MIN_EQUATIONS) score += 1;
    else score += (equations / MIN_EQUATIONS) * 1;

    // Code blocks bonus (0-1 point)
    if (codeBlocks >= 3) score += 1;
    else if (codeBlocks >= 1) score += 0.5;

    // Section depth penalty: thin sections reduce score
    if (structure.has_all_required) {
        const thinSections = Object.entries(structure.per_section || {}).filter(
            ([sec, wc]) => sec !== "References" && wc < (MIN_SECTION_WORDS[sec] || 100)
        );
        score -= thinSections.length * 0.15;
    }

    return Math.round(Math.min(10, Math.max(0, score)) * 100) / 100;
}

// ── Improvement Suggestions ────────────────────────────────────────────────

function generateSuggestions(wordCount, structure, references, equations, codeBlocks, domain) {
    const suggestions = [];

    // Word count
    if (wordCount < MIN_TOTAL_WORDS) {
        const deficit = MIN_TOTAL_WORDS - wordCount;
        suggestions.push(
            `Your paper has ${wordCount} words — the minimum is ${MIN_TOTAL_WORDS}. Add approximately ${deficit} more words across your sections to meet the threshold.`
        );
    }

    // Missing sections
    for (const sec of structure.sections_missing) {
        if (sec === "Methodology") {
            suggestions.push(
                `Missing "${sec}" section — add a dedicated section with pseudocode, algorithm steps, reproducible experimental setup, and parameter choices (aim for ${TARGET_SECTION_WORDS[sec] || 300}+ words).`
            );
        } else if (sec === "Results") {
            suggestions.push(
                `Missing "${sec}" section — present quantitative findings with tables, figures, or numerical comparisons (aim for ${TARGET_SECTION_WORDS[sec] || 300}+ words).`
            );
        } else if (sec === "Discussion") {
            suggestions.push(
                `Missing "${sec}" section — interpret your results, compare with prior work, and acknowledge limitations (aim for ${TARGET_SECTION_WORDS[sec] || 300}+ words).`
            );
        } else if (sec === "References") {
            suggestions.push(
                `Missing "${sec}" section — add a numbered reference list with at least ${MIN_REFERENCES} entries. Include DOIs where possible for higher credibility scores.`
            );
        } else {
            suggestions.push(
                `Missing "${sec}" section — add this required section (aim for ${TARGET_SECTION_WORDS[sec] || 150}+ words).`
            );
        }
    }

    // Thin sections
    for (const [sec, wc] of Object.entries(structure.per_section || {})) {
        if (sec === "References") continue;
        const target = TARGET_SECTION_WORDS[sec] || 200;
        const minimum = MIN_SECTION_WORDS[sec] || 100;
        if (wc > 0 && wc < minimum) {
            suggestions.push(
                `Your ${sec} section has ${wc} words — aim for ${target}+ with ${sec === "Methodology" ? "pseudocode and reproducible steps" : sec === "Results" ? "tables, numerical data, and statistical tests" : sec === "Discussion" ? "comparison with prior work and limitation analysis" : sec === "Abstract" ? "a concise summary covering objective, method, key result, and conclusion" : "substantive content expanding on key points"}.`
            );
        }
    }

    // References
    if (references.total < MIN_REFERENCES) {
        const deficit = MIN_REFERENCES - references.total;
        suggestions.push(
            `You have ${references.total} references — add at least ${deficit} more. Cite foundational works in your domain and recent publications (2020+) to demonstrate currency.`
        );
    }
    if (references.total > 0 && references.with_doi === 0) {
        suggestions.push(
            `None of your ${references.total} references include DOIs. Adding DOIs (e.g., "10.1038/...") improves verifiability and earns a higher credibility score.`
        );
    } else if (references.total > 0 && references.with_doi < references.total * 0.5) {
        suggestions.push(
            `Only ${references.with_doi} of ${references.total} references have DOIs. Try to include DOIs for at least 50% of references to boost the credibility score.`
        );
    }

    // Equations
    if (equations < MIN_EQUATIONS) {
        suggestions.push(
            `Your paper has ${equations} equation(s) — aim for at least ${MIN_EQUATIONS}. Use LaTeX math ($$ ... $$) to formalize key relationships, derivations, or proofs.`
        );
    }

    // Code blocks
    if (codeBlocks === 0 && domain && domain !== "unknown") {
        suggestions.push(
            `No executable code blocks found. Adding \`\`\`python code blocks with reproducible experiments or verification scripts earns code-verification bonus points.`
        );
    }

    // Domain-specific hints
    if (domain === "physics" && equations < 3) {
        suggestions.push(
            `Physics papers benefit from explicit derivations — include at least 3 equations showing dimensional analysis, key formulas, or numerical estimates.`
        );
    }
    if (domain === "mathematics" && equations < 5) {
        suggestions.push(
            `Mathematics papers require formal rigor — include at least 5 equations covering definitions, lemmas, and theorem statements.`
        );
    }
    if (domain === "biology" && references.total < 10) {
        suggestions.push(
            `Biology papers typically need 10+ references. Cite relevant databases (UniProt, PDB, GenBank) and recent experimental studies.`
        );
    }

    return suggestions;
}

// ── Main Pre-flight Orchestrator ───────────────────────────────────────────

/**
 * Run all pre-flight checks on a paper.
 *
 * @param {string} content - Full paper content (Markdown)
 * @param {object} options
 * @param {string} [options.domain] - Override domain detection
 * @returns {Promise<object>} Pre-flight results
 */
export async function runPreflightCheck(content, options = {}) {
    const start = Date.now();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
        return {
            passed: false,
            estimated_score: 0,
            word_count: { total: 0, per_section: {} },
            structure: { sections_found: [], sections_missing: [...REQUIRED_SECTIONS], has_all_required: false },
            domain: { detected: "unknown", confidence: 0, secondary: null },
            code_verification: { blocks_found: 0, blocks_verified: 0, blocks_failed: 0, execution_hashes: [] },
            references: { total: 0, with_doi: 0, without_doi: 0 },
            improvement_suggestions: ["No content provided. Submit your full paper in Markdown format."],
            elapsed_ms: Date.now() - start
        };
    }

    // ── Parallel checks via Promise.allSettled ─────────────────────────────

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Pre-flight check timed out after 90 seconds")), OVERALL_TIMEOUT_MS)
    );

    // Synchronous analyses (run immediately)
    const totalWords = countWords(content);
    const equations = countEquations(content);
    const codeBlockCount = countCodeBlocks(content);
    const refs = analyzeReferences(content);

    // Section analysis
    const extractedSections = extractSections(content);
    const { found: sectionsFound, missing: sectionsMissing, sectionWordCounts } = matchSections(extractedSections);

    // Domain detection
    const domainResult = options.domain
        ? { domain: options.domain, confidence: 1, secondary: null, signals: {} }
        : detectDomain(content);

    // Async checks: code verification (only if Python available)
    const codeVerificationPromise = (async () => {
        const hasPython = await checkPythonAvailable();
        if (!hasPython) {
            return {
                blocks_found: codeBlockCount,
                blocks_verified: 0,
                blocks_failed: 0,
                execution_hashes: [],
                note: "Python not available — code blocks were counted but not executed"
            };
        }
        const verifyResult = await verifyPaperCode(content, domainResult.domain || "mathematics");
        const hashes = (verifyResult.results || [])
            .filter(r => r.execution_hash)
            .map(r => r.execution_hash);
        return {
            blocks_found: verifyResult.blocks_found,
            blocks_verified: verifyResult.blocks_verified,
            blocks_failed: verifyResult.blocks_failed,
            execution_hashes: hashes
        };
    })();

    // Race all async work against the timeout
    let codeVerification;
    try {
        const [codeResult] = await Promise.race([
            Promise.allSettled([codeVerificationPromise]),
            timeoutPromise.then(() => { throw new Error("timeout"); })
        ]);

        codeVerification = codeResult.status === "fulfilled"
            ? codeResult.value
            : { blocks_found: codeBlockCount, blocks_verified: 0, blocks_failed: 0, execution_hashes: [], error: codeResult.reason?.message };
    } catch (err) {
        codeVerification = {
            blocks_found: codeBlockCount,
            blocks_verified: 0,
            blocks_failed: 0,
            execution_hashes: [],
            error: err.message
        };
    }

    // ── Build results ──────────────────────────────────────────────────────

    const structure = {
        sections_found: sectionsFound,
        sections_missing: sectionsMissing,
        has_all_required: sectionsMissing.length === 0,
        per_section: sectionWordCounts
    };

    const wordCountResult = {
        total: totalWords,
        per_section: sectionWordCounts
    };

    const domainOutput = {
        detected: domainResult.domain,
        confidence: domainResult.confidence,
        secondary: domainResult.secondary || null
    };

    const referencesOutput = {
        total: refs.total,
        with_doi: refs.with_doi,
        without_doi: refs.without_doi
    };

    // Estimate score
    const estimatedScore = estimateScore(totalWords, structure, referencesOutput, equations, codeBlockCount);

    // Generate suggestions
    const suggestions = generateSuggestions(
        totalWords, structure, referencesOutput, equations, codeBlockCount, domainResult.domain
    );

    // Passed = meets minimum requirements
    const passed = totalWords >= MIN_TOTAL_WORDS
        && sectionsMissing.length === 0
        && refs.total >= MIN_REFERENCES;

    return {
        passed,
        estimated_score: estimatedScore,
        word_count: wordCountResult,
        structure,
        domain: domainOutput,
        code_verification: codeVerification,
        references: referencesOutput,
        improvement_suggestions: suggestions,
        elapsed_ms: Date.now() - start
    };
}

export default { runPreflightCheck };
