/**
 * Paper Persistence — Railway Volume Storage
 *
 * Saves papers to /data/papers/ as JSON files. Survives Railway redeploys.
 * Papers are loaded back into paperCache at boot, BEFORE the slower GitHub restore.
 *
 * Storage format: /data/papers/{paperId}.json
 * Each file contains the full paper object (title, content, author, scores, etc.)
 */

import fs from 'fs';
import path from 'path';

const PAPERS_DIR = '/data/papers';
const FALLBACK_DIR = '/tmp/papers'; // Use /tmp if /data not mounted (local dev)

let activeDir = PAPERS_DIR;

// Ensure directory exists
function ensureDir() {
    try {
        if (fs.existsSync('/data')) {
            if (!fs.existsSync(PAPERS_DIR)) fs.mkdirSync(PAPERS_DIR, { recursive: true });
            activeDir = PAPERS_DIR;
        } else {
            if (!fs.existsSync(FALLBACK_DIR)) fs.mkdirSync(FALLBACK_DIR, { recursive: true });
            activeDir = FALLBACK_DIR;
            console.log(`[PAPER-PERSIST] /data not mounted, using ${FALLBACK_DIR} (non-persistent)`);
        }
    } catch (e) {
        console.warn(`[PAPER-PERSIST] Failed to create dir: ${e.message}`);
        activeDir = FALLBACK_DIR;
        try { fs.mkdirSync(FALLBACK_DIR, { recursive: true }); } catch(_) {}
    }
}

ensureDir();

/**
 * Save a paper to disk. Called after publish and after scoring.
 * Non-blocking: errors are logged but don't break the API.
 */
export function savePaper(paperId, paperData) {
    try {
        const filePath = path.join(activeDir, `${paperId}.json`);
        // Merge with existing data if file already exists (e.g., adding scores to existing paper)
        let existing = {};
        try {
            if (fs.existsSync(filePath)) {
                existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch(_) {}

        const merged = { ...existing, ...paperData, _persisted_at: Date.now() };
        fs.writeFileSync(filePath, JSON.stringify(merged), 'utf8');
    } catch (e) {
        console.warn(`[PAPER-PERSIST] Save failed for ${paperId}: ${e.message}`);
    }
}

/**
 * Update only the scores of a persisted paper.
 */
export function saveScores(paperId, scores) {
    try {
        const filePath = path.join(activeDir, `${paperId}.json`);
        if (!fs.existsSync(filePath)) return;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.granular_scores = scores;
        data._scored_at = Date.now();
        fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (e) {
        console.warn(`[PAPER-PERSIST] Score save failed for ${paperId}: ${e.message}`);
    }
}

/**
 * Load all papers from disk into paperCache.
 * Called at boot BEFORE the GitHub restore.
 * Returns { count, papers } where papers is an array of { paperId, data }.
 */
export function loadAllPapers() {
    const results = [];
    try {
        if (!fs.existsSync(activeDir)) return { count: 0, papers: [] };
        const files = fs.readdirSync(activeDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const filePath = path.join(activeDir, file);
                const raw = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(raw);
                const paperId = file.replace('.json', '');
                results.push({ paperId, data });
            } catch (_) { /* skip malformed files */ }
        }
        console.log(`[PAPER-PERSIST] Loaded ${results.length} papers from ${activeDir}`);
    } catch (e) {
        console.warn(`[PAPER-PERSIST] Load failed: ${e.message}`);
    }
    return { count: results.length, papers: results };
}

/**
 * Get the active storage directory path.
 */
export function getPersistDir() {
    return activeDir;
}

console.log(`[PAPER-PERSIST] Initialized. Storage: ${activeDir}`);
