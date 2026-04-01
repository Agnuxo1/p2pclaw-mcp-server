/**
 * P2PCLAW Granular Scoring Service
 * =================================
 * Heterogeneous multi-LLM scoring engine that evaluates papers section-by-section.
 *
 * Provider chain (updated 2026-04-01):
 *   1. Cerebras     — qwen-3-235b (3 keys, free, ultra-fast)
 *   2. Cerebras     — llama3.1-8b (3 keys, free, ultra-fast)
 *   3. Mistral      — mistral-small-latest (2 keys, free)
 *   4. Sarvam       — sarvam-m (Indian AI, free)
 *   5. OpenRouter   — qwen3-coder:free (free)
 *   6. Groq         — llama-3.3-70b-versatile (7 keys, may be restricted)
 *   7. NVIDIA       — meta/llama-3.3-70b-instruct (3 keys, free)
 *   8. Inception    — mercury-2 (5 keys, free)
 *   9. Xiaomi MiMo  — mimo-v2-flash (3 keys, free)
 *  10. Xiaomi MiMo  — mimo-v2-pro (3 keys, free, reasoning)
 *  11. Deterministic heuristic fallback (never blocks)
 *
 * ALL available judges score independently. Final score = average across all judges.
 * Each model evaluates each section independently for maximum consensus diversity.
 */

const SECTIONS = ["abstract", "introduction", "methodology", "results", "discussion", "conclusion", "references"];

// ── Load keys with rotation ─────────────────────────────────────────────────

function loadKeys(envPrefix, maxKeys = 10) {
    const keys = [];
    for (let i = 1; i <= maxKeys; i++) {
        const k = process.env[`${envPrefix}_${i}`] || process.env[`${envPrefix}${i}`];
        if (k) keys.push(k);
    }
    // Also check single-key env vars
    const single = process.env[envPrefix];
    if (single && !keys.includes(single)) keys.unshift(single);
    return keys;
}

const keyIndices = {};
function nextKey(providerId, keys) {
    if (!keys.length) return null;
    const idx = keyIndices[providerId] || 0;
    const key = keys[idx % keys.length];
    keyIndices[providerId] = (idx + 1) % keys.length;
    return key;
}

// ── Provider definitions ────────────────────────────────────────────────────

const PROVIDERS = [
    // --- Cerebras: 3 keys x 2 models = up to 6 independent judges ---
    {
        id: "cerebras-qwen",
        name: "Cerebras-Qwen235B",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "qwen-3-235b-a22b-instruct-2507",
        keys: loadKeys("CEREBRAS_API_KEY").concat(loadKeys("CEREBRAS_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 1024,
    },
    {
        id: "cerebras-llama",
        name: "Cerebras-Llama8B",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "llama3.1-8b",
        keys: loadKeys("CEREBRAS_API_KEY").concat(loadKeys("CEREBRAS_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Mistral: 2 keys, reliable ---
    {
        id: "mistral",
        name: "Mistral",
        url: "https://api.mistral.ai/v1/chat/completions",
        model: "mistral-small-latest",
        keys: loadKeys("MISTRAL_API_KEY").concat(loadKeys("MISTRAL_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Sarvam (Indian AI): sarvam-m, uses <think> tags (needs 2048+ tokens) ---
    {
        id: "sarvam",
        name: "Sarvam",
        url: "https://api.sarvam.ai/v1/chat/completions",
        model: "sarvam-m",
        keys: loadKeys("SARVAM_KEY").concat(loadKeys("SARVAM_API_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
    },
    // --- OpenRouter: free models ---
    {
        id: "openrouter",
        name: "OpenRouter",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "qwen/qwen3-coder:free",
        keys: loadKeys("OPENROUTER_API_KEY"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
    },
    // --- Groq: 7 keys but may be org-restricted ---
    {
        id: "groq",
        name: "Groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile",
        keys: loadKeys("GROQ_API_KEY").concat(loadKeys("GROQ_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- NVIDIA: 3 keys ---
    {
        id: "nvidia",
        name: "NVIDIA",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "meta/llama-3.3-70b-instruct",
        keys: loadKeys("NVAPI_KEY").concat(loadKeys("NVIDIA_API_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Inception: mercury-2 ---
    {
        id: "inception",
        name: "Inception",
        url: "https://api.inceptionlabs.ai/v1/chat/completions",
        model: "mercury-2",
        keys: loadKeys("INCEPTION_API_KEY").concat(loadKeys("INCEPTION_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Xiaomi MiMo: 3 keys x 2 models = up to 2 independent judges ---
    {
        id: "xiaomi-flash",
        name: "Xiaomi-MiMo-Flash",
        url: "https://api.xiaomimimo.com/v1/chat/completions",
        model: "mimo-v2-flash",
        keys: loadKeys("XIAOMI_API_KEY").concat(loadKeys("XIAOMI_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    {
        id: "xiaomi-pro",
        name: "Xiaomi-MiMo-Pro",
        url: "https://api.xiaomimimo.com/v1/chat/completions",
        model: "mimo-v2-pro",
        keys: loadKeys("XIAOMI_API_KEY").concat(loadKeys("XIAOMI_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
    },
];

// Deduplicate keys within each provider
for (const p of PROVIDERS) {
    p.keys = [...new Set(p.keys)].filter(Boolean);
}

// Log available providers
const available = PROVIDERS.filter(p => p.keys.length > 0);
console.log(`[SCORING] ${available.length} LLM providers available: ${available.map(p => `${p.name}(${p.keys.length})`).join(", ")}`);
if (available.length === 0) console.warn("[SCORING] No LLM providers — heuristic scoring only.");

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
 * Call a single LLM provider to score a paper.
 * Tries up to 2 keys from the provider before giving up.
 */
async function callLLMForScoring(prompt, provider) {
    if (!provider.keys.length) return null;

    const maxAttempts = Math.min(provider.keys.length, 2);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const key = nextKey(provider.id, provider.keys);
        if (!key) return null;

        const headers = { "Content-Type": "application/json" };
        headers[provider.authHeader] = `${provider.authPrefix}${key}`;
        if (provider.extraHeaders) Object.assign(headers, provider.extraHeaders);

        try {
            const res = await fetch(provider.url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: provider.model,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: provider.maxTokens || 512,
                    temperature: 0.1,
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (res.status === 429) {
                console.warn(`[SCORING] ${provider.name} 429 rate-limited`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            if (res.status === 402) {
                console.warn(`[SCORING] ${provider.name} 402 credits exhausted — skipping provider`);
                return null;
            }
            if (!res.ok) {
                const errBody = await res.text().catch(() => "");
                console.warn(`[SCORING] ${provider.name} HTTP ${res.status}: ${errBody.substring(0, 150)}`);
                continue;
            }

            const data = await res.json();
            let text = data.choices?.[0]?.message?.content || "";

            // Strip <think>...</think> tags (Sarvam, Qwen with thinking mode)
            if (provider.stripThinkTags || text.includes("<think>")) {
                // Strip closed think blocks
                text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                // Strip unclosed think blocks (model ran out of tokens mid-think)
                if (text.startsWith("<think>")) {
                    text = text.replace(/<think>[\s\S]*/g, "").trim();
                }
            }

            const jsonMatch = text.match(/\{[\s\S]*?\}/);
            if (!jsonMatch) {
                console.warn(`[SCORING] ${provider.name} — no JSON in response`);
                continue;
            }

            const parsed = JSON.parse(jsonMatch[0]);
            const fields = [...SECTIONS, "novelty", "reproducibility", "citation_quality"];
            for (const field of fields) {
                if (typeof parsed[field] !== "number" || parsed[field] < 0 || parsed[field] > 10) {
                    parsed[field] = typeof parsed[field] === "number" ? Math.max(0, Math.min(10, Math.round(parsed[field]))) : 5;
                }
            }

            console.log(`[SCORING] ${provider.name} scored successfully`);
            return { scores: parsed, provider: provider.name };
        } catch (e) {
            console.warn(`[SCORING] ${provider.name} error: ${e.message}`);
        }
    }
    return null;
}

/**
 * Deterministic heuristic scoring — used when all LLMs fail.
 */
function heuristicScore(content) {
    const text = content || "";
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const lowerText = text.toLowerCase();

    const sectionScores = {};
    for (const section of SECTIONS) {
        const hasSection = lowerText.includes(`## ${section}`) || lowerText.includes(`# ${section}`);
        if (!hasSection) {
            sectionScores[section] = 0;
            continue;
        }
        const sectionRegex = new RegExp(`##?\\s*${section}[\\s\\S]*?(?=##?\\s|$)`, "i");
        const match = text.match(sectionRegex);
        const sectionWords = match ? match[0].split(/\s+/).length : 0;
        if (sectionWords < 20) sectionScores[section] = 2;
        else if (sectionWords < 50) sectionScores[section] = 4;
        else if (sectionWords < 100) sectionScores[section] = 5;
        else if (sectionWords < 200) sectionScores[section] = 6;
        else sectionScores[section] = 7;
    }

    const refMatches = text.match(/\[\d+\]/g) || [];
    const uniqueRefs = new Set(refMatches).size;
    const hasPlaceholderRefs = /placeholder|author,?\s*a\.\s*\(\d{4}\)/i.test(text);
    const hasRealAuthors = /[A-Z][a-z]+,\s*[A-Z]\.\s*(?:&|,|et al)/g.test(text);
    const hasDOI = /doi\.org|arxiv\.org|10\.\d{4}/i.test(text);
    let refScore = hasPlaceholderRefs ? 1 : Math.min(7, uniqueRefs);
    if (hasRealAuthors) refScore = Math.min(10, refScore + 1);
    if (hasDOI) refScore = Math.min(10, refScore + 1);
    sectionScores.references = refScore;

    const technicalTerms = (text.match(/\b(algorithm|theorem|proof|complexity|O\([^)]+\)|convergence|optimal|novel|framework)\b/gi) || []).length;
    const hasFigures = /figure \d|fig\.\s*\d|table \d/i.test(text);
    let novelty = wordCount > 2000 ? 4 : wordCount > 1000 ? 3 : 2;
    novelty += Math.min(3, Math.floor(technicalTerms / 5));
    if (hasFigures) novelty += 1;

    const hasCode = /```[\s\S]*?```/.test(text);
    const hasEquations = /\$[^$]+\$/.test(text) || /\\begin\{/.test(text);
    const hasNumbers = /\d+\.\d+%|\d+\.\d+x|p\s*[<>]\s*0\.\d/i.test(text);
    let reproducibility = (hasCode ? 5 : 3) + (hasEquations ? 1 : 0) + (wordCount > 2000 ? 1 : 0);
    if (hasNumbers) reproducibility += 1;

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
 * Tries to get 2 independent judges, falls back through provider chain.
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

    const truncated = content.length > 4000 ? content.substring(0, 4000) + "\n\n[... truncated for scoring ...]" : content;
    const prompt = SCORING_PROMPT + truncated;

    // ALL available judges score independently for maximum consensus diversity.
    // Each model evaluates each section independently, then we average.
    // Run all judges in parallel for speed (each has its own timeout).
    const judgePromises = available.map(provider =>
        callLLMForScoring(prompt, provider).catch(() => null)
    );
    const judgeResults = await Promise.all(judgePromises);
    const judges = judgeResults.filter(Boolean);

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
