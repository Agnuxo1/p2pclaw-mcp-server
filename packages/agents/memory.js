/**
 * P2PCLAW Agent Memory — Persistent Multi-Session Memory via Gun.js
 * ==================================================================
 * Implements §4.3.3 of P2PCLAW_Guia_Implementacion_Completa.md
 * Uses sparse embeddings (Veselov) for semantic search.
 *
 * Usage:
 *   const mem = new AgentMemory(gun, 'editor-citations');
 *   await mem.loadFromNetwork();
 *   await mem.remember('paper-xyz', { processed: true, title: '...' });
 *   const prev = await mem.recall('paper-xyz');
 *   const similar = mem.searchSimilar('decentralized peer review', 5);
 */

import Gun from "gun";
import "gun/sea.js";

const DIM = 512; // sparse embedding dimensions

class SparseEmbeddingStoreLight {
    constructor() { this.embeddings = new Map(); }

    storeText(id, text) {
        const arr = new Float32Array(DIM);
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
        for (const word of words) {
            let h = 0;
            for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) % DIM;
            arr[h] += 1;
        }
        let norm = 0;
        for (let i = 0; i < DIM; i++) norm += arr[i] * arr[i];
        norm = Math.sqrt(norm) || 1;
        const sparse = new Map();
        for (let i = 0; i < DIM; i++) if (arr[i] / norm > 0.01) sparse.set(i, arr[i] / norm);
        this.embeddings.set(id, sparse);
    }

    search(queryText, topK = 5) {
        const q = new Float32Array(DIM);
        const words = queryText.toLowerCase().split(/\W+/).filter(w => w.length > 2);
        for (const word of words) {
            let h = 0;
            for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) % DIM;
            q[h] += 1;
        }
        let qn = 0;
        for (let i = 0; i < DIM; i++) qn += q[i] * q[i];
        qn = Math.sqrt(qn) || 1;

        const results = [];
        for (const [id, sparse] of this.embeddings) {
            let dot = 0, n2 = 0;
            for (const [i, v] of sparse) { dot += (q[i] / qn) * v; n2 += v * v; }
            results.push({ id, similarity: dot / (Math.sqrt(n2) + 1e-9) });
        }
        return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    }
}

export class AgentMemory {
    constructor(gun, agentId) {
        this.gun     = gun;
        this.agentId = agentId;
        this.store   = new SparseEmbeddingStoreLight();
        this.local   = new Map(); // in-memory cache
        this.node    = gun.get('memories').get(agentId);
    }

    /** Store a memory entry. Optionally indexes the value text for semantic search. */
    async remember(key, value, indexText = null) {
        const entry = {
            key,
            value:     JSON.stringify(value),
            timestamp: Date.now()
        };
        this.local.set(key, value);
        this.node.get(key).put(entry);
        if (indexText) this.store.storeText(key, indexText);
    }

    /** Recall a single key. Returns null if not found. */
    async recall(key) {
        // Check local cache first
        if (this.local.has(key)) return this.local.get(key);
        return new Promise(resolve => {
            this.node.get(key).once(data => {
                if (!data || !data.value) return resolve(null);
                try {
                    const v = JSON.parse(data.value);
                    this.local.set(key, v);
                    resolve(v);
                } catch { resolve(null); }
            });
        });
    }

    /** Load all memories from Gun.js into local cache. Call on agent boot. */
    async loadFromNetwork(timeoutMs = 3000) {
        return new Promise(resolve => {
            const count = { n: 0 };
            this.node.map().once((data, key) => {
                if (!data || !data.value) return;
                try {
                    const v = JSON.parse(data.value);
                    this.local.set(key, v);
                    if (data.value) this.store.storeText(key, data.value.slice(0, 200));
                    count.n++;
                } catch { /* skip malformed */ }
            });
            setTimeout(() => {
                console.log(`[AgentMemory:${this.agentId}] Loaded ${count.n} memories from network.`);
                resolve(this.local);
            }, timeoutMs);
        });
    }

    /** Search memories semantically by text query. */
    searchSimilar(queryText, topK = 5) {
        return this.store.search(queryText, topK);
    }

    /** Check if a paperId was already processed by this agent. */
    hasProcessed(paperId) {
        const mem = this.local.get(`processed:${paperId}`);
        return !!mem;
    }

    /** Mark a paperId as processed. */
    async markProcessed(paperId, metadata = {}) {
        await this.remember(`processed:${paperId}`, { paperId, ...metadata, ts: Date.now() });
    }

    /** Get all processed paper IDs. */
    getProcessedIds() {
        const ids = [];
        for (const key of this.local.keys()) {
            if (key.startsWith('processed:')) ids.push(key.replace('processed:', ''));
        }
        return ids;
    }

    get size() { return this.local.size; }
}
