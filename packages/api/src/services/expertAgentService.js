/**
 * P2PCLAW Open Problem Solver — Expert Agent Service
 * ====================================================
 * 9 expert agents backed by dedicated API keys (OPS_ prefix).
 * Each agent is assigned a mathematical domain and an LLM provider.
 * The dispatch function handles all provider-specific response formats.
 */

// ── Expert Agent Definitions ────────────────────────────────────────────────

export const EXPERT_AGENTS = [
    {
        id: "cf-kimi-expert",
        name: "Kimi K2.5 Expert",
        provider: "cloudflare",
        role: "Mathematical Reasoner — excels at algebraic manipulation and formal reasoning",
        domains: ["algebra", "number_theory", "combinatorics", "group_theory"],
        config: {
            url: () => {
                const acct = process.env.OPS_CF_ACCOUNT_13 || "1478cd70e3f9b6f6bec25ecb80456bfa";
                return `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/moonshotai/kimi-k2.5`;
            },
            model: "@cf/moonshotai/kimi-k2.5",
            keyEnv: "OPS_CF_TOKEN_13",
            responseFormat: "cloudflare",
            stripThink: true,
            timeout: 90000,
            maxTokens: 4096,
        },
    },
    {
        id: "cerebras-expert",
        name: "Cerebras Qwen-3 Expert",
        provider: "cerebras",
        role: "Fast Computation — rapid iteration on algorithmic approaches and proof search",
        domains: ["computation", "algorithms", "graph_theory"],
        config: {
            url: () => "https://api.cerebras.ai/v1/chat/completions",
            model: "qwen-3-235b-a22b-instruct-2507",
            keyEnv: "OPS_CEREBRAS_KEY_13",
            responseFormat: "openai",
            stripThink: true,
            timeout: 120000,
            maxTokens: 4096,
        },
    },
    {
        id: "groq-expert",
        name: "Groq Llama Expert",
        provider: "groq",
        role: "Literature Analysis — fast paper synthesis and proof sketching",
        domains: ["analysis", "combinatorics", "number_theory"],
        config: {
            url: () => "https://api.groq.com/openai/v1/chat/completions",
            model: "llama-3.3-70b-versatile",
            keyEnv: "OPS_GROQ_KEY_12",
            responseFormat: "openai",
            stripThink: false,
            timeout: 60000,
            maxTokens: 4096,
        },
    },
    {
        id: "cohere-expert",
        name: "Cohere Reasoning Expert",
        provider: "cohere",
        role: "Long-form Reasoning — extended chain-of-thought for complex proofs",
        domains: ["proof_writing", "synthesis", "analysis"],
        config: {
            url: () => "https://api.cohere.com/v2/chat",
            model: "command-a-reasoning-08-2025",
            keyEnv: "OPS_COHERE_KEY_12",
            responseFormat: "cohere",
            stripThink: true,
            timeout: 120000,
            maxTokens: 4096,
        },
    },
    {
        id: "openrouter-expert",
        name: "Qwen 3.6 Plus Expert",
        provider: "openrouter",
        role: "Deep Mathematical Reasoning — large context, strong at formal derivations",
        domains: ["algebra", "number_theory", "group_theory"],
        config: {
            url: () => "https://openrouter.ai/api/v1/chat/completions",
            model: "qwen/qwen3.6-plus:free",
            keyEnv: "OPS_OPENROUTER_KEY_13",
            responseFormat: "openai",
            stripThink: true,
            timeout: 90000,
            maxTokens: 4096,
        },
    },
    {
        id: "nvidia-expert-1",
        name: "NVIDIA DeepSeek-R1 Expert",
        provider: "nvidia",
        role: "Computational Search — deep reasoning with chain-of-thought verification",
        domains: ["computation", "verification", "algorithms"],
        config: {
            url: () => "https://integrate.api.nvidia.com/v1/chat/completions",
            model: "deepseek-ai/deepseek-r1",
            keyEnv: "OPS_NVIDIA_KEY_1",
            responseFormat: "openai",
            stripThink: true,
            timeout: 120000,
            maxTokens: 4096,
        },
    },
    {
        id: "nvidia-expert-2",
        name: "NVIDIA Llama Expert",
        provider: "nvidia",
        role: "Alternative Reasoning — broad mathematical knowledge",
        domains: ["combinatorics", "graph_theory", "analysis"],
        config: {
            url: () => "https://integrate.api.nvidia.com/v1/chat/completions",
            model: "meta/llama-3.3-70b-instruct",
            keyEnv: "OPS_NVIDIA_KEY_2",
            responseFormat: "openai",
            stripThink: false,
            timeout: 90000,
            maxTokens: 4096,
        },
    },
    {
        id: "xiaomi-expert",
        name: "Xiaomi MiMo Expert",
        provider: "xiaomi",
        role: "Quick Verification — fast cross-checking of results",
        domains: ["computation", "verification"],
        config: {
            url: () => "https://api.xiaomimimo.com/v1/chat/completions",
            model: "MiMo-v2-pro",
            keyEnv: "OPS_XIAOMI_KEY_8",
            responseFormat: "openai",
            stripThink: true,
            timeout: 60000,
            maxTokens: 2048,
        },
    },
    {
        id: "sarvam-expert",
        name: "Sarvam Expert",
        provider: "sarvam",
        role: "Fallback Reasoner — reliable backup for any domain",
        domains: ["general", "computation"],
        config: {
            url: () => "https://api.sarvam.ai/v1/chat/completions",
            model: "sarvam-m",
            keyEnv: "OPS_SARVAM_KEY_16",
            responseFormat: "openai",
            stripThink: true,
            timeout: 60000,
            maxTokens: 2048,
        },
    },
];

// ── Agent Selection ─────────────────────────────────────────────────────────

/**
 * Select the best expert agent for a problem based on domain overlap.
 * Returns sorted array of { agent, overlapScore }.
 */
export function rankAgentsForProblem(domainsNeeded) {
    return EXPERT_AGENTS
        .map(agent => {
            const overlap = agent.domains.filter(d => domainsNeeded.includes(d)).length;
            // "general" domain gets a small bonus so sarvam doesn't outrank specialists
            const bonus = agent.domains.includes("general") ? 0.1 : 0;
            return { agent, overlapScore: overlap + bonus };
        })
        .sort((a, b) => b.overlapScore - a.overlapScore);
}

/**
 * Get the best expert for a problem.
 */
export function selectBestAgent(domainsNeeded) {
    const ranked = rankAgentsForProblem(domainsNeeded);
    return ranked[0]?.agent || EXPERT_AGENTS[0];
}

/**
 * Get the second-best expert (for hive consultation phase).
 */
export function selectAlternateAgent(domainsNeeded, excludeId) {
    const ranked = rankAgentsForProblem(domainsNeeded);
    const alt = ranked.find(r => r.agent.id !== excludeId);
    return alt?.agent || EXPERT_AGENTS[EXPERT_AGENTS.length - 1];
}

/**
 * Get all agents with positive domain overlap (for think-tank).
 */
export function selectThinkTankAgents(domainsNeeded) {
    return rankAgentsForProblem(domainsNeeded)
        .filter(r => r.overlapScore > 0)
        .map(r => r.agent);
}

// ── LLM Dispatch ────────────────────────────────────────────────────────────

/**
 * Call an expert agent's LLM with the given messages.
 * Handles all provider-specific response formats.
 *
 * @param {string} agentId - Expert agent ID from EXPERT_AGENTS
 * @param {Array} messages - [{role: "system"|"user"|"assistant", content: string}]
 * @param {Object} opts - { maxTokens?, temperature?, signal? }
 * @returns {{ text: string, provider: string, model: string }}
 */
export async function callExpertAgent(agentId, messages, opts = {}) {
    const agent = EXPERT_AGENTS.find(a => a.id === agentId);
    if (!agent) throw new Error(`Unknown expert agent: ${agentId}`);

    const key = process.env[agent.config.keyEnv];
    if (!key) throw new Error(`Missing env var ${agent.config.keyEnv} for agent ${agent.name}`);

    const { maxTokens = agent.config.maxTokens, temperature = 0.4, signal } = opts;
    const url = agent.config.url();

    const headers = { "Content-Type": "application/json" };
    headers["Authorization"] = `Bearer ${key}`;

    const body = {
        model: agent.config.model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
    };

    const fetchOpts = { method: "POST", headers, body: JSON.stringify(body) };
    if (signal) fetchOpts.signal = signal;
    else fetchOpts.signal = AbortSignal.timeout(agent.config.timeout);

    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`${agent.name} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    let text = "";

    if (agent.config.responseFormat === "cloudflare") {
        const inner = data.result || data;
        text = inner.choices?.[0]?.message?.content || inner.response || "";
    } else if (agent.config.responseFormat === "cohere") {
        const blocks = data.message?.content || [];
        if (Array.isArray(blocks)) {
            const textBlock = blocks.find(b => b.type === "text");
            text = textBlock?.text || blocks[blocks.length - 1]?.text || "";
        } else {
            text = typeof blocks === "string" ? blocks : "";
        }
    } else {
        // OpenAI-compatible (cerebras, groq, openrouter, nvidia, xiaomi, sarvam)
        text = data.choices?.[0]?.message?.content || "";
    }

    // Strip <think>...</think> tags if needed
    if (agent.config.stripThink && text.includes("<think>")) {
        text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (text.startsWith("<think>")) {
            text = text.replace(/<think>[\s\S]*/g, "").trim();
        }
    }

    return { text: text.trim(), provider: agent.name, model: agent.config.model };
}

/**
 * Quick health check: send trivial prompt, return success/error.
 */
export async function testAgent(agentId) {
    const start = Date.now();
    try {
        const result = await callExpertAgent(agentId, [
            { role: "user", content: "Reply with exactly: AGENT_OK" }
        ], { maxTokens: 32, temperature: 0 });
        return {
            agentId,
            status: "ok",
            response: result.text.slice(0, 100),
            provider: result.provider,
            model: result.model,
            latency_ms: Date.now() - start,
        };
    } catch (err) {
        return {
            agentId,
            status: "error",
            error: err.message,
            latency_ms: Date.now() - start,
        };
    }
}

/**
 * List all agents with their key availability status.
 */
export function listAgents() {
    return EXPERT_AGENTS.map(a => ({
        id: a.id,
        name: a.name,
        provider: a.provider,
        role: a.role,
        domains: a.domains,
        model: a.config.model,
        hasKey: !!process.env[a.config.keyEnv],
        keyEnv: a.config.keyEnv,
    }));
}
