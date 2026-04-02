/**
 * P2PCLAW Shared LLM Chain
 * ========================
 * Multi-provider fallback chain used by HiveGuide, Format Service, Abraxas,
 * and any other service that needs reliable LLM completions.
 *
 * 9 Cloudflare Workers AI models (FREE, different accounts) + 7 other providers = 16 total
 * Ordered by model quality: best first, smallest last.
 *
 * Usage:
 *   import { callLLMChain } from './llmChain.js';
 *   const text = await callLLMChain(messages, { maxTokens: 300, temperature: 0.5, tag: "HIVEGUIDE" });
 */

// ── Cloudflare account map (account IDs are public, keys from env) ───────────
// Ordered 1-9 by model quality (1=most powerful, 9=smallest)

const CF_ACCOUNTS = [
    { // 1. GLM-4.7-Flash (ZhipuAI) — top reasoning model
        id: "cf-glm4",
        name: "CF-GLM4-Flash",
        account: "eaffd2b52c95c69aaad8d859e9dcb52b",
        model: "@cf/zai-org/glm-4.7-flash",
        keyEnvs: ["CF_AI_TOKEN", "CLOUDFLARE_AI_TOKEN"],
        stripThink: true,
    },
    { // 2. Gemma-4-26B (Google) — strong multi-task
        id: "cf-gemma4",
        name: "CF-Gemma4-26B",
        account: "a7995d3f33b6ba57955749337c9abbe0",
        model: "@cf/google/gemma-4-26B-A4B-it",
        keyEnvs: ["CF_AI_TOKEN_2"],
        stripThink: false,
    },
    { // 3. Nemotron-3-120B (NVIDIA) — massive MoE
        id: "cf-nemotron",
        name: "CF-Nemotron-120B",
        account: "194d9aea21482ac893ed81fc6b004864",
        model: "@cf/nvidia/nemotron-3-120b-a12b",
        keyEnvs: ["CF_AI_TOKEN_3"],
        stripThink: false,
    },
    { // 4. Kimi-K2.5 (Moonshot AI) — strong reasoning
        id: "cf-kimi",
        name: "CF-Kimi-K2.5",
        account: "401a75ead25275262c1c05eecb7a997c",
        model: "@cf/moonshotai/kimi-k2.5",
        keyEnvs: ["CF_AI_TOKEN_4"],
        stripThink: true,
    },
    { // 5. GPT-OSS-120B (OpenAI open) — large MoE
        id: "cf-gptoss",
        name: "CF-GPT-OSS-120B",
        account: "73340519f6430362daee759ba0b48ce8",
        model: "@cf/openai/gpt-oss-120b",
        keyEnvs: ["CF_AI_TOKEN_5"],
        stripThink: false,
    },
    { // 6. Qwen3-30B (Alibaba) — excellent coder/reasoner
        id: "cf-qwen3",
        name: "CF-Qwen3-30B",
        account: "df4a7888befcbb6ce3e0a0b346ea1990",
        model: "@cf/qwen/qwen3-30b-a3b-fp8",
        keyEnvs: ["CF_AI_TOKEN_6"],
        stripThink: true,
    },
    { // 7. Llama-4-Scout-17B (Meta) — 16-expert MoE
        id: "cf-llama4",
        name: "CF-Llama4-Scout",
        account: "3cd084561890e5ab468456fae547ded0",
        model: "@cf/meta/llama-4-scout-17b-16e-instruct",
        keyEnvs: ["CF_AI_TOKEN_7"],
        stripThink: false,
    },
    { // 8. Mistral-Small-3.1-24B — reliable workhorse
        id: "cf-mistral",
        name: "CF-Mistral-Small",
        account: "27920eccf7d83f7ee267130cd6018eaf",
        model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
        keyEnvs: ["CF_AI_TOKEN_8"],
        stripThink: false,
    },
    { // 9. DeepSeek-R1-Distill-32B — reasoning distilled
        id: "cf-deepseek",
        name: "CF-DeepSeek-R1",
        account: "60c2dcaa7fc3377f036114648f6397ba",
        model: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        keyEnvs: ["CF_AI_TOKEN_9"],
        stripThink: true,
    },
];

// ── Provider definitions ──────────────────────────────────────────────────────

function getProviders() {
    // Build Cloudflare providers from account map
    const cfProviders = CF_ACCOUNTS.map(cf => ({
        id: cf.id,
        name: cf.name,
        url: `https://api.cloudflare.com/client/v4/accounts/${cf.account}/ai/run/${cf.model}`,
        model: cf.model,
        keys: loadKeys(...cf.keyEnvs),
        authPrefix: "Bearer ",
        responseFormat: "cloudflare",
        timeout: 45000,
        stripThink: cf.stripThink,
    }));

    // Non-Cloudflare providers (fallback after all CF accounts exhausted)
    const otherProviders = [
        {
            id: "cerebras",
            name: "Cerebras",
            url: "https://api.cerebras.ai/v1/chat/completions",
            model: "llama3.1-8b",
            keys: loadKeys("CEREBRAS_API_KEY", "CEREBRAS_KEY", "CEREBRAS_API_KEY_2", "CEREBRAS_API_KEY_3", "CEREBRAS_API_KEY_4", "CEREBRAS_API_KEY_5"),
            authPrefix: "Bearer ",
            responseFormat: "openai",
            timeout: 30000,
        },
        {
            id: "mistral",
            name: "Mistral",
            url: "https://api.mistral.ai/v1/chat/completions",
            model: "mistral-small-latest",
            keys: loadKeys("MISTRAL_API_KEY", "MISTRAL_KEY"),
            authPrefix: "Bearer ",
            responseFormat: "openai",
            timeout: 45000,
        },
        {
            id: "groq",
            name: "Groq",
            url: "https://api.groq.com/openai/v1/chat/completions",
            model: "llama-3.3-70b-versatile",
            keys: loadKeys("GROQ_API_KEY", "LLM_KEY", "GROQ_KEY", "GROQ_API_KEY_2"),
            authPrefix: "Bearer ",
            responseFormat: "openai",
            timeout: 30000,
        },
        {
            id: "sarvam",
            name: "Sarvam",
            url: "https://api.sarvam.ai/v1/chat/completions",
            model: "sarvam-m",
            keys: loadKeys("SARVAM_API_KEY"),
            authPrefix: "Bearer ",
            responseFormat: "openai",
            timeout: 45000,
        },
        {
            id: "cohere",
            name: "Cohere",
            url: "https://api.cohere.com/v2/chat",
            model: "command-r-plus",
            keys: loadKeys("COHERE_API_KEY_1", "COHERE_API_KEY_2", "COHERE_API_KEY_3", "COHERE_API_KEY_4", "COHERE_API_KEY_5", "COHERE_API_KEY_6", "COHERE_API_KEY_7", "COHERE_API_KEY_8"),
            authPrefix: "Bearer ",
            responseFormat: "cohere",
            timeout: 60000,
        },
        {
            id: "openrouter",
            name: "OpenRouter",
            url: "https://openrouter.ai/api/v1/chat/completions",
            model: "qwen/qwen3-coder:free",
            keys: loadKeys("OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPENROUTER_API_KEY_2", "OPENROUTER_API_KEY_3"),
            authPrefix: "Bearer ",
            responseFormat: "openai",
            timeout: 60000,
        },
    ];

    return [...cfProviders, ...otherProviders].filter(p => p.keys.length > 0);
}

// Round-robin key index per provider
const keyIndexes = {};

function loadKeys(...envNames) {
    const keys = [];
    const seen = new Set();
    for (const name of envNames) {
        const val = process.env[name];
        if (val && val.length > 5 && !seen.has(val)) {
            seen.add(val);
            keys.push(val);
        }
    }
    return keys;
}

function nextKey(provider) {
    if (!keyIndexes[provider.id]) keyIndexes[provider.id] = 0;
    const idx = keyIndexes[provider.id] % provider.keys.length;
    keyIndexes[provider.id] = idx + 1;
    return provider.keys[idx];
}

// ── Extract text from provider response ───────────────────────────────────────

function extractText(data, format) {
    if (format === "cloudflare") {
        const inner = data.result || data;
        return inner.choices?.[0]?.message?.content || inner.response || "";
    }
    if (format === "cohere") {
        // Cohere v2 chat format
        return data.message?.content?.[0]?.text || data.text || "";
    }
    // openai-compatible
    return data.choices?.[0]?.message?.content || "";
}

// ── Strip <think>...</think> tags (some models add reasoning) ─────────────────

function stripThinkTags(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// ── Main chain call ───────────────────────────────────────────────────────────

/**
 * Call the LLM chain with automatic multi-provider fallback.
 *
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {Object} opts
 * @param {number} opts.maxTokens - Max tokens (default 1024)
 * @param {number} opts.temperature - Temperature (default 0.5)
 * @param {string} opts.tag - Log prefix, e.g. "HIVEGUIDE" or "FORMAT"
 * @param {number} opts.minLength - Minimum response length to accept (default 10)
 * @returns {Promise<{text: string, provider: string}|null>}
 */
export async function callLLMChain(messages, opts = {}) {
    const {
        maxTokens = 1024,
        temperature = 0.5,
        tag = "LLM-CHAIN",
        minLength = 10,
    } = opts;

    const providers = getProviders();

    if (providers.length === 0) {
        console.warn(`[${tag}] No LLM providers configured -- all env vars missing.`);
        return null;
    }

    for (const provider of providers) {
        const key = nextKey(provider);
        try {
            const body = {
                model: provider.model,
                messages,
                max_tokens: maxTokens,
                temperature,
            };

            const res = await fetch(provider.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `${provider.authPrefix}${key}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(provider.timeout),
            });

            if (!res.ok) {
                const errSnippet = await res.text().catch(() => "");
                console.warn(`[${tag}] ${provider.name} HTTP ${res.status}: ${errSnippet.slice(0, 150)}`);
                continue;
            }

            const data = await res.json();
            let text = extractText(data, provider.responseFormat);
            if (provider.stripThink) text = stripThinkTags(text);
            text = text.trim();

            if (text.length < minLength) {
                console.warn(`[${tag}] ${provider.name} response too short (${text.length} chars)`);
                continue;
            }

            console.log(`[${tag}] OK ${provider.name} -> ${text.length} chars`);
            return { text, provider: provider.name };
        } catch (e) {
            console.warn(`[${tag}] ${provider.name} error: ${e.message}`);
            continue;
        }
    }

    console.error(`[${tag}] All ${providers.length} providers failed.`);
    return null;
}

// ── Startup diagnostic ────────────────────────────────────────────────────────

const providers = getProviders();
console.log(`[LLM-CHAIN] ${providers.length} providers available: ${providers.map(p => `${p.name}(${p.keys.length})`).join(", ")}`);
