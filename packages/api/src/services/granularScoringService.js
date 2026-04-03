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
 *  11. Cohere       — command-a-reasoning (8 keys, reasoning model)
 *  12. Cloudflare  — llama-4-scout-17b (account 7, free)
 *  13. Cloudflare  — mistral-small-3.1-24b (account 8, free)
 *  14. Cloudflare  — deepseek-r1-distill-qwen-32b (account 9, free)
 *  15. Deterministic heuristic fallback (never blocks)
 *
 * ALL available judges score independently. Final score = average across all judges.
 * Each model evaluates each section independently for maximum consensus diversity.
 */

import { detectField, extractSignals, calibrateScores, REFERENCE_BENCHMARKS } from "./calibrationService.js";
import { runLiveVerification, verificationToAdjustments } from "./liveVerificationService.js";

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
    // --- Cohere: command-a-reasoning model (8 keys, reasoning/thinking model) ---
    {
        id: "cohere",
        name: "Cohere-CommandA",
        url: "https://api.cohere.com/v2/chat",
        model: "command-a-reasoning-08-2025",
        keys: loadKeys("COHERE_API_KEY").concat(loadKeys("COHERE_KEY")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 4096, // reasoning model needs extra tokens for thinking + answer
        responseFormat: "cohere", // data.message.content[] array with {type:"thinking"} + {type:"text"}
        timeout: 90000, // 90s — reasoning model needs time to think through all 10 dimensions
    },
    // --- Cloudflare Workers AI: 6 models across 6 accounts (all FREE) ---
    // Ordered by model quality: best first
    {
        id: "cloudflare-glm",
        name: "Cloudflare-GLM4",
        url: `https://api.cloudflare.com/client/v4/accounts/eaffd2b52c95c69aaad8d859e9dcb52b/ai/run/@cf/zai-org/glm-4.7-flash`,
        model: "@cf/zai-org/glm-4.7-flash",
        keys: loadKeys("CF_AI_TOKEN").concat(loadKeys("CLOUDFLARE_AI_TOKEN")),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-gemma4",
        name: "Cloudflare-Gemma4",
        url: `https://api.cloudflare.com/client/v4/accounts/a7995d3f33b6ba57955749337c9abbe0/ai/run/@cf/google/gemma-4-26b-a4b-it`,
        model: "@cf/google/gemma-4-26b-a4b-it",
        keys: loadKeys("CF_AI_TOKEN_2"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-nemotron",
        name: "Cloudflare-Nemotron",
        url: `https://api.cloudflare.com/client/v4/accounts/194d9aea21482ac893ed81fc6b004864/ai/run/@cf/nvidia/nemotron-3-120b-a12b`,
        model: "@cf/nvidia/nemotron-3-120b-a12b",
        keys: loadKeys("CF_AI_TOKEN_3"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-kimi",
        name: "Cloudflare-Kimi",
        url: `https://api.cloudflare.com/client/v4/accounts/401a75ead25275262c1c05eecb7a997c/ai/run/@cf/moonshotai/kimi-k2.5`,
        model: "@cf/moonshotai/kimi-k2.5",
        keys: loadKeys("CF_AI_TOKEN_4"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-gptoss",
        name: "Cloudflare-GPT-OSS",
        url: `https://api.cloudflare.com/client/v4/accounts/73340519f6430362daee759ba0b48ce8/ai/run/@cf/openai/gpt-oss-120b`,
        model: "@cf/openai/gpt-oss-120b",
        keys: loadKeys("CF_AI_TOKEN_5"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-qwen3",
        name: "Cloudflare-Qwen3",
        url: `https://api.cloudflare.com/client/v4/accounts/df4a7888befcbb6ce3e0a0b346ea1990/ai/run/@cf/qwen/qwen3-30b-a3b-fp8`,
        model: "@cf/qwen/qwen3-30b-a3b-fp8",
        keys: loadKeys("CF_AI_TOKEN_6"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    // --- Cloudflare Workers AI: 3 NEW accounts (accounts 7/8/9) ---
    {
        id: "cloudflare-llama4scout",
        name: "Cloudflare-Llama4Scout",
        url: `https://api.cloudflare.com/client/v4/accounts/3cd084561890e5ab468456fae547ded0/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`,
        model: "@cf/meta/llama-4-scout-17b-16e-instruct",
        keys: loadKeys("CF_AI_TOKEN_7"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-mistral31",
        name: "Cloudflare-MistralSmall31",
        url: `https://api.cloudflare.com/client/v4/accounts/27920eccf7d83f7ee267130cd6018eaf/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct`,
        model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
        keys: loadKeys("CF_AI_TOKEN_8"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-deepseekr1",
        name: "Cloudflare-DeepSeekR1",
        url: `https://api.cloudflare.com/client/v4/accounts/60c2dcaa7fc3377f036114648f6397ba/ai/run/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`,
        model: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        keys: loadKeys("CF_AI_TOKEN_9"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
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
// Debug: log specifically which providers have NO keys
const unavailable = PROVIDERS.filter(p => p.keys.length === 0);
if (unavailable.length > 0) console.log(`[SCORING] Providers with NO keys: ${unavailable.map(p => p.name).join(", ")}`);

const SCORING_PROMPT = `You are a STRICT academic peer reviewer. You evaluate papers for the P2PCLAW benchmark.

Your scoring must follow real academic standards. Most papers score 4-6. Only exceptional work reaches 7+. A score of 8+ means top-tier venue quality (NeurIPS, Nature, ICML). A 10 is historically significant (Turing Award level).

CALIBRATION ANCHORS — use these to calibrate your scores:
- 10/10 novelty: "Attention Is All You Need" (Vaswani 2017), Bitcoin whitepaper (Nakamoto 2008)
- 8/10 novelty: A genuine new algorithm with proven improvements over SOTA
- 6/10 novelty: Meaningful extension of existing work with some original insights
- 5/10 novelty: Applying known techniques to a new domain (standard contribution)
- 3/10 novelty: Minor variation of existing work, obvious next step
- 1/10 novelty: Restating known results with different notation

Score each criterion on 0-10:
- abstract (0-10): Clarity, completeness, problem+scope+results summarized
- introduction (0-10): Problem clarity, context, motivation. Needs 2+ real citations to related work
- methodology (0-10): Rigor and reproducibility. Can someone replicate this exactly?
- results (0-10): Strength of evidence. Real data, real experiments, statistical significance
- discussion (0-10): Honest limitations, implications, comparison to prior work
- conclusion (0-10): Summary of findings, concrete future directions
- references (0-10): Real citations with authors, titles, years, DOIs. 8+ unique for score >5
- novelty (0-10): TRUE original contribution. Applying a standard formula to a new domain = 4-5, NOT 8-9
- reproducibility (0-10): Code, equations, parameters, data availability
- citation_quality (0-10): Are references real, verified, and actually cited in the text?

STRICT RULES:
- Missing section = 0 for that section
- Placeholder/fake references = references score 1
- Papers under 300 words = all scores below 3
- Proving obvious things = novelty 0-1
- Standard variance/mean/known formulas applied to new domain = novelty 4-5 MAX
- No experimental data or only synthetic/estimated data = results 3-4 MAX
- Self-referential citations or citing only own work = citation_quality 2-3
- Circular reasoning (using conclusion to justify methodology) = methodology cap 4
- Claims without evidence (e.g., "we achieve SOTA" with no comparison) = results cap 3
- DO NOT give 8+ unless the work would genuinely be accepted at a top venue

Return ONLY this JSON (numbers 0-10):
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
                signal: AbortSignal.timeout(provider.timeout || 30000),
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
            // Support both OpenAI format (choices[0].message.content) and Cohere v2 (message.content[] array)
            let text = "";
            if (provider.responseFormat === "cohere") {
                // Cohere v2 returns array of content blocks: [{type:"thinking",...}, {type:"text",text:"..."}]
                const blocks = data.message?.content || [];
                if (Array.isArray(blocks)) {
                    const textBlock = blocks.find(b => b.type === "text");
                    text = textBlock?.text || blocks[blocks.length - 1]?.text || "";
                } else {
                    text = typeof blocks === "string" ? blocks : "";
                }
            } else if (provider.responseFormat === "cloudflare") {
                // Cloudflare Workers AI wraps OpenAI format: {result: {choices: [...]}, success: true}
                const inner = data.result || data;
                text = inner.choices?.[0]?.message?.content || "";
            } else {
                text = data.choices?.[0]?.message?.content || "";
            }

            // Strip <think>...</think> tags (Sarvam, Qwen with thinking mode)
            if (provider.stripThinkTags || text.includes("<think>")) {
                // Strip closed think blocks
                text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                // Strip unclosed think blocks (model ran out of tokens mid-think)
                if (text.startsWith("<think>")) {
                    text = text.replace(/<think>[\s\S]*/g, "").trim();
                }
            }

            // Extract JSON — use balanced braces to handle nested objects like {"score":8,"why":"..."}
            let jsonMatch = null;
            const firstBrace = text.indexOf('{');
            if (firstBrace !== -1) {
                let depth = 0, end = -1;
                for (let i = firstBrace; i < text.length; i++) {
                    if (text[i] === '{') depth++;
                    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
                }
                if (end !== -1) jsonMatch = [text.substring(firstBrace, end + 1)];
            }
            if (!jsonMatch) {
                console.warn(`[SCORING] ${provider.name} — no JSON in response`);
                continue;
            }

            const parsed = JSON.parse(jsonMatch[0]);
            const fields = [...SECTIONS, "novelty", "reproducibility", "citation_quality"];
            const feedback = {};
            for (const field of fields) {
                let val = parsed[field];
                // Support both plain number and {score, why} object format
                if (val && typeof val === "object" && typeof val.score === "number") {
                    feedback[field] = val.why || null;
                    val = val.score;
                }
                if (typeof val !== "number" || val < 0 || val > 10) {
                    val = typeof val === "number" ? Math.max(0, Math.min(10, Math.round(val))) : 5;
                }
                parsed[field] = val;
            }

            // Clean parsed: only keep recognized score fields (remove stray "why" etc.)
            const cleanScores = {};
            for (const field of fields) cleanScores[field] = parsed[field];

            console.log(`[SCORING] ${provider.name} scored successfully`);
            return { scores: cleanScores, provider: provider.name, feedback: Object.keys(feedback).length > 0 ? feedback : null };
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

    // All LLM judges support 32k+ context. Send enough content to include ALL 7 mandatory sections.
    // Previous limit of 4000 chars truncated papers before methodology/results/conclusion, causing
    // strict judges (Cohere, Xiaomi) to correctly score missing sections as 0.
    const truncated = content.length > 16000 ? content.substring(0, 16000) + "\n\n[... truncated for scoring ...]" : content;
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

    // ── CALIBRATION PASS — adjust raw averages against reference benchmarks ──
    // This is the core fix for inflated scoring. Raw LLM averages are compared
    // against quality signals extracted from the paper content and calibrated
    // against recognized reference paper fingerprints.
    let calibration = null;
    try {
        const fieldResult = detectField(content);
        const signals = extractSignals(content);
        const benchmarks = REFERENCE_BENCHMARKS[fieldResult.field] || null;
        const { calibrated, adjustments } = calibrateScores(averaged, signals, benchmarks);

        // Apply calibrated scores over raw averages
        const adjustmentCount = Object.keys(adjustments).length;
        if (adjustmentCount > 0) {
            for (const [field, val] of Object.entries(calibrated)) {
                if (typeof val === "number" && averaged[field] !== undefined) {
                    averaged[field] = val;
                }
            }
            console.log(`[SCORING] Calibration applied: ${adjustmentCount} adjustments, field=${fieldResult.field}, ` +
                `red_flags=${signals.red_flag_count}, depth=${signals.depth_score}`);
        }

        calibration = {
            field: fieldResult.field,
            field_confidence: fieldResult.confidence,
            signals_summary: {
                word_count: signals.word_count,
                sections_present: signals.sections_present.length,
                sections_missing: signals.sections_missing,
                red_flags: signals.red_flags,
                red_flag_count: signals.red_flag_count,
                has_formal_proofs: signals.has_formal_proofs,
                has_equations: signals.has_equations,
                has_code: signals.has_code,
                unique_refs: signals.unique_refs,
                has_placeholder_refs: signals.has_placeholder_refs,
                depth_score: signals.depth_score,
                evidence_markers: signals.evidence_markers,
                deception_count: signals.deception_count || 0,
                deception_matches: (signals.deception_matches || []).map(d => ({
                    id: d.id, name: d.name, severity: d.severity,
                })),
                // New quality dimensions
                grammar: signals.grammar_quality ? {
                    vocabulary_diversity: signals.grammar_quality.vocabulary_diversity_ttr,
                    is_monotone: signals.grammar_quality.is_monotone,
                    is_low_vocabulary: signals.grammar_quality.is_low_vocabulary,
                } : null,
                repetition_ratio: signals.repetition_score?.repetition_ratio || 0,
                code_quality: signals.code_quality?.blocks_found > 0 ? {
                    blocks: signals.code_quality.blocks_found,
                    has_real_code: signals.has_real_code || false,
                    has_python: signals.code_quality.has_python || false,
                } : null,
                math_formulas: signals.math_quality?.formula_count || 0,
                lean4: signals.lean4_signals?.verification_level || "none",
                tables: signals.table_quality?.count || 0,
            },
            adjustments,
            adjustment_count: adjustmentCount,
            reference_papers: benchmarks ? benchmarks.references.map(r => r.title) : [],
        };
    } catch (calErr) {
        console.warn(`[SCORING] Calibration error (non-fatal): ${calErr.message}`);
    }

    // ── LIVE VERIFICATION PASS — real-time CrossRef, arXiv, code exec, Lean4 ──
    // Runs in parallel with independent timeouts. Non-fatal: if it fails, scoring
    // continues with just calibration. Results apply caps and bonuses to scores.
    let liveVerification = null;
    try {
        const verification = await runLiveVerification(content);
        const { adjustments: liveAdj, bonuses: liveBon } = verificationToAdjustments(verification);

        // ── OVERRIDE FALSE POSITIVES ──
        // If live verification confirmed code execution but calibration flagged
        // "code_blocks_are_template_not_real", the red_flag was a false positive.
        // Undo the -1.5 penalty applied to all dimensions by recalibrating.
        const codeExec = verification.code_execution;
        if (codeExec && codeExec.passed > 0 && calibration && calibration.signals_summary) {
            const redFlags = calibration.signals_summary.red_flags || [];
            if (redFlags.includes("code_blocks_are_template_not_real")) {
                // The -1.5 penalty was applied to all 10 dimensions. Undo it.
                const allFields = [...SECTIONS, "novelty", "reproducibility", "citation_quality"];
                for (const field of allFields) {
                    if (averaged[field] !== undefined) {
                        averaged[field] = Math.min(10, Math.round((averaged[field] + 1.5) * 10) / 10);
                    }
                }
                // Remove the false red flag from the report
                calibration.signals_summary.red_flags = redFlags.filter(f => f !== "code_blocks_are_template_not_real");
                calibration.signals_summary.red_flag_count = calibration.signals_summary.red_flags.length;
                calibration.false_positive_corrected = "code_blocks_are_template_not_real (live verification confirmed code executes)";
                console.log(`[SCORING] False positive corrected: code_blocks_are_template_not_real (live verification: ${codeExec.passed}/${codeExec.total} passed)`);
            }
        }

        // Apply caps (these override score to a max value)
        for (const [key, val] of Object.entries(liveAdj)) {
            if (key.endsWith("_cap") && typeof val === "number") {
                const field = key.replace("_cap", "");
                if (averaged[field] !== undefined && averaged[field] > val) {
                    averaged[field] = val;
                }
            }
        }

        // Apply bonuses (add to score, capped at 10)
        for (const [key, val] of Object.entries(liveBon)) {
            if (key.endsWith("_bonus") && typeof val === "number") {
                const field = key.replace("_bonus", "");
                if (averaged[field] !== undefined) {
                    averaged[field] = Math.min(10, Math.round((averaged[field] + val) * 10) / 10);
                }
            }
        }

        liveVerification = {
            verification_time_ms: verification.verification_time_ms,
            citations: verification.citations ? {
                total: verification.citations.total,
                verified: verification.citations.verified,
                verification_rate: verification.citations.verification_rate,
            } : null,
            novelty: verification.novelty ? {
                searched: verification.novelty.searched,
                total_found: verification.novelty.total_found,
                novelty_concern: verification.novelty.novelty_concern,
                max_similarity: verification.novelty.max_similarity,
            } : null,
            code_execution: verification.code_execution ? {
                total: verification.code_execution.total,
                passed: verification.code_execution.passed,
                failed: verification.code_execution.failed,
            } : null,
            lean4: verification.lean4 ? {
                blocks_found: verification.lean4.blocks_found,
                verified: verification.lean4.verified,
                has_unsubstantiated_claim: verification.lean4.has_unsubstantiated_claim || false,
            } : null,
            adjustments: liveAdj,
            bonuses: liveBon,
        };

        const adjCount = Object.keys(liveAdj).filter(k => k.endsWith("_cap")).length;
        const bonCount = Object.keys(liveBon).filter(k => k.endsWith("_bonus")).length;
        if (adjCount > 0 || bonCount > 0) {
            console.log(`[SCORING] Live verification: ${adjCount} caps, ${bonCount} bonuses applied (${verification.verification_time_ms}ms)`);
        }
    } catch (liveErr) {
        console.warn(`[SCORING] Live verification error (non-fatal): ${liveErr.message}`);
    }

    const sectionValues = SECTIONS.map(s => averaged[s]);
    const overall = Math.round((sectionValues.reduce((a, b) => a + b, 0) / SECTIONS.length) * 10) / 10;

    // Per-judge detail breakdown (individual scores + feedback)
    const judge_details = judges.map(j => ({
        judge: j.provider,
        scores: j.scores,
        feedback: j.feedback || null,
    }));

    // Consensus score per dimension (1 = all judges agree, 0 = total disagreement)
    const consensus = {};
    for (const field of allFields) {
        const values = judges.map(j => j.scores[field]).filter(v => typeof v === "number");
        if (values.length < 2) { consensus[field] = 1.0; continue; }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        const stddev = Math.sqrt(variance);
        consensus[field] = Math.round(Math.max(0, 1 - stddev / 5) * 100) / 100;
    }
    const overall_consensus = Math.round(
        (allFields.reduce((sum, f) => sum + consensus[f], 0) / allFields.length) * 100
    ) / 100;

    // Aggregate feedback per dimension (from all judges that provided it)
    const aggregated_feedback = {};
    for (const field of allFields) {
        const comments = judges
            .filter(j => j.feedback && j.feedback[field])
            .map(j => ({ judge: j.provider, comment: j.feedback[field] }));
        if (comments.length > 0) aggregated_feedback[field] = comments;
    }

    const result = {
        sections: Object.fromEntries(SECTIONS.map(s => [s, averaged[s]])),
        overall,
        novelty: averaged.novelty,
        reproducibility: averaged.reproducibility,
        citation_quality: averaged.citation_quality,
        judges: judges.map(j => j.provider),
        judge_count: judges.length,
        judge_details,
        consensus,
        overall_consensus,
        feedback: Object.keys(aggregated_feedback).length > 0 ? aggregated_feedback : null,
        scored_at: new Date().toISOString(),
        paper_type: paperType,
        calibration,
        live_verification: liveVerification,
    };

    console.log(`[SCORING] Granular score: overall=${overall}, consensus=${overall_consensus}, judges=${result.judges.join(",")}`);
    return result;
}
