/**
 * P2PCLAW Shared LLM Chain
 * ========================
 * Multi-provider fallback chain used by HiveGuide, Format Service, Abraxas,
 * and any other service that needs reliable LLM completions.
 *
 * Priority: Cloudflare GLM-4 (free) → Cerebras (free) → Mistral → Groq → NVIDIA → OpenRouter
 *
 * Usage:
 *   import { callLLMChain } from './llmChain.js';
 *   const text = await callLLMChain(messages, { maxTokens: 300, temperature: 0.5, tag: "HIVEGUIDE" });
 */

// ── Provider definitions ──────────────────────────────────────────────────────

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "eaffd2b52c95c69aaad8d859e9dcb52b";

function getProviders() {
    return [
        {
            id: "cloudflare-glm",
            name: "Cloudflare GLM-4",
            url: `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/zai-org/glm-4.7-flash`,
            model: "@cf/zai-org/glm-4.7-flash",
            keys: loadKeys("CF_AI_TOKEN", "CLOUDFLARE_AI_TOKEN"),
            authPrefix: "Bearer ",
            responseFormat: "cloudflare",
            timeout: 30000,
        },
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
            id: "nvidia",
            name: "NVIDIA",
            url: "https://integrate.api.nvidia.com/v1/chat/completions",
            model: "meta/llama-3.3-70b-instruct",
            keys: loadKeys("NVIDIA_API_KEY", "NVIDIA_KEY"),
            authPrefix: "Bearer ",
            responseFormat: "openai",
            timeout: 45000,
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
    ].filter(p => p.keys.length > 0);
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
        console.warn(`[${tag}] No LLM providers configured — all env vars missing.`);
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
            text = stripThinkTags(text).trim();

            if (text.length < minLength) {
                console.warn(`[${tag}] ${provider.name} response too short (${text.length} chars)`);
                continue;
            }

            console.log(`[${tag}] ✓ ${provider.name} → ${text.length} chars`);
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
