/**
 * P2PCLAW Granular Scoring Service
 * =================================
 * Heterogeneous multi-LLM scoring engine that evaluates papers section-by-section.
 *
 * Pilar 3: Quality Training Dataset Factory
 *
 * Each paper gets scored on 7 sections (0-10) plus 3 meta-dimensions:
 * novelty, reproducibility, citation_quality.
 *
 * Uses Groq + Together AI as independent judges (heterogeneous swarm).
 * If both LLMs fail → deterministic heuristic scoring (never blocks).
 *
 * PURELY ADDITIVE — does not modify any existing service.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.LLM_KEY || process.env.GROQ_KEY || "";
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || process.env.TOGETHER_KEY || "";

// Startup diagnostics
if (GROQ_API_KEY) console.log(`[SCORING] Groq key loaded (${GROQ_API_KEY.length} chars, starts: ${GROQ_API_KEY.substring(0, 8)}...)`);
else console.warn("[SCORING] No Groq API key — heuristic scoring only. Set GROQ_API_KEY in Railway env.");
if (TOGETHER_API_KEY) console.log(`[SCORING] Together key loaded (${TOGETHER_API_KEY.length} chars)`);
else console.warn("[SCORING] No Together API key — Groq-only mode.");

const SECTIONS = ["abstract", "introduction", "methodology", "results", "discussion", "conclusion", "references"];

const SCORING_PROMPT = `You are an academic paper quality evaluator for the P2PCLAW research network.

Score this paper on a 0-10 scale for each criterion. Return ONLY valid JSON, no explanations.

Scoring criteria:
- abstract (0-10): Quality, clarity, and completeness of the abstract
- introduction (0-10): Problem statement clarity, context, motivation
- methodology (0-10): Rigor, reproducibility, appropriate methods
- results (0-10): Quality of findings, data presentation, significance
- discussion (0-10): Interpretation depth, limitations acknowledged, implications
- conclusion (0-10): Summary quality, future work suggestions
- references (0-10): Citation quality, relevance, proper formatting (0 if no real references)
- novelty (0-10): Original contribution to the field
- reproducibility (0-10): Could another researcher reproduce this work?
- citation_quality (0-10): Are references real, relevant, and properly cited?

IMPORTANT RULES:
- If a section is MISSING entirely, score it 0
- If references are placeholder/fake (e.g. "[1] Author, A. (2026). Placeholder"), score references as 1
- Trivial proofs or papers under 300 words should score below 3 overall
- Papers that prove obvious things (like 0*0=0) should score novelty as 0-1
- Be STRICT — a score of 8+ means genuinely publishable quality

Return ONLY this JSON format:
{"abstract":N,"introduction":N,"methodology":N,"results":N,"discussion":N,"conclusion":N,"references":N,"novelty":N,"reproducibility":N,"citation_quality":N}

Paper content:
`;

/**
 * Call a single LLM to score a paper. Returns parsed JSON or null.
 */
async function callLLMForScoring(prompt, provider) {
    const configs = {
        groq: {
            url: "https://api.groq.com/openai/v1/chat/completions",
            key: GROQ_API_KEY,
            model: "llama-3.3-70b-versatile",
        },
        together: {
            url: "https://api.together.xyz/v1/chat/completions",
            key: TOGETHER_API_KEY,
            model: "Qwen/Qwen2.5-72B-Instruct-Turbo",
        }
    };

    const cfg = configs[provider];
    if (!cfg || !cfg.key) {
        console.warn(`[SCORING] ${provider} skipped — no API key configured`);
        return null;
    }
    console.log(`[SCORING] Calling ${provider} (model: ${cfg.model})...`);

    try {
        const res = await fetch(cfg.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cfg.key}`
            },
            body: JSON.stringify({
                model: cfg.model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 512,
                temperature: 0.1, // Very low for consistent scoring
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            console.warn(`[SCORING] ${provider} HTTP ${res.status}: ${errBody.substring(0, 200)}`);
            return null;
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";

        console.log(`[SCORING] ${provider} returned ${text.length} chars`);

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
            console.warn(`[SCORING] ${provider} — no JSON found in response: ${text.substring(0, 200)}`);
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate all expected fields are numbers 0-10
        const fields = [...SECTIONS, "novelty", "reproducibility", "citation_quality"];
        for (const field of fields) {
            if (typeof parsed[field] !== "number" || parsed[field] < 0 || parsed[field] > 10) {
                parsed[field] = typeof parsed[field] === "number" ? Math.max(0, Math.min(10, Math.round(parsed[field]))) : 5;
            }
        }

        return { scores: parsed, provider };
    } catch (e) {
        console.warn(`[SCORING] ${provider} failed:`, e.message);
        return null;
    }
}

/**
 * Deterministic heuristic scoring — used when all LLMs fail.
 * Analyses text structure, word count, references, etc.
 */
function heuristicScore(content) {
    const text = content || "";
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const lowerText = text.toLowerCase();

    // Detect sections present
    const sectionScores = {};
    for (const section of SECTIONS) {
        const hasSection = lowerText.includes(`## ${section}`) || lowerText.includes(`# ${section}`);
        if (!hasSection) {
            sectionScores[section] = 0;
            continue;
        }
        // Base score for having the section, scaled by word count in that section
        const sectionRegex = new RegExp(`##?\\s*${section}[\\s\\S]*?(?=##?\\s|$)`, "i");
        const match = text.match(sectionRegex);
        const sectionWords = match ? match[0].split(/\s+/).length : 0;
        if (sectionWords < 20) sectionScores[section] = 2;
        else if (sectionWords < 50) sectionScores[section] = 4;
        else if (sectionWords < 100) sectionScores[section] = 5;
        else if (sectionWords < 200) sectionScores[section] = 6;
        else sectionScores[section] = 7;
    }

    // Reference quality — check for real citations vs placeholders
    const refMatches = text.match(/\[\d+\]/g) || [];
    const uniqueRefs = new Set(refMatches).size;
    const hasPlaceholderRefs = /placeholder|author,?\s*a\.\s*\(\d{4}\)/i.test(text);
    const hasRealAuthors = /[A-Z][a-z]+,\s*[A-Z]\.\s*(?:&|,|et al)/g.test(text); // "Smith, J. &" pattern
    const hasDOI = /doi\.org|arxiv\.org|10\.\d{4}/i.test(text);
    let refScore = hasPlaceholderRefs ? 1 : Math.min(7, uniqueRefs);
    if (hasRealAuthors) refScore = Math.min(10, refScore + 1);
    if (hasDOI) refScore = Math.min(10, refScore + 1);
    sectionScores.references = refScore;

    // Novelty — heuristic: unique terms, technical depth indicators
    const technicalTerms = (text.match(/\b(algorithm|theorem|proof|complexity|O\([^)]+\)|convergence|optimal|novel|framework)\b/gi) || []).length;
    const hasFigures = /figure \d|fig\.\s*\d|table \d/i.test(text);
    let novelty = wordCount > 2000 ? 4 : wordCount > 1000 ? 3 : 2;
    novelty += Math.min(3, Math.floor(technicalTerms / 5));
    if (hasFigures) novelty += 1;

    // Reproducibility
    const hasCode = /```[\s\S]*?```/.test(text);
    const hasEquations = /\$[^$]+\$/.test(text) || /\\begin\{/.test(text);
    const hasNumbers = /\d+\.\d+%|\d+\.\d+x|p\s*[<>]\s*0\.\d/i.test(text); // quantitative results
    let reproducibility = (hasCode ? 5 : 3) + (hasEquations ? 1 : 0) + (wordCount > 2000 ? 1 : 0);
    if (hasNumbers) reproducibility += 1;

    // Citation quality
    const citation_quality = hasPlaceholderRefs ? 1 : Math.min(6, uniqueRefs);

    return {
        scores: {
            ...sectionScores,
            novelty: Math.min(10, novelty),
            reproducibility: Math.min(10, reproducibility),
            citation_quality: Math.min(10, citation_quality),
        },
        provider: "heuristic"
    };
}

/**
 * Score a paper using heterogeneous multi-LLM swarm.
 * Returns averaged scores from multiple judges.
 *
 * @param {string} content - Paper content (Markdown)
 * @param {string} paperType - "research" | "review" | "technical" | "proof"
 * @returns {Promise<{sections: object, overall: number, novelty: number, reproducibility: number, citation_quality: number, judges: string[], judge_count: number}>}
 */
export async function scoreGranular(content, paperType = "research") {
    if (!content || content.trim().length < 50) {
        return {
            sections: Object.fromEntries(SECTIONS.map(s => [s, 0])),
            overall: 0,
            novelty: 0,
            reproducibility: 0,
            citation_quality: 0,
            judges: [],
            judge_count: 0,
            error: "Content too short to score"
        };
    }

    // Truncate content to ~4000 chars for LLM context (enough for evaluation)
    const truncated = content.length > 4000 ? content.substring(0, 4000) + "\n\n[... truncated for scoring ...]" : content;
    const prompt = SCORING_PROMPT + truncated;

    // Call both LLMs in parallel (heterogeneous swarm)
    const [groqResult, togetherResult] = await Promise.allSettled([
        callLLMForScoring(prompt, "groq"),
        callLLMForScoring(prompt, "together")
    ]);

    const judges = [];
    if (groqResult.status === "fulfilled" && groqResult.value) judges.push(groqResult.value);
    if (togetherResult.status === "fulfilled" && togetherResult.value) judges.push(togetherResult.value);

    // If no LLM judges succeeded, use heuristic
    if (judges.length === 0) {
        const heuristic = heuristicScore(content);
        judges.push(heuristic);
    }

    // Average scores across all judges
    const allFields = [...SECTIONS, "novelty", "reproducibility", "citation_quality"];
    const averaged = {};
    for (const field of allFields) {
        const values = judges.map(j => j.scores[field]).filter(v => typeof v === "number");
        averaged[field] = values.length > 0
            ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
            : 0;
    }

    // Compute overall as weighted average of sections
    const sectionValues = SECTIONS.map(s => averaged[s]);
    const overall = Math.round((sectionValues.reduce((a, b) => a + b, 0) / SECTIONS.length) * 10) / 10;

    const result = {
        sections: Object.fromEntries(SECTIONS.map(s => [s, averaged[s]])),
        overall,
        novelty: averaged.novelty,
        reproducibility: averaged.reproducibility,
        citation_quality: averaged.citation_quality,
        judges: judges.map(j => j.provider),
        judge_count: judges.length,
        scored_at: new Date().toISOString(),
        paper_type: paperType,
    };

    console.log(`[SCORING] Granular score: overall=${overall}, judges=${result.judges.join(",")}`);
    return result;
}
