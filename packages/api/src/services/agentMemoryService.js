/**
 * P2PCLAW Agent Memory Service
 * ==============================
 * Persistent cross-session memory for autonomous agents.
 * Implements the AgentMemory class from §3.5/§4.4 of the guide.
 *
 * Storage:  Gun.js path "memories/{agentId}/{key}"
 * Search:   SparseEmbeddingStore (TF-IDF bigram hashing, no external model)
 * Pattern:  remember/recall/search — persists across server restarts
 */

import { db } from "../config/gun.js";
import { gunSafe } from "../utils/gunUtils.js";
import { SparseEmbeddingStore } from "./sparse-memory.js";

const MAX_MEMORY_KEYS = 200; // per agent, to prevent unbounded growth

export class AgentMemory {
    /**
     * @param {string} agentId - The agent's unique ID.
     */
    constructor(agentId) {
        this.agentId = agentId;
        this.store   = new SparseEmbeddingStore();
        this.node    = db.get("memories").get(agentId);
    }

    /**
     * Store a key-value in the agent's persistent memory.
     * Optionally provide `text` for semantic search indexing.
     *
     * @param {string} key    - Memory key (e.g. 'current_investigation', 'last_paper').
     * @param {*}      value  - Any JSON-serialisable value.
     * @param {string} [text] - Optional text for semantic embedding (for search).
     */
    async remember(key, value, text = null) {
        const entry = gunSafe({
            key,
            value:     JSON.stringify(value),
            timestamp: Date.now(),
            has_embedding: !!text,
        });
        this.node.get(key).put(entry);
        if (text) {
            this.store.storeText(key, text);
        }
        return this;
    }

    /**
     * Recall a single memory by key.
     * @returns {Promise<*|null>} Parsed value or null if not found.
     */
    async recall(key) {
        return new Promise(resolve => {
            this.node.get(key).once(data => {
                if (!data || !data.value) return resolve(null);
                try {
                    resolve(JSON.parse(data.value));
                } catch {
                    resolve(data.value); // raw string fallback
                }
            });
        });
    }

    /**
     * Load all memories from Gun.js on agent reconnect.
     * Returns a flat object: { key: value, ... }
     */
    async recallAll() {
        return new Promise(resolve => {
            const memories = {};
            this.node.map().once((data, key) => {
                if (!data || !data.value) return;
                try {
                    memories[key] = JSON.parse(data.value);
                } catch {
                    memories[key] = data.value;
                }
            });
            setTimeout(() => resolve(memories), 1500);
        });
    }

    /**
     * Semantic search across memories that were stored with `text`.
     * Returns top-K keys ranked by cosine similarity.
     */
    searchSimilar(queryText, topK = 5) {
        return this.store.searchSimilarText(queryText, topK);
    }

    /**
     * Forget (delete) a specific memory key.
     */
    forget(key) {
        // Gun.js doesn't support true delete — we mark as null/expired
        this.node.get(key).put(gunSafe({ key, value: null, timestamp: Date.now(), deleted: true }));
        this.store.embeddings.delete(key);
    }

    /** Memory stats. */
    stats() {
        return {
            agentId:      this.agentId,
            storeSize:    this.store.size,
            storeMemory:  this.store.memoryStats(),
        };
    }
}

// ── In-process cache: one AgentMemory instance per agentId ────────
const _memoryCache = new Map(); // agentId → AgentMemory

export function getAgentMemory(agentId) {
    if (!_memoryCache.has(agentId)) {
        _memoryCache.set(agentId, new AgentMemory(agentId));
    }
    return _memoryCache.get(agentId);
}

/**
 * Save a key-value to an agent's persistent memory.
 */
export async function saveMemory(agentId, key, value, text = null) {
    const mem = getAgentMemory(agentId);
    await mem.remember(key, value, text);
    return { agentId, key, saved: true };
}

/**
 * Load all memories for an agent.
 */
export async function loadMemory(agentId) {
    const mem = getAgentMemory(agentId);
    const memories = await mem.recallAll();
    return { agentId, memories, count: Object.keys(memories).length };
}
