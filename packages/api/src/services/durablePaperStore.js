/**
 * Durable paper storage backed by the P2PCLAW Hugging Face dataset.
 *
 * Render's free filesystem and Gun.js graph are ephemeral. Each accepted paper
 * is therefore committed as an individual JSON file. On boot these files are
 * loaded after the bundled GitHub snapshot, so publications survive restarts
 * even when GitHub's shared-IP API limit is exhausted.
 */

import { hfCommitFiles } from "./benchmarkPublisher.js";

const HF_REPO = "Agnuxo/P2PCLAW-Innovative-Benchmark";
const HF_TREE_URL = `https://huggingface.co/api/datasets/${HF_REPO}/tree/main/papers`;
const HF_RAW_BASE = `https://huggingface.co/datasets/${HF_REPO}/resolve/main`;

function safePaperId(paperId) {
    return String(paperId || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function hfHeaders() {
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
    return token
        ? { Authorization: `Bearer ${token}`, "User-Agent": "P2PCLAW-API/2.0" }
        : { "User-Agent": "P2PCLAW-API/2.0" };
}

export function durablePaperStoreConfigured() {
    return !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN);
}

export async function persistDurablePaper(paperId, paperData) {
    if (!durablePaperStoreConfigured()) {
        console.warn(`[DURABLE-PAPER] HF_TOKEN missing; ${paperId} only stored locally`);
        return false;
    }
    const id = safePaperId(paperId);
    if (!id) return false;
    const snapshot = {
        paperId,
        ...paperData,
        _durable_version: 1,
        _persisted_at: Date.now(),
    };
    const ok = await hfCommitFiles(
        HF_REPO,
        [{ path: `papers/${id}.json`, content: JSON.stringify(snapshot) }],
        "dataset",
        `Persist P2PCLAW paper ${id}`,
    );
    if (ok) console.log(`[DURABLE-PAPER] Saved ${paperId} to Hugging Face`);
    else console.error(`[DURABLE-PAPER] Failed to persist ${paperId}`);
    return ok;
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
        while (cursor < items.length) {
            const index = cursor++;
            try { results[index] = await mapper(items[index], index); }
            catch { results[index] = null; }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results.filter(Boolean);
}

export async function loadDurablePapers(limit = 500) {
    try {
        const treeRes = await fetch(`${HF_TREE_URL}?recursive=true&expand=false&limit=1000`, {
            headers: hfHeaders(),
            signal: AbortSignal.timeout(15000),
        });
        if (treeRes.status === 404) return [];
        if (!treeRes.ok) throw new Error(`tree HTTP ${treeRes.status}`);
        const tree = await treeRes.json();
        const files = (Array.isArray(tree) ? tree : [])
            .filter(item => item.type === "file" && item.path?.startsWith("papers/") && item.path.endsWith(".json"))
            .slice(-limit);
        const papers = await mapWithConcurrency(files, 8, async file => {
            const rawRes = await fetch(`${HF_RAW_BASE}/${file.path.split("/").map(encodeURIComponent).join("/")}`, {
                headers: hfHeaders(),
                signal: AbortSignal.timeout(15000),
            });
            if (!rawRes.ok) return null;
            const data = await rawRes.json();
            const paperId = data.paperId || file.path.replace(/^papers\//, "").replace(/\.json$/, "");
            return data?.title && data?.content ? { paperId, data } : null;
        });
        console.log(`[DURABLE-PAPER] Loaded ${papers.length}/${files.length} Hugging Face paper snapshots`);
        return papers;
    } catch (e) {
        console.warn(`[DURABLE-PAPER] Restore failed: ${e.message}`);
        return [];
    }
}
