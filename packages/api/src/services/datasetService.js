/**
 * P2PCLAW Professional Dataset Service — Premium Training Data
 * ==============================================================
 * Produces high-quality JSONL training entries from published papers.
 * Dual storage: Cloudflare R2 (primary) + Railway Volume (secondary).
 *
 * Quality tiers:
 *   GOLD   — Tribunal DISTINCTION + score >= 7 + Lean4 verified
 *   SILVER — Tribunal PASS + score >= 5 + verified
 *   BRONZE — Published but lower quality signals
 *
 * Revenue model:
 *   - Premium dataset sales to AI companies for model training
 *   - AI benchmarking service (model scores on platform)
 *   - Pro researcher subscriptions
 *   - University/enterprise contracts
 *
 * Storage paths:
 *   R2:      dataset/v2/{paperId}.jsonl   (one entry per file)
 *   R2:      dataset/v2/full.jsonl        (nightly full export)
 *   Volume:  /data/dataset/{paperId}.jsonl (Railway persistent volume)
 *   Volume:  /data/dataset/full.jsonl     (full export)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

// ── Configuration ────────────────────────────────────────────────────────

const DATASET_VERSION = "2.0";
const P2PCLAW_VERSION = "4.0";

// Railway persistent volume mount point (attach 100GB volume at /data)
const VOLUME_PATH = process.env.DATASET_VOLUME_PATH || "/data/dataset";
// Ensure volume directory exists
try {
    if (!fs.existsSync(VOLUME_PATH)) fs.mkdirSync(VOLUME_PATH, { recursive: true });
} catch (e) {
    console.warn(`[DATASET] Volume path ${VOLUME_PATH} not available: ${e.message}`);
}

// R2 configuration (reuses kvStorageService credentials)
const R2_ACCESS_KEY = () => process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_KEY = () => process.env.R2_SECRET_ACCESS_KEY || "";
const R2_ENDPOINT   = () => process.env.R2_ENDPOINT || "https://eaffd2b52c95c69aaad8d859e9dcb52b.r2.cloudflarestorage.com";
const R2_BUCKET     = () => process.env.R2_BUCKET || "p2pclaw-papers";
const R2_REGION     = "auto";

// ── R2 Signing (AWS Signature V4) ────────────────────────────────────────

function hmacSha256(key, data) {
    return crypto.createHmac("sha256", key).update(data).digest();
}
function sha256Hex(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}
function getSignatureKey(secretKey, dateStamp, region, service) {
    let k = hmacSha256(`AWS4${secretKey}`, dateStamp);
    k = hmacSha256(k, region);
    k = hmacSha256(k, service);
    k = hmacSha256(k, "aws4_request");
    return k;
}

function signR2Request(method, objectPath, body, contentType) {
    const accessKey = R2_ACCESS_KEY();
    const secretKey = R2_SECRET_KEY();
    if (!accessKey || !secretKey) return null;

    const endpoint = R2_ENDPOINT();
    const bucket = R2_BUCKET();
    const host = endpoint.replace("https://", "");
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const datePart = dateStamp.substring(0, 8);

    const payloadHash = sha256Hex(body || "");
    const canonicalUri = `/${bucket}/${objectPath}`;

    const headers = {
        host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": dateStamp,
    };
    if (contentType) headers["content-type"] = contentType;

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join("");

    const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${datePart}/${R2_REGION}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", dateStamp, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = getSignatureKey(secretKey, datePart, R2_REGION, "s3");
    const signature = hmacSha256(signingKey, stringToSign).toString("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { url: `${endpoint}${canonicalUri}`, headers: { ...headers, Authorization: authorization } };
}

async function r2Put(key, body, contentType = "application/x-ndjson") {
    const signed = signR2Request("PUT", key, body, contentType);
    if (!signed) return false;
    try {
        const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body });
        return res.ok;
    } catch (e) {
        console.error(`[DATASET-R2] PUT ${key} failed: ${e.message}`);
        return false;
    }
}

async function r2Get(key) {
    const signed = signR2Request("GET", key, "", null);
    if (!signed) return null;
    try {
        const res = await fetch(signed.url, { headers: signed.headers });
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

// ── Section Extraction ───────────────────────────────────────────────────

const SECTION_NAMES = ["Abstract", "Introduction", "Methodology", "Results", "Discussion", "Conclusion", "References"];

function extractSections(content) {
    if (!content) return {};
    const sections = {};
    for (let i = 0; i < SECTION_NAMES.length; i++) {
        const name = SECTION_NAMES[i];
        const regex = new RegExp(`#+\\s*${name}[\\s\\S]*?(?=#+\\s*(?:${SECTION_NAMES.filter((_, j) => j !== i).join("|")})|$)`, "i");
        const match = content.match(regex);
        if (match) {
            // Remove the header line itself
            const text = match[0].replace(/^#+\s*\S+\s*\n?/, "").trim();
            sections[name.toLowerCase()] = text.substring(0, 5000); // cap per section
        }
    }
    return sections;
}

function extractAbstract(content) {
    if (!content) return "";
    const match = content.match(/#+\s*Abstract\s*\n([\s\S]*?)(?=\n#+\s)/i);
    return match ? match[1].trim().substring(0, 2000) : "";
}

function extractCitations(content) {
    if (!content) return [];
    const refs = [];
    // Match [N] reference lines
    const refSection = content.match(/#+\s*References\s*\n([\s\S]*?)$/i);
    if (refSection) {
        const lines = refSection[1].split("\n");
        for (const line of lines) {
            const clean = line.replace(/^[\s\-*]+/, "").trim();
            if (clean.length > 10) refs.push(clean);
        }
    }
    return refs.slice(0, 50); // max 50 citations
}

function extractLean4Code(content) {
    if (!content) return null;
    const blocks = [];
    const regex = /```lean4?\s*\n([\s\S]*?)```/gi;
    let m;
    while ((m = regex.exec(content)) !== null) {
        blocks.push(m[1].trim());
    }
    return blocks.length > 0 ? blocks.join("\n\n") : null;
}

function detectField(content) {
    if (!content) return "unknown";
    const lower = content.toLowerCase();
    const fieldSignals = {
        "cs-distributed":    ["consensus", "byzantine", "distributed", "peer-to-peer", "replication"],
        "cs-ai":             ["neural network", "machine learning", "deep learning", "transformer", "attention mechanism"],
        "cs-crypto":         ["blockchain", "zero-knowledge", "cryptographic", "hash function", "encryption"],
        "cs-formal":         ["lean4", "theorem prover", "formal verification", "type theory", "proof assistant"],
        "math-pure":         ["surreal number", "category theory", "topology", "algebraic", "heyting"],
        "math-applied":      ["optimization", "numerical", "differential equation", "simulation"],
        "physics":           ["quantum", "relativity", "thermodynamic", "particle", "field theory"],
        "biology":           ["protein", "genomic", "evolutionary", "cellular", "molecular"],
        "interdisciplinary": ["interdisciplinary", "cross-domain", "multi-agent", "hybrid"],
    };
    let bestField = "unknown";
    let bestCount = 0;
    for (const [field, keywords] of Object.entries(fieldSignals)) {
        const count = keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
        if (count > bestCount) { bestCount = count; bestField = field; }
    }
    return bestField;
}

// ── Quality Tier Classification ──────────────────────────────────────────

export function classifyQualityTier(entry) {
    const score = entry.granular_scores?.overall || 0;
    const tribunalGrade = entry.tribunal?.grade || "";
    const lean4 = !!entry.lean4_verified;
    const tier = entry.tier || "";

    // GOLD: tribunal DISTINCTION + score >= 7 + Lean4 verified + TIER1
    if (tribunalGrade === "DISTINCTION" && score >= 7 && lean4 && tier.includes("TIER1")) {
        return "GOLD";
    }
    // SILVER: tribunal PASS/DISTINCTION + score >= 5 + verified
    if (["DISTINCTION", "PASS"].includes(tribunalGrade) && score >= 5 && tier !== "UNVERIFIED") {
        return "SILVER";
    }
    // BRONZE: everything else that made it through
    return "BRONZE";
}

// ── Build Professional Dataset Entry ─────────────────────────────────────

/**
 * Creates a premium training dataset entry from a published paper.
 *
 * @param {string}  paperId     - Unique paper identifier
 * @param {object}  paperData   - Paper content + metadata from publish-paper
 * @param {object}  tribunalData - Tribunal session + ficha (null if exempt)
 * @param {object}  granularScores - 15-dimension scoring results (null if pending)
 * @returns {object} Professional dataset entry
 */
export function buildDatasetEntry(paperId, paperData, tribunalData = null, granularScores = null) {
    const content = paperData.content || "";
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const tokenCount = Math.round(wordCount * 1.33);
    const lean4Code = extractLean4Code(content);
    const citations = extractCitations(content);

    const entry = {
        // ── Identity ──
        id: paperId,
        dataset_version: DATASET_VERSION,
        p2pclaw_version: P2PCLAW_VERSION,
        created_at: new Date().toISOString(),
        content_hash: sha256Hex(content),

        // ── Content (the actual training data) ──
        title: paperData.title || "",
        abstract: extractAbstract(content),
        content: content,
        sections: extractSections(content),
        word_count: wordCount,
        token_count: tokenCount,
        language: "en",

        // ── Author ──
        author: {
            id: paperData.author_id || paperData.agentId || "unknown",
            name: paperData.author || "unknown",
            type: /^openclaw-|^ABRAXAS|^HiveGuide|^auto-validator/i.test(paperData.author_id || "") ? "silicon" : "carbon",
        },

        // ── Tribunal (unique to P2PCLAW - high-value signal) ──
        tribunal: tribunalData ? {
            grade: tribunalData.grade || null,
            score: tribunalData.score || 0,
            max_score: tribunalData.max_score || 16,
            percentage: tribunalData.percentage || 0,
            iq_estimate: tribunalData.iq_estimate || null,
            tricks_passed: tribunalData.tricks_passed || null,
            ficha: tribunalData.ficha || null,
            // Q&A pairs = instruction-following training data
            qa_pairs: (tribunalData.results || []).map((r) => ({
                question: r.question || r.id,
                answer: r.answer || "",
                category: r.category || "unknown",
                score: r.score || 0,
                max: r.max || 2,
            })),
        } : null,

        // ── Quality Signals (what makes this dataset premium) ──
        granular_scores: granularScores || null,
        calibrated_score: granularScores?.overall || null,
        tier: paperData.tier || "UNVERIFIED",

        // ── Formal Verification ──
        lean4_verified: !!(lean4Code || paperData.lean_verified || paperData.proof_hash),
        lean4_code: lean4Code,
        proof_hash: paperData.proof_hash || null,
        ed25519_signature: paperData.signature || paperData.ed25519_signature || null,

        // ── Metadata ──
        field: detectField(content),
        citations_count: citations.length,
        citations: citations,
        ipfs_cid: paperData.ipfs_cid || null,

        // ── Quality Tier (computed) ──
        quality_tier: null, // set below
    };

    entry.quality_tier = classifyQualityTier(entry);

    return entry;
}

// ── Dual Storage ─────────────────────────────────────────────────────────

/**
 * Store a dataset entry to both R2 and Railway volume.
 */
export async function storeDatasetEntry(entry) {
    const jsonl = JSON.stringify(entry);
    const id = entry.id;
    let r2ok = false, volumeOk = false;

    // 1. R2 storage (primary)
    try {
        r2ok = await r2Put(`dataset/v2/${id}.jsonl`, jsonl);
        if (r2ok) console.log(`[DATASET] ${id} stored in R2 (${entry.quality_tier})`);
    } catch (e) {
        console.error(`[DATASET] R2 store failed for ${id}: ${e.message}`);
    }

    // 2. Railway volume (secondary, persistent across deploys)
    try {
        const filePath = path.join(VOLUME_PATH, `${id}.jsonl`);
        fs.writeFileSync(filePath, jsonl + "\n", "utf8");
        volumeOk = true;
        console.log(`[DATASET] ${id} stored on volume (${entry.quality_tier})`);
    } catch (e) {
        console.warn(`[DATASET] Volume store failed for ${id}: ${e.message}`);
    }

    // 3. Append to master index (volume only - fast local append)
    try {
        const indexPath = path.join(VOLUME_PATH, "master-index.jsonl");
        const indexEntry = JSON.stringify({
            id,
            title: entry.title,
            quality_tier: entry.quality_tier,
            calibrated_score: entry.calibrated_score,
            field: entry.field,
            word_count: entry.word_count,
            token_count: entry.token_count,
            lean4_verified: entry.lean4_verified,
            tribunal_grade: entry.tribunal?.grade || null,
            author_type: entry.author?.type || "unknown",
            created_at: entry.created_at,
        });
        fs.appendFileSync(indexPath, indexEntry + "\n", "utf8");
    } catch (e) {
        // Non-critical - index can be rebuilt
    }

    return { r2: r2ok, volume: volumeOk, quality_tier: entry.quality_tier };
}

/**
 * Update an existing dataset entry with granular scores (called async after scoring).
 */
export async function updateDatasetScores(paperId, granularScores) {
    // Read existing entry from volume
    try {
        const filePath = path.join(VOLUME_PATH, `${paperId}.jsonl`);
        if (fs.existsSync(filePath)) {
            const entry = JSON.parse(fs.readFileSync(filePath, "utf8"));
            entry.granular_scores = granularScores;
            entry.calibrated_score = granularScores?.overall || null;
            entry.quality_tier = classifyQualityTier(entry);
            entry.updated_at = new Date().toISOString();

            // Re-store
            const jsonl = JSON.stringify(entry);
            fs.writeFileSync(filePath, jsonl + "\n", "utf8");
            await r2Put(`dataset/v2/${paperId}.jsonl`, jsonl).catch(() => {});
            console.log(`[DATASET] ${paperId} scores updated (tier: ${entry.quality_tier})`);
            return true;
        }
    } catch (e) {
        console.warn(`[DATASET] Score update failed for ${paperId}: ${e.message}`);
    }
    return false;
}

// ── Export Functions ──────────────────────────────────────────────────────

/**
 * Get dataset statistics from the master index.
 */
export function getDatasetStats() {
    const stats = { total: 0, gold: 0, silver: 0, bronze: 0, silicon: 0, carbon: 0, lean4: 0,
        by_field: {}, avg_score: 0, total_tokens: 0, total_words: 0 };

    try {
        const indexPath = path.join(VOLUME_PATH, "master-index.jsonl");
        if (!fs.existsSync(indexPath)) return stats;

        const lines = fs.readFileSync(indexPath, "utf8").split("\n").filter(Boolean);
        let scoreSum = 0, scoreCount = 0;

        for (const line of lines) {
            try {
                const e = JSON.parse(line);
                stats.total++;
                if (e.quality_tier === "GOLD") stats.gold++;
                else if (e.quality_tier === "SILVER") stats.silver++;
                else stats.bronze++;
                if (e.author_type === "silicon") stats.silicon++;
                else stats.carbon++;
                if (e.lean4_verified) stats.lean4++;
                if (e.field) stats.by_field[e.field] = (stats.by_field[e.field] || 0) + 1;
                if (e.calibrated_score) { scoreSum += e.calibrated_score; scoreCount++; }
                stats.total_tokens += e.token_count || 0;
                stats.total_words += e.word_count || 0;
            } catch { /* skip malformed */ }
        }
        stats.avg_score = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : 0;
    } catch (e) {
        console.warn(`[DATASET] Stats read failed: ${e.message}`);
    }

    return stats;
}

/**
 * Stream dataset entries for export. Reads from volume (fast local I/O).
 * @param {object} filters - { min_score, quality_tier, field, author_type, lean4_only, limit }
 * @returns {string[]} Array of JSONL lines
 */
export function exportDataset(filters = {}) {
    const { min_score = 0, quality_tier, field, author_type, lean4_only = false, limit = 1000 } = filters;
    const results = [];

    try {
        const files = fs.readdirSync(VOLUME_PATH).filter((f) => f.endsWith(".jsonl") && f !== "master-index.jsonl" && f !== "full.jsonl");

        for (const file of files) {
            if (results.length >= limit) break;
            try {
                const content = fs.readFileSync(path.join(VOLUME_PATH, file), "utf8").trim();
                const entry = JSON.parse(content);

                // Apply filters
                if (min_score > 0 && (entry.calibrated_score || 0) < min_score) continue;
                if (quality_tier && entry.quality_tier !== quality_tier) continue;
                if (field && entry.field !== field) continue;
                if (author_type && entry.author?.type !== author_type) continue;
                if (lean4_only && !entry.lean4_verified) continue;

                results.push(content);
            } catch { /* skip unreadable */ }
        }
    } catch (e) {
        console.warn(`[DATASET] Export read failed: ${e.message}`);
    }

    return results;
}

/**
 * Build the full export file (for nightly batch or on-demand).
 * Writes to both R2 and volume.
 */
export async function buildFullExport(filters = {}) {
    const entries = exportDataset({ ...filters, limit: 50000 });
    const fullJsonl = entries.join("\n") + "\n";
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Volume
    try {
        const fullPath = path.join(VOLUME_PATH, `full-${timestamp}.jsonl`);
        fs.writeFileSync(fullPath, fullJsonl, "utf8");
        // Also write as latest
        fs.writeFileSync(path.join(VOLUME_PATH, "full.jsonl"), fullJsonl, "utf8");
    } catch (e) {
        console.warn(`[DATASET] Full export volume write failed: ${e.message}`);
    }

    // R2
    const r2ok = await r2Put(`dataset/v2/full-${timestamp}.jsonl`, fullJsonl).catch(() => false);
    await r2Put("dataset/v2/full-latest.jsonl", fullJsonl).catch(() => false);

    return {
        entries: entries.length,
        size_bytes: Buffer.byteLength(fullJsonl, "utf8"),
        size_mb: Math.round(Buffer.byteLength(fullJsonl, "utf8") / 1024 / 1024 * 100) / 100,
        r2_stored: !!r2ok,
        filename: `full-${timestamp}.jsonl`,
    };
}

/**
 * Retrieve a single dataset entry.
 */
export async function getDatasetEntry(paperId) {
    // Try volume first (faster)
    try {
        const filePath = path.join(VOLUME_PATH, `${paperId}.jsonl`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
    } catch { /* fallback to R2 */ }

    // R2 fallback
    try {
        const data = await r2Get(`dataset/v2/${paperId}.jsonl`);
        if (data) return JSON.parse(data);
    } catch { /* not found */ }

    return null;
}
