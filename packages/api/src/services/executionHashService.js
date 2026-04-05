/**
 * Execution Hash Service — Phase A
 *
 * Generates SHA-256 hashes of code executions (code + stdout + seed),
 * stores them in Gun.js under p2pclaw_execution_hashes, and provides
 * verification lookups.
 *
 * EXTENSION ONLY — does not modify any existing service.
 */

import crypto from 'node:crypto';

// ── Configuration ───────────────────────────────────────────────────────────

// Fixed server-side secret seed. In production, set EXEC_HASH_SEED env var.
const HASH_SEED = process.env.EXEC_HASH_SEED || 'p2pclaw-exec-seed-v1-2026';

// In-memory index of execution hashes (survives within process lifetime)
const hashIndex = new Map();

// Gun.js db reference — set via init()
let _db = null;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize the service with a Gun.js database reference.
 * Must be called once at startup.
 *
 * @param {object} db - Gun.js database instance
 */
export function initExecutionHashService(db) {
    _db = db;
    console.log('[EXEC-HASH] Service initialized');
}

/**
 * Generate a SHA-256 execution hash from code + stdout + seed.
 *
 * @param {string} code - The executed code
 * @param {string} stdout - The execution stdout output
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function generateExecutionHash(code, stdout) {
    const payload = `${code || ''}|${stdout || ''}|${HASH_SEED}`;
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Store an execution hash with metadata.
 * Writes to both in-memory index and Gun.js persistent storage.
 *
 * @param {string} hash - The execution hash
 * @param {object} meta - Metadata to store
 * @param {string} meta.paperId - Associated paper ID (if any)
 * @param {string} meta.code - The executed code
 * @param {string} meta.stdout - The execution stdout
 * @param {string} meta.tool - Tool name
 * @param {string} meta.domain - Domain ID
 * @param {boolean} meta.success - Whether execution succeeded
 * @param {number} meta.elapsed_ms - Execution time
 * @param {object} [gunSafeFn] - Optional gunSafe() wrapper function
 */
export function storeExecutionHash(hash, meta, gunSafeFn) {
    const timestamp = Date.now();
    const record = {
        hash,
        paperId: meta.paperId || null,
        code_preview: (meta.code || '').substring(0, 200),
        stdout_preview: (meta.stdout || '').substring(0, 200),
        tool: meta.tool || 'unknown',
        domain: meta.domain || 'unknown',
        success: !!meta.success,
        elapsed_ms: meta.elapsed_ms || 0,
        timestamp
    };

    // In-memory index
    hashIndex.set(hash, record);

    // Gun.js persistent storage
    if (_db) {
        const safeRecord = gunSafeFn ? gunSafeFn(record) : record;
        _db.get('p2pclaw_execution_hashes').get(hash).put(safeRecord);
    }

    return record;
}

/**
 * Verify whether an execution hash exists and return its metadata.
 *
 * @param {string} hash - The execution hash to verify
 * @returns {Promise<{valid: boolean, paperId: string|null, code_preview: string, timestamp: number}|{valid: false}>}
 */
export async function verifyExecutionHash(hash) {
    if (!hash || typeof hash !== 'string' || hash.length !== 64) {
        return { valid: false, reason: 'Invalid hash format (expected 64-char hex SHA-256)' };
    }

    // Check in-memory first (fast path)
    if (hashIndex.has(hash)) {
        const record = hashIndex.get(hash);
        return {
            valid: true,
            paperId: record.paperId,
            code_preview: record.code_preview,
            stdout_preview: record.stdout_preview,
            tool: record.tool,
            domain: record.domain,
            success: record.success,
            elapsed_ms: record.elapsed_ms,
            timestamp: record.timestamp
        };
    }

    // Fallback: check Gun.js (slower, survives restarts if relay is connected)
    if (_db) {
        try {
            const gunRecord = await new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(null), 3000);
                _db.get('p2pclaw_execution_hashes').get(hash).once((data) => {
                    clearTimeout(timeout);
                    resolve(data || null);
                });
            });

            if (gunRecord && gunRecord.hash === hash) {
                // Populate in-memory cache for next lookup
                hashIndex.set(hash, gunRecord);
                return {
                    valid: true,
                    paperId: gunRecord.paperId || null,
                    code_preview: gunRecord.code_preview || '',
                    stdout_preview: gunRecord.stdout_preview || '',
                    tool: gunRecord.tool || 'unknown',
                    domain: gunRecord.domain || 'unknown',
                    success: !!gunRecord.success,
                    elapsed_ms: gunRecord.elapsed_ms || 0,
                    timestamp: gunRecord.timestamp || 0
                };
            }
        } catch (err) {
            console.warn('[EXEC-HASH] Gun.js lookup failed:', err.message);
        }
    }

    return { valid: false, reason: 'Hash not found in execution registry' };
}

/**
 * Link an execution hash to a paper ID (called at publish time).
 *
 * @param {string} hash - The execution hash
 * @param {string} paperId - The paper ID to link
 * @param {object} [gunSafeFn] - Optional gunSafe() wrapper function
 */
export function linkHashToPaper(hash, paperId, gunSafeFn) {
    if (!hash || !paperId) return;

    // Update in-memory
    if (hashIndex.has(hash)) {
        const record = hashIndex.get(hash);
        record.paperId = paperId;
        hashIndex.set(hash, record);
    }

    // Update Gun.js
    if (_db) {
        const update = { paperId };
        const safeUpdate = gunSafeFn ? gunSafeFn(update) : update;
        _db.get('p2pclaw_execution_hashes').get(hash).put(safeUpdate);
    }
}

/**
 * Get the number of stored execution hashes (for stats/monitoring).
 *
 * @returns {number}
 */
export function getHashCount() {
    return hashIndex.size;
}

export default {
    initExecutionHashService,
    generateExecutionHash,
    storeExecutionHash,
    verifyExecutionHash,
    linkHashToPaper,
    getHashCount
};
