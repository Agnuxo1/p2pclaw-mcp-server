/**
 * P2PCLAW GitHub Paper Sync Service
 * =================================
 * Copies published papers to the configured GitHub repository.
 *
 * Reliability design:
 *  - At most 3 PUT attempts within one 10-second budget, including response bodies.
 *  - Permission failures are terminal; rate-limit waits must fit that budget.
 *  - 409/422 count as success only after reading identical bytes at the same path.
 *  - false means this copy was not confirmed, not that the paper was unpublished.
 *    This helper is not a durable queue or a guarantee of later delivery.
 */

const MAX_RETRIES = 3;
export const GITHUB_SYNC_TIMEOUT_MS = 10_000;

function buildMarkdown(paperId, paperData, now) {
    const timestamp = paperData.timestamp || now();
    const date = new Date(timestamp).toISOString().split('T')[0];
    const safeTitle = (paperData.title || 'Untitled').replace(/[^\w\s-]/g, '').trim() || 'Untitled';
    const filename = `${date}_${safeTitle.replace(/\s+/g, '_').slice(0, 80)}_${paperId}.md`;

    let md = `# ${paperData.title}\n\n`;
    md += `**Paper ID:** ${paperId}\n`;
    md += `**Author:** ${paperData.author || 'Unknown'} (${paperData.author_id || ''})\n`;
    md += `**Date:** ${new Date(timestamp).toISOString()}\n`;
    md += `**Verification Tier:** ${paperData.tier || 'UNVERIFIED'}\n`;
    if (paperData.ipfs_cid)    md += `**IPFS CID:** \`${paperData.ipfs_cid}\`\n`;
    if (paperData.tier1_proof) md += `**Proof Hash:** \`${paperData.tier1_proof}\`\n`;
    md += `\n---\n\n${paperData.content}\n`;
    if (paperData.lean_proof)  md += `\n\n## Formal Verification Proof\n\n\`\`\`lean\n${paperData.lean_proof}\n\`\`\`\n`;

    return { filename, md };
}

function retryAfterMs(value, now) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : null;
    const delay = seconds === null ? Date.parse(value) - now : seconds * 1000;
    return Number.isFinite(delay) && delay >= 0 ? delay : null;
}

// ── Internal papers that must NEVER reach the public GitHub repo ──────────────
// Agent IDs that are internal tools, not real researchers
const BLOCKED_AGENT_PREFIXES = ['github-actions-validator', 'diagnostic-agent'];
const BLOCKED_TITLE_SUBS     = ['Auto Validator Bootstrap', 'Pipeline Verification Test'];

// Dependency seam keeps tests offline and avoids importing the API entrypoint.
export function createGitHubPaperSync({
    env = process.env, fetchImpl = globalThis.fetch, now = Date.now,
    setTimer = setTimeout, clearTimer = clearTimeout, logger = console,
    timeoutMs = GITHUB_SYNC_TIMEOUT_MS,
} = {}) {
    const token = env.GITHUB_PAPERS_SYNC_TOKEN || env.GITHUB_TOKEN || '';
    const owner = env.GITHUB_PAPERS_REPO_OWNER || 'Agnuxo1';
    const repository = env.GITHUB_PAPERS_REPO_NAME || 'p2pclaw-papers';
    const budget = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.min(timeoutMs, GITHUB_SYNC_TIMEOUT_MS) : GITHUB_SYNC_TIMEOUT_MS;

    return async function syncPaperToGitHub(paperId, paperData) {
        if (!token) return false;
        const controller = new AbortController();
        const deadline = now() + budget;
        const inBudget = () => !controller.signal.aborted && now() < deadline;
        const responses = new Set();
        const closeResponse = response => {
            try { response.body?.cancel()?.catch(() => {}); } catch { /* Already consumed/locked; abort also closes native fetch. */ }
        };
        let deadlineTimer;
        const expired = new Promise(resolve => {
            deadlineTimer = setTimer(() => {
                controller.abort();
                logger.warn('[GH-SYNC] Copy deadline exceeded; confirmation unavailable.');
                resolve(false);
            }, budget);
        });
        const request = async (url, method, body) => {
            if (!inBudget()) throw new Error('COPY_DEADLINE');
            const response = await fetchImpl(url, {
                method,
                redirect: 'error',
                headers: {
                    Authorization: `token ${token}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'P2PCLAW-API/1.0',
                    'Content-Type': 'application/json',
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!inBudget()) {
                closeResponse(response);
                throw new Error('COPY_DEADLINE');
            }
            responses.add(response);
            return response;
        };
        const pause = async delay => {
            if (!inBudget() || delay >= deadline - now()) return false;
            await new Promise(resolve => {
                const timer = setTimer(done, delay);
                function done() {
                    clearTimer(timer);
                    controller.signal.removeEventListener('abort', done);
                    resolve();
                }
                controller.signal.addEventListener('abort', done, { once: true });
            });
            return inBudget();
        };
        const run = async () => {
            const agentId = String(paperData?.agentId || paperData?.author_id || '').toLowerCase();
            const title = paperData?.title || '';
            if (BLOCKED_AGENT_PREFIXES.some(prefix => agentId.startsWith(prefix)) ||
                BLOCKED_TITLE_SUBS.some(part => title.includes(part))) return false;
            const { filename, md } = buildMarkdown(paperId, paperData, now);
            const bytes = Buffer.from(md, 'utf8');
            const url = `https://api.github.com/repos/${owner}/${repository}/contents/${encodeURIComponent(filename)}`;
            const body = { message: `Add paper: ${(paperData.title || paperId).slice(0, 72)}`,
                content: bytes.toString('base64'), branch: 'main' };
            for (let attempt = 1; attempt <= MAX_RETRIES && inBudget(); attempt++) {
                try {
                    const res = await request(url, 'PUT', body);
                    if (!inBudget()) return false;
                    if (res.status === 200 || res.status === 201) return true;
                    if (res.status === 401) {
                        logger.warn('[GH-SYNC] Authentication rejected (401); not retried.');
                        return false;
                    }
                    if (res.status === 409 || res.status === 422) {
                        // Never overwrite a conflict or infer success from a validation error.
                        closeResponse(res);
                        const existing = await request(`${url}?ref=main`, 'GET');
                        if (!inBudget() || existing.status !== 200) return false;
                        const file = await existing.json();
                        if (!inBudget() || file.type !== 'file' || file.path !== filename ||
                            file.encoding !== 'base64' || typeof file.content !== 'string') return false;
                        const encoded = file.content.replace(/\s/g, '');
                        const decoded = Buffer.from(encoded, 'base64');
                        return decoded.toString('base64') === encoded && decoded.equals(bytes);
                    }
                    if (res.status === 403 || res.status === 429) {
                        const remaining = res.headers.get('x-ratelimit-remaining');
                        const retryAfter = retryAfterMs(res.headers.get('retry-after'), now());
                        let secondary = false;
                        if (res.status === 403 && remaining !== '0' && retryAfter === null) {
                            const error = await res.json().catch(() => ({}));
                            secondary = /secondary rate limit|rate limit exceeded|abuse detection/i.test(String(error.message || ''));
                        }
                        if (!inBudget()) return false;
                        if (res.status === 403 && remaining !== '0' && retryAfter === null && !secondary) {
                            logger.warn('[GH-SYNC] Permission rejected (403); not retried.');
                            return false;
                        }
                        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000 - now();
                        const primaryDelay = remaining === '0' && reset > 0 ? reset : null;
                        // GitHub requires at least one minute when no reset/retry hint exists.
                        const delay = retryAfter !== null || primaryDelay !== null
                            ? Math.max(1000, retryAfter ?? 0, primaryDelay ?? 0) : 60_000;
                        logger.warn('[GH-SYNC] Rate limited; retry only if the remaining copy budget permits.');
                        closeResponse(res);
                        if (attempt === MAX_RETRIES || !await pause(delay)) return false;
                        continue;
                    }
                    // Validation, missing repository and other client errors need intervention.
                    if (res.status < 500 || res.status > 599) return false;
                    closeResponse(res);
                } catch {
                    if (!inBudget()) return false;
                    // Network/server failure may be transient. No raw error or response logging.
                }
                if (attempt === MAX_RETRIES || !await pause(1000 * (2 ** (attempt - 1)))) return false;
            }
            return false;
        };
        try {
            // Bound even a stalled response body or a fetch implementation ignoring abort.
            return await Promise.race([run().catch(() => false), expired]);
        } finally {
            clearTimer(deadlineTimer);
            controller.abort();
            for (const response of responses) closeResponse(response);
        }
    };
}

export const syncPaperToGitHub = createGitHubPaperSync();
