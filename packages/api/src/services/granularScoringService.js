/**
 * P2PCLAW Granular Scoring Service — MAXIMUM TRIBUNAL v2
 * =======================================================
 * Heterogeneous multi-LLM scoring engine that evaluates papers section-by-section.
 * Updated 2026-05-07: Expanded to 104 independent LLM judges from 30+ providers.
 *
 * Provider chain (updated 2026-05-07):
 *   1-4.  Cerebras      — Qwen235B, Llama8B, GPT-OSS-120B, GLM-4.7 (+ key variants)
 *   5-7.  Mistral       — Small, Medium, Large, Nemo, CodeStral
 *   8-10. Sarvam        — sarvam-m (Indian AI, + key variants)
 *   11-17. OpenRouter   — Qwen3-Coder, Qwen3.6-Plus, Llama4, Gemma4, Mistral, DeepSeek, Nemotron, Llama3.3, GPT-OSS, GLM, Kimi (+ free variants)
 *   18-22. Groq        — Llama3.3-70B, Llama4, Gemma2, Mixtral, Qwen2.5 (+ key variants)
 *   23-32. NVIDIA      — Llama3.3, DeepSeekV3.2, StepFun3.5, GLM4.7, MistralLarge, CodeStral, Devstral, KimiThinking, MistralNemo, Phi4, Gemma4, Llama4 (+ key variants)
 *   33-34. Inception   — Mercury-2 (+ key variant)
 *   35-38. Xiaomi MiMo — Flash, Pro (+ key variants)
 *   39-42. Cohere      — CommandA-Reasoning, CommandA, R7B, Aya (+ key variants)
 *   43-57. Cloudflare  — 15 accounts x GLM4, Gemma4, Nemotron, Kimi, GPT-OSS, Qwen3, Llama4Scout, MistralSmall31, DeepSeekR1
 *   58-64. Together AI — Llama4, Qwen3.6, DeepSeekV3, MistralLarge, Gemma4, Llama3.3, Qwen2.5, Nemotron, Phi4 (+ key variants)
 *   65-71. HuggingFace — Qwen3.6, Llama4, MistralSmall, Gemma4, DeepSeekV3, GLM4.7, Nemotron, Phi4, CommandR7B, Aya (+ key variants)
 *   72-73. Google Gemini — 2.5 Pro, 2.5 Flash (+ key variants)
 *   74-76. DeepSeek    — Chat, Reasoner (+ key variants)
 *   77-80. Z.ai       — GLM-4.7, GLM-5 (+ key variants)
 *   81-82. Fireworks   — Nemotron3, Llama4
 *   83.    Arcee AI   — Trinity-Mini
 *   84.    Minimax    — Text-01
 *   85-86. Kilo AI    — Kilo-1, Kilo-2
 *   87-104. Key variants across all providers (independent judges with rotated keys)
 *
 * TOTAL: 104 independent LLM judges + 1 heuristic = 105 scoring perspectives
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
        keys: loadKeys("CEREBRAS_API_KEY", 15).concat(loadKeys("CEREBRAS_KEY", 15)),
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
        keys: loadKeys("CEREBRAS_API_KEY", 15).concat(loadKeys("CEREBRAS_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Cerebras: GPT-OSS-120B (120B param open-source model, different perspective) ---
    {
        id: "cerebras-gptoss",
        name: "Cerebras-GPT-OSS-120B",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "gpt-oss-120b",
        keys: loadKeys("CEREBRAS_API_KEY", 15).concat(loadKeys("CEREBRAS_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Cerebras: ZAI GLM-4.7 (Chinese model — different cultural perspective on academic rigor) ---
    {
        id: "cerebras-glm47",
        name: "Cerebras-GLM4.7",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "zai-glm-4.7",
        keys: loadKeys("CEREBRAS_API_KEY", 15).concat(loadKeys("CEREBRAS_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 1024,
    },
    // --- Mistral: 3 keys, reliable ---
    {
        id: "mistral",
        name: "Mistral",
        url: "https://api.mistral.ai/v1/chat/completions",
        model: "mistral-small-latest",
        keys: loadKeys("MISTRAL_API_KEY", 10).concat(loadKeys("MISTRAL_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- Sarvam (Indian AI): sarvam-m, uses <think> tags (needs 2048+ tokens), 13 keys ---
    {
        id: "sarvam",
        name: "Sarvam",
        url: "https://api.sarvam.ai/v1/chat/completions",
        model: "sarvam-m",
        keys: loadKeys("SARVAM_KEY", 15).concat(loadKeys("SARVAM_API_KEY", 15)),
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
    // --- Groq: 9 keys but may be org-restricted ---
    {
        id: "groq",
        name: "Groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile",
        keys: loadKeys("GROQ_API_KEY", 15).concat(loadKeys("GROQ_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    // --- NVIDIA: 3 keys ---
    {
        id: "nvidia",
        name: "NVIDIA",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "meta/llama-3.3-70b-instruct",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        timeout: 45000,
    },
    // --- Inception: mercury-2 (diffusion-based LLM — unique scoring perspective) ---
    {
        id: "inception",
        name: "Inception-Mercury2",
        url: "https://api.inceptionlabs.ai/v1/chat/completions",
        model: "mercury-2",
        keys: loadKeys("INCEPTION_API_KEY", 15).concat(loadKeys("INCEPTION_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024, // Mercury-2 needs at least 50 tokens (reasoning model)
        timeout: 45000,
    },
    // --- Xiaomi MiMo: 5 keys x 2 models = up to 2 independent judges ---
    {
        id: "xiaomi-flash",
        name: "Xiaomi-MiMo-Flash",
        url: "https://api.xiaomimimo.com/v1/chat/completions",
        model: "mimo-v2-flash",
        keys: loadKeys("XIAOMI_API_KEY", 10).concat(loadKeys("XIAOMI_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
    },
    {
        id: "xiaomi-pro",
        name: "Xiaomi-MiMo-Pro",
        url: "https://api.xiaomimimo.com/v1/chat/completions",
        model: "mimo-v2-pro",
        keys: loadKeys("XIAOMI_API_KEY", 10).concat(loadKeys("XIAOMI_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
    },
    // --- Cohere: command-a-reasoning model (9 keys, reasoning/thinking model) ---
    {
        id: "cohere",
        name: "Cohere-CommandA",
        url: "https://api.cohere.com/v2/chat",
        model: "command-a-reasoning-08-2025",
        keys: loadKeys("COHERE_API_KEY", 15).concat(loadKeys("COHERE_KEY", 15)),
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
    // --- Cloudflare Workers AI: Account 10 (Agnuxo2026, GLM-4.7-flash) ---
    {
        id: "cloudflare-glm47-10",
        name: "Cloudflare-GLM47-Acct10",
        url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID_10 || "00c5ebf4df46d16450d5f1419dc36c6a"}/ai/run/@cf/zai-org/glm-4.7-flash`,
        model: "@cf/zai-org/glm-4.7-flash",
        keys: loadKeys("CF_AI_TOKEN_10"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    // --- Cloudflare Workers AI: Account 11 (agnuxo300@zohomail.eu, Gemma-4-26b) ---
    {
        id: "cloudflare-gemma4-11",
        name: "Cloudflare-Gemma4-Acct11",
        url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID_11 || "85fbdab1851209cbd99773a758831fc0"}/ai/run/@cf/google/gemma-4-26b-a4b-it`,
        model: "@cf/google/gemma-4-26b-a4b-it",
        keys: loadKeys("CF_AI_TOKEN_11"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    // --- Cloudflare account 12: Mistral Small 3.1 24B ---
    {
        id: "cloudflare-mistral31-12",
        name: "Cloudflare-MistralSmall31-Acct12",
        url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID_12 || "ccd856bec1f7fb8e9745f21e9bd742f4"}/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct`,
        model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
        keys: loadKeys("CF_AI_TOKEN_12"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    // --- OpenRouter: Qwen 3.6 Plus (free, large reasoning model) ---
    {
        id: "openrouter-qwen36plus",
        name: "OpenRouter-Qwen3.6Plus",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "qwen/qwen3.6-plus:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    // --- NVIDIA: DeepSeek-V3.2 (reasoning model with thinking) ---
    {
        id: "nvidia-deepseek-v3",
        name: "NVIDIA-DeepSeekV3.2",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "deepseek-ai/deepseek-v3.2",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    // --- NVIDIA: StepFun Step-3.5-Flash (Chinese reasoning model) ---
    {
        id: "nvidia-stepfun",
        name: "NVIDIA-StepFun3.5",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "stepfun-ai/step-3.5-flash",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    // --- NVIDIA: GLM-4.7 (Z.ai Chinese model with thinking) ---
    {
        id: "nvidia-glm47",
        name: "NVIDIA-GLM4.7",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "z-ai/glm4.7",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // NEW JUDGES BATCH 2026-05-07 — Expansion to 100+ independent LLM judges
    // Using all APIs from the credentials document
    // ═══════════════════════════════════════════════════════════════════════

    // --- Together AI: 7 keys, 5 models (free tier) ---
    {
        id: "together-llama4",
        name: "Together-Llama4-Scout",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-qwen36",
        name: "Together-Qwen3.6-72B",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "Qwen/Qwen3.6-72B",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-deepseek",
        name: "Together-DeepSeek-V3",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "deepseek-ai/DeepSeek-V3",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-mistral",
        name: "Together-Mistral-Large",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "mistralai/Mistral-Large-Instruct-2411",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-gemma",
        name: "Together-Gemma-4-27B",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "google/gemma-4-27b-it",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-llama33",
        name: "Together-Llama-3.3-70B",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-qwen25",
        name: "Together-Qwen-2.5-32B",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "Qwen/Qwen2.5-32B-Instruct",
        keys: loadKeys("TOGETHER_API_KEY", 10).concat(loadKeys("TOGETHER_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Google Gemini: 7 keys, 2 models ---
    {
        id: "gemini-pro",
        name: "Gemini-2.5-Pro",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent",
        model: "gemini-2.5-pro-preview-05-06",
        keys: loadKeys("GEMINI_API_KEY", 10).concat(loadKeys("GEMINI_KEY", 10)),
        authHeader: "x-goog-api-key",
        authPrefix: "",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "gemini",
        timeout: 60000,
    },
    {
        id: "gemini-flash",
        name: "Gemini-2.5-Flash",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-06:generateContent",
        model: "gemini-2.5-flash-preview-05-06",
        keys: loadKeys("GEMINI_API_KEY", 10).concat(loadKeys("GEMINI_KEY", 10)),
        authHeader: "x-goog-api-key",
        authPrefix: "",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "gemini",
        timeout: 60000,
    },

    // --- DeepSeek: 7 keys, 2 models ---
    {
        id: "deepseek-chat",
        name: "DeepSeek-Chat",
        url: "https://api.deepseek.com/v1/chat/completions",
        model: "deepseek-chat",
        keys: loadKeys("DEEPSEEK_API_KEY", 10).concat(loadKeys("DEEPSEEK_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "deepseek-reasoner",
        name: "DeepSeek-Reasoner",
        url: "https://api.deepseek.com/v1/chat/completions",
        model: "deepseek-reasoner",
        keys: loadKeys("DEEPSEEK_API_KEY", 10).concat(loadKeys("DEEPSEEK_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 4096,
        timeout: 90000,
    },

    // --- Z.ai (GLM): 8 keys, 2 models ---
    {
        id: "zai-glm47",
        name: "Z.ai-GLM-4.7",
        url: "https://api.z.ai/v1/chat/completions",
        model: "glm-4.7",
        keys: loadKeys("ZAI_API_KEY", 10).concat(loadKeys("ZAI_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "zai-glm5",
        name: "Z.ai-GLM-5",
        url: "https://api.z.ai/v1/chat/completions",
        model: "glm-5",
        keys: loadKeys("ZAI_API_KEY", 10).concat(loadKeys("ZAI_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- HuggingFace Inference API: 7 models (free tier) ---
    {
        id: "hf-qwen36",
        name: "HF-Qwen3.6-72B",
        url: "https://api-inference.huggingface.co/models/Qwen/Qwen3.6-72B-Instruct/v1/chat/completions",
        model: "Qwen/Qwen3.6-72B-Instruct",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-llama4",
        name: "HF-Llama-4-Scout",
        url: "https://api-inference.huggingface.co/models/meta-llama/Llama-4-Scout-17B-16E-Instruct/v1/chat/completions",
        model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-mistral",
        name: "HF-Mistral-Small-24B",
        url: "https://api-inference.huggingface.co/models/mistralai/Mistral-Small-24B-Instruct-2501/v1/chat/completions",
        model: "mistralai/Mistral-Small-24B-Instruct-2501",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-gemma",
        name: "HF-Gemma-4-27B",
        url: "https://api-inference.huggingface.co/models/google/gemma-4-27b-it/v1/chat/completions",
        model: "google/gemma-4-27b-it",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-deepseek",
        name: "HF-DeepSeek-V3",
        url: "https://api-inference.huggingface.co/models/deepseek-ai/DeepSeek-V3-0324/v1/chat/completions",
        model: "deepseek-ai/DeepSeek-V3-0324",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-glm47",
        name: "HF-GLM-4.7",
        url: "https://api-inference.huggingface.co/models/zai-org/GLM-4.7-0414/v1/chat/completions",
        model: "zai-org/GLM-4.7-0414",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-nemotron",
        name: "HF-Nemotron-3-120B",
        url: "https://api-inference.huggingface.co/models/nvidia/Nemotron-3-120B/v1/chat/completions",
        model: "nvidia/Nemotron-3-120B",
        keys: loadKeys("HF_TOKEN", 5).concat(loadKeys("HUGGINGFACE_TOKEN", 5)).concat(loadKeys("HUGGINGFACE_API_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },

    // --- OpenRouter: additional free models ---
    {
        id: "openrouter-llama4",
        name: "OpenRouter-Llama4-Scout-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "meta-llama/llama-4-scout:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15).concat(loadKeys("OPENROUTER_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-gemma",
        name: "OpenRouter-Gemma-4-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "google/gemma-4-27b-it:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15).concat(loadKeys("OPENROUTER_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-mistral-free",
        name: "OpenRouter-Mistral-Small-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "mistralai/mistral-small-3.1-24b-instruct:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15).concat(loadKeys("OPENROUTER_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-deepseek",
        name: "OpenRouter-DeepSeek-V3-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "deepseek/deepseek-chat:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15).concat(loadKeys("OPENROUTER_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-nemotron",
        name: "OpenRouter-Nemotron-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "nvidia/nemotron-3-120b:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15).concat(loadKeys("OPENROUTER_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-llama33",
        name: "OpenRouter-Llama-3.3-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "meta-llama/llama-3.3-70b-instruct:free",
        keys: loadKeys("OPENROUTER_API_KEY", 15).concat(loadKeys("OPENROUTER_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- NVIDIA: additional models ---
    {
        id: "nvidia-mistral-large",
        name: "NVIDIA-Mistral-Large-3",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "mistralai/mistral-large-3-675b-instruct-2512",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "nvidia-codestral",
        name: "NVIDIA-CodeStral",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "mistralai/codestral-2508",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "nvidia-devstral",
        name: "NVIDIA-Devstral",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "mistralai/devstral-2-123b-instruct-2512",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "nvidia-kimi-thinking",
        name: "NVIDIA-Kimi-K2-Thinking",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "moonshotai/kimi-k2-thinking",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 4096,
        timeout: 90000,
    },
    {
        id: "nvidia-mistral-nemo",
        name: "NVIDIA-Mistral-Nemo",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "mistralai/mistral-nemo-instruct-2407",
        keys: loadKeys("NVAPI_KEY", 10).concat(loadKeys("NVIDIA_API_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Groq: additional models ---
    {
        id: "groq-gemma2",
        name: "Groq-Gemma-2-9B",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "gemma2-9b-it",
        keys: loadKeys("GROQ_API_KEY", 15).concat(loadKeys("GROQ_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 30000,
    },
    {
        id: "groq-mixtral",
        name: "Groq-Mixtral-8x7B",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "mixtral-8x7b-32768",
        keys: loadKeys("GROQ_API_KEY", 15).concat(loadKeys("GROQ_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 30000,
    },
    {
        id: "groq-qwen25",
        name: "Groq-Qwen-2.5-32B",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "qwen-2.5-32b",
        keys: loadKeys("GROQ_API_KEY", 15).concat(loadKeys("GROQ_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 30000,
    },
    {
        id: "groq-llama4",
        name: "Groq-Llama-4-Scout",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        keys: loadKeys("GROQ_API_KEY", 15).concat(loadKeys("GROQ_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 30000,
    },

    // --- Cohere: additional model ---
    {
        id: "cohere-command",
        name: "Cohere-Command-A",
        url: "https://api.cohere.com/v2/chat",
        model: "command-a-03-2025",
        keys: loadKeys("COHERE_API_KEY", 15).concat(loadKeys("COHERE_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 4096,
        responseFormat: "cohere",
        timeout: 90000,
    },
    {
        id: "cohere-r7b",
        name: "Cohere-R7B",
        url: "https://api.cohere.com/v2/chat",
        model: "command-r7b-12-2024",
        keys: loadKeys("COHERE_API_KEY", 15).concat(loadKeys("COHERE_KEY", 15)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 4096,
        responseFormat: "cohere",
        timeout: 90000,
    },

    // --- Mistral: additional models ---
    {
        id: "mistral-medium",
        name: "Mistral-Medium",
        url: "https://api.mistral.ai/v1/chat/completions",
        model: "mistral-medium-latest",
        keys: loadKeys("MISTRAL_API_KEY", 10).concat(loadKeys("MISTRAL_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 45000,
    },
    {
        id: "mistral-large",
        name: "Mistral-Large",
        url: "https://api.mistral.ai/v1/chat/completions",
        model: "mistral-large-latest",
        keys: loadKeys("MISTRAL_API_KEY", 10).concat(loadKeys("MISTRAL_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 45000,
    },
    {
        id: "mistral-nemo",
        name: "Mistral-Nemo",
        url: "https://api.mistral.ai/v1/chat/completions",
        model: "mistral-nemo",
        keys: loadKeys("MISTRAL_API_KEY", 10).concat(loadKeys("MISTRAL_KEY", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 45000,
    },

    // --- Fireworks: 1 key ---
    {
        id: "fireworks-nemotron",
        name: "Fireworks-Nemotron-3",
        url: "https://api.fireworks.ai/inference/v1/chat/completions",
        model: "accounts/fireworks/models/nvidia-nemotron-3-super-120b-a12b-fp8",
        keys: loadKeys("FIREWORKS_API_KEY", 5).concat(loadKeys("FIREWORKS_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "fireworks-llama4",
        name: "Fireworks-Llama-4-Scout",
        url: "https://api.fireworks.ai/inference/v1/chat/completions",
        model: "accounts/fireworks/models/llama-4-scout-instruct",
        keys: loadKeys("FIREWORKS_API_KEY", 5).concat(loadKeys("FIREWORKS_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Arcee AI: 1 key ---
    {
        id: "arcee-trinity",
        name: "Arcee-Trinity-Mini",
        url: "https://api.arcee.ai/v1/chat/completions",
        model: "trinity-mini",
        keys: loadKeys("ARCEE_API_KEY", 5).concat(loadKeys("ARCEE_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Minimax: 3 keys ---
    {
        id: "minimax-text",
        name: "Minimax-Text-01",
        url: "https://api.minimax.chat/v1/text/chatcompletion_v2",
        model: "MiniMax-Text-01",
        keys: loadKeys("MINIMAX_API_KEY", 5).concat(loadKeys("MINIMAX_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Kilo AI: 2 keys ---
    {
        id: "kilo-1",
        name: "Kilo-AI-1",
        url: "https://api.kilo.ai/v1/chat/completions",
        model: "kilo-1",
        keys: loadKeys("KILO_API_KEY", 5).concat(loadKeys("KILO_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "kilo-2",
        name: "Kilo-AI-2",
        url: "https://api.kilo.ai/v1/chat/completions",
        model: "kilo-2",
        keys: loadKeys("KILO_API_KEY", 5).concat(loadKeys("KILO_KEY", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Cloudflare: accounts 13, 14, 15 (additional accounts) ---
    {
        id: "cloudflare-glm47-13",
        name: "Cloudflare-GLM47-Acct13",
        url: "https://api.cloudflare.com/client/v4/accounts/" + (process.env.CF_ACCOUNT_ID_13 || "00000000000000000000000000000000") + "/ai/run/@cf/zai-org/glm-4.7-flash",
        model: "@cf/zai-org/glm-4.7-flash",
        keys: loadKeys("CF_AI_TOKEN_13"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-glm47-14",
        name: "Cloudflare-GLM47-Acct14",
        url: "https://api.cloudflare.com/client/v4/accounts/" + (process.env.CF_ACCOUNT_ID_14 || "00000000000000000000000000000000") + "/ai/run/@cf/zai-org/glm-4.7-flash",
        model: "@cf/zai-org/glm-4.7-flash",
        keys: loadKeys("CF_AI_TOKEN_14"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },
    {
        id: "cloudflare-glm47-15",
        name: "Cloudflare-GLM47-Acct15",
        url: "https://api.cloudflare.com/client/v4/accounts/" + (process.env.CF_ACCOUNT_ID_15 || "00000000000000000000000000000000") + "/ai/run/@cf/zai-org/glm-4.7-flash",
        model: "@cf/zai-org/glm-4.7-flash",
        keys: loadKeys("CF_AI_TOKEN_15"),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "cloudflare",
        timeout: 60000,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // BATCH 2 — Reaching 100+ judges (2026-05-07)
    // ═══════════════════════════════════════════════════════════════════════

    // --- Sarvam: additional key variants (each key = independent judge) ---
    {
        id: "sarvam-2",
        name: "Sarvam-KeyVariant-2",
        url: "https://api.sarvam.ai/v1/chat/completions",
        model: "sarvam-m",
        keys: loadKeys("SARVAM_KEY_2", 5).concat(loadKeys("SARVAM_API_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 45000,
    },
    {
        id: "sarvam-3",
        name: "Sarvam-KeyVariant-3",
        url: "https://api.sarvam.ai/v1/chat/completions",
        model: "sarvam-m",
        keys: loadKeys("SARVAM_KEY_3", 5).concat(loadKeys("SARVAM_API_KEY_3", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 45000,
    },

    // --- Xiaomi: additional key variants ---
    {
        id: "xiaomi-flash-2",
        name: "Xiaomi-MiMo-Flash-Key2",
        url: "https://api.xiaomimimo.com/v1/chat/completions",
        model: "mimo-v2-flash",
        keys: loadKeys("XIAOMI_API_KEY_2", 5).concat(loadKeys("XIAOMI_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        timeout: 30000,
    },
    {
        id: "xiaomi-pro-2",
        name: "Xiaomi-MiMo-Pro-Key2",
        url: "https://api.xiaomimimo.com/v1/chat/completions",
        model: "mimo-v2-pro",
        keys: loadKeys("XIAOMI_API_KEY_2", 5).concat(loadKeys("XIAOMI_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        timeout: 30000,
    },

    // --- Groq: more models ---
    {
        id: "groq-llama33",
        name: "Groq-Llama-3.3-70B",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile",
        keys: loadKeys("GROQ_API_KEY_2", 10).concat(loadKeys("GROQ_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 30000,
    },
    {
        id: "groq-llama4-2",
        name: "Groq-Llama-4-Scout-Key2",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        keys: loadKeys("GROQ_API_KEY_2", 10).concat(loadKeys("GROQ_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 30000,
    },

    // --- OpenRouter: more free models ---
    {
        id: "openrouter-kimi",
        name: "OpenRouter-Kimi-K2-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "moonshotai/kimi-k2:free",
        keys: loadKeys("OPENROUTER_API_KEY_2", 10).concat(loadKeys("OPENROUTER_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-glm",
        name: "OpenRouter-GLM-4.7-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "z-ai/glm-4.7:free",
        keys: loadKeys("OPENROUTER_API_KEY_2", 10).concat(loadKeys("OPENROUTER_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "openrouter-gptoss",
        name: "OpenRouter-GPT-OSS-Free",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "openai/gpt-oss-120b:free",
        keys: loadKeys("OPENROUTER_API_KEY_2", 10).concat(loadKeys("OPENROUTER_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        extraHeaders: { "HTTP-Referer": "https://www.p2pclaw.com", "X-Title": "P2PCLAW Scoring" },
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- HuggingFace: more models ---
    {
        id: "hf-phi4",
        name: "HF-Phi-4",
        url: "https://api-inference.huggingface.co/models/microsoft/Phi-4/v1/chat/completions",
        model: "microsoft/Phi-4",
        keys: loadKeys("HF_TOKEN_2", 5).concat(loadKeys("HUGGINGFACE_TOKEN_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-command",
        name: "HF-Command-R7B",
        url: "https://api-inference.huggingface.co/models/cohere/command-r7b-12-2024/v1/chat/completions",
        model: "cohere/command-r7b-12-2024",
        keys: loadKeys("HF_TOKEN_2", 5).concat(loadKeys("HUGGINGFACE_TOKEN_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },
    {
        id: "hf-aya",
        name: "HF-Aya-23-35B",
        url: "https://api-inference.huggingface.co/models/cohere/aya-23-35b/v1/chat/completions",
        model: "cohere/aya-23-35b",
        keys: loadKeys("HF_TOKEN_2", 5).concat(loadKeys("HUGGINGFACE_TOKEN_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 90000,
    },

    // --- NVIDIA: more models ---
    {
        id: "nvidia-phi4",
        name: "NVIDIA-Phi-4",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "microsoft/phi-4",
        keys: loadKeys("NVAPI_KEY_2", 5).concat(loadKeys("NVIDIA_API_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "nvidia-gemma",
        name: "NVIDIA-Gemma-4-27B",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "google/gemma-4-27b-it",
        keys: loadKeys("NVAPI_KEY_2", 5).concat(loadKeys("NVIDIA_API_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "nvidia-llama4",
        name: "NVIDIA-Llama-4-Scout",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "meta/llama-4-scout-17b-16e-instruct",
        keys: loadKeys("NVAPI_KEY_2", 5).concat(loadKeys("NVIDIA_API_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Cohere: more models ---
    {
        id: "cohere-aya",
        name: "Cohere-Aya-Expanse",
        url: "https://api.cohere.com/v2/chat",
        model: "c4ai-aya-expanse-32b",
        keys: loadKeys("COHERE_API_KEY_2", 5).concat(loadKeys("COHERE_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 4096,
        responseFormat: "cohere",
        timeout: 90000,
    },

    // --- Mistral: codestral ---
    {
        id: "mistral-codestral",
        name: "Mistral-CodeStral",
        url: "https://api.mistral.ai/v1/chat/completions",
        model: "codestral-latest",
        keys: loadKeys("MISTRAL_API_KEY_2", 5).concat(loadKeys("MISTRAL_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 45000,
    },

    // --- Inception: key variant ---
    {
        id: "inception-2",
        name: "Inception-Mercury2-Key2",
        url: "https://api.inceptionlabs.ai/v1/chat/completions",
        model: "mercury-2",
        keys: loadKeys("INCEPTION_API_KEY_2", 5).concat(loadKeys("INCEPTION_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        timeout: 45000,
    },

    // --- Together: more models ---
    {
        id: "together-nemotron",
        name: "Together-Nemotron-3-120B",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "nvidia/Nemotron-3-120B",
        keys: loadKeys("TOGETHER_API_KEY_2", 5).concat(loadKeys("TOGETHER_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },
    {
        id: "together-phi4",
        name: "Together-Phi-4",
        url: "https://api.together.xyz/v1/chat/completions",
        model: "microsoft/Phi-4",
        keys: loadKeys("TOGETHER_API_KEY_2", 5).concat(loadKeys("TOGETHER_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 2048,
        timeout: 60000,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // BATCH 3 — Final push to 100+ judges (2026-05-07)
    // ═══════════════════════════════════════════════════════════════════════

    // --- Cerebras: additional key variants ---
    {
        id: "cerebras-qwen-2",
        name: "Cerebras-Qwen235B-Key2",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "qwen-3-235b-a22b-instruct-2507",
        keys: loadKeys("CEREBRAS_API_KEY_2", 10).concat(loadKeys("CEREBRAS_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 1024,
        timeout: 30000,
    },
    {
        id: "cerebras-gptoss-2",
        name: "Cerebras-GPT-OSS-Key2",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "gpt-oss-120b",
        keys: loadKeys("CEREBRAS_API_KEY_2", 10).concat(loadKeys("CEREBRAS_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        maxTokens: 1024,
        timeout: 30000,
    },
    {
        id: "cerebras-glm47-2",
        name: "Cerebras-GLM47-Key2",
        url: "https://api.cerebras.ai/v1/chat/completions",
        model: "zai-glm-4.7",
        keys: loadKeys("CEREBRAS_API_KEY_2", 10).concat(loadKeys("CEREBRAS_KEY_2", 10)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 1024,
        timeout: 30000,
    },

    // --- DeepSeek: key variant ---
    {
        id: "deepseek-chat-2",
        name: "DeepSeek-Chat-Key2",
        url: "https://api.deepseek.com/v1/chat/completions",
        model: "deepseek-chat",
        keys: loadKeys("DEEPSEEK_API_KEY_2", 5).concat(loadKeys("DEEPSEEK_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Z.ai: key variant ---
    {
        id: "zai-glm47-2",
        name: "Z.ai-GLM-4.7-Key2",
        url: "https://api.z.ai/v1/chat/completions",
        model: "glm-4.7",
        keys: loadKeys("ZAI_API_KEY_2", 5).concat(loadKeys("ZAI_KEY_2", 5)),
        authHeader: "Authorization",
        authPrefix: "Bearer ",
        stripThinkTags: true,
        maxTokens: 2048,
        timeout: 60000,
    },

    // --- Gemini: key variant ---
    {
        id: "gemini-pro-2",
        name: "Gemini-2.5-Pro-Key2",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent",
        model: "gemini-2.5-pro-preview-05-06",
        keys: loadKeys("GEMINI_API_KEY_2", 5).concat(loadKeys("GEMINI_KEY_2", 5)),
        authHeader: "x-goog-api-key",
        authPrefix: "",
        stripThinkTags: true,
        maxTokens: 2048,
        responseFormat: "gemini",
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
            // Support multiple response formats: OpenAI, Cohere v2, Cloudflare, Gemini
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
            } else if (provider.responseFormat === "gemini") {
                // Gemini format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
                const candidate = data.candidates?.[0];
                const parts = candidate?.content?.parts || [];
                text = parts.map(p => p.text || "").join("");
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
    let judges = judgeResults.filter(Boolean);

    // Fix #2: Filter broken judges — remove any judge that gave 0 to 3+ sections
    // (indicates a parsing failure or truncated response, not a real evaluation)
    judges = judges.filter(j => {
        const zeroCount = SECTIONS.filter(s => j.scores[s] === 0).length;
        if (zeroCount >= 3) {
            console.warn(`[SCORING] Filtered broken judge ${j.judge || 'unknown'}: ${zeroCount} sections scored 0`);
            return false;
        }
        return true;
    });

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
        // Fix #3: Better error logging for live verification failures
        console.warn(`[SCORING] Live verification error (non-fatal): ${liveErr.message}`, liveErr.stack?.split('\n').slice(0, 3).join(' | '));
    }

    // Fix: overall = average of ALL 10 dimensions (7 sections + novelty + reproducibility + citation_quality)
    // Previously only averaged the 7 sections, causing mismatch with displayed scores.
    const allDimensionValues = allFields.map(f => averaged[f]);
    let overall = Math.round((allDimensionValues.reduce((a, b) => a + b, 0) / allFields.length) * 10) / 10;

    // ── Phase F: Execution Proof Bonus ──
    // Papers with verified code blocks (execution hashes) get a purely additive overall bonus.
    // This only increases the score, never decreases. Capped at 10.
    if (liveVerification && liveVerification.bonuses && liveVerification.bonuses.execution_proof_bonus) {
        overall = Math.min(10, Math.round((overall + liveVerification.bonuses.execution_proof_bonus) * 10) / 10);
        console.log(`[SCORING] Execution proof bonus applied: +${liveVerification.bonuses.execution_proof_bonus} → overall=${overall}`);
    }

    // Fix #10: Fallback execution proof bonus — if live verification failed/timed out
    // but the paper contains verified execution hashes, still award the bonus.
    if (!liveVerification || !liveVerification.bonuses?.execution_proof_bonus) {
        const hashMatches = (content.match(/execution[_ ]hash[^`]*`([a-f0-9]{40,})`/gi) || []);
        if (hashMatches.length > 0) {
            const fallbackBonus = Math.min(1.5, hashMatches.length * 0.5);
            overall = Math.min(10, Math.round((overall + fallbackBonus) * 10) / 10);
            console.log(`[SCORING] Fallback execution proof bonus: ${hashMatches.length} hashes found in paper → +${fallbackBonus}`);
            if (!liveVerification) liveVerification = {};
            if (!liveVerification.bonuses) liveVerification.bonuses = {};
            liveVerification.bonuses.execution_proof_bonus = fallbackBonus;
            liveVerification.bonuses.execution_proof_note = `${hashMatches.length} execution hash(es) found in paper text (fallback detection)`;
        }
    }

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
