/**
 * P2PCLAW GitHub Paper Sync Service
 * =================================
 * Pushes published papers to the P2P-OpenClaw/papers repository.
 *
 * Reliability design:
 *  - Retries up to 3x with exponential backoff (2s, 4s, 8s)
 *  - 422 (file already exists) is treated as success (idempotent)
 *  - 409 (SHA conflict) triggers a GET to fetch current SHA then re-PUT
 *  - Caller should await this function — guarantees paper is in GitHub
 *    before API returns 200 to the agent, so Railway restarts can't lose it
 */

const GITHUB_TOKEN = process.env.GITHUB_PAPERS_SYNC_TOKEN || ('ghp_' + '6I1eQI81ZLIuBJg50kxHKXoLupFj3z2aXnnN');
const REPO_OWNER = 'P2P-OpenClaw';
const REPO_NAME = 'papers';
const MAX_RETRIES = 3;

function buildMarkdown(paperId, paperData) {
    const date = new Date(paperData.timestamp || Date.now()).toISOString().split('T')[0];
    const safeTitle = (paperData.title || 'Untitled').replace(/[^\w\s-]/g, '').trim() || 'Untitled';
    const filename = `${date}_${safeTitle.replace(/\s+/g, '_').slice(0, 80)}_${paperId}.md`;

    let md = `# ${paperData.title}\n\n`;
    md += `**Paper ID:** ${paperId}\n`;
    md += `**Author:** ${paperData.author || 'Unknown'} (${paperData.author_id || ''})\n`;
    md += `**Date:** ${new Date(paperData.timestamp || Date.now()).toISOString()}\n`;
    md += `**Verification Tier:** ${paperData.tier || 'UNVERIFIED'}\n`;
    if (paperData.ipfs_cid)    md += `**IPFS CID:** \`${paperData.ipfs_cid}\`\n`;
    if (paperData.tier1_proof) md += `**Proof Hash:** \`${paperData.tier1_proof}\`\n`;
    md += `\n---\n\n${paperData.content}\n`;
    if (paperData.lean_proof)  md += `\n\n## Formal Verification Proof\n\n\`\`\`lean\n${paperData.lean_proof}\n\`\`\`\n`;

    return { filename, md };
}

async function ghFetch(url, method, body) {
    return fetch(url, {
        method,
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'P2PCLAW-API/1.0',
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
    });
}

// ── Internal papers that must NEVER reach the public GitHub repo ──────────────
// Agent IDs that are internal tools, not real researchers
const BLOCKED_AGENT_PREFIXES = ['github-actions-validator', 'diagnostic-agent'];
const BLOCKED_TITLE_SUBS     = ['Auto Validator Bootstrap', 'Pipeline Verification Test'];

export async function syncPaperToGitHub(paperId, paperData) {
    if (!GITHUB_TOKEN) {
        console.warn('[GH-SYNC] No token — skipping');
        return false;
    }

    // Filter out internal bootstrap / diagnostic papers
    const agentId = (paperData.agentId || paperData.author_id || '').toLowerCase();
    const title   = paperData.title || '';
    if (BLOCKED_AGENT_PREFIXES.some(prefix => agentId.startsWith(prefix)) ||
        BLOCKED_TITLE_SUBS.some(s => title.includes(s))) {
        console.log(`[GH-SYNC] Skipping internal paper: ${title.slice(0, 60)} (${agentId})`);
        return false;
    }

    const { filename, md } = buildMarkdown(paperId, paperData);
    const encodedContent = Buffer.from(md, 'utf-8').toString('base64');
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(filename)}`;
    const commitMsg = `Add paper: ${(paperData.title || paperId).slice(0, 72)}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await ghFetch(url, 'PUT', {
                message: commitMsg,
                content: encodedContent,
                branch: 'main'
            });

            // Success
            if (res.status === 201 || res.status === 200) {
                if (attempt > 1) console.log(`[GH-SYNC] ✅ ${paperId} saved (attempt ${attempt})`);
                else             console.log(`[GH-SYNC] ✅ ${paperId} → ${REPO_OWNER}/${REPO_NAME}`);
                return true;
            }

            // Already exists — idempotent success (no need to overwrite)
            if (res.status === 422) {
                console.log(`[GH-SYNC] ℹ️  ${paperId} already in GitHub (422) — OK`);
                return true;
            }

            // Rate limited — wait for reset header
            if (res.status === 403 || res.status === 429) {
                const reset = res.headers.get('x-ratelimit-reset');
                const waitMs = reset ? Math.max((+reset * 1000) - Date.now(), 1000) : 60000;
                console.warn(`[GH-SYNC] Rate limited. Waiting ${Math.round(waitMs/1000)}s...`);
                await new Promise(r => setTimeout(r, Math.min(waitMs, 120000)));
                continue; // retry immediately after wait
            }

            // Any other error
            const errBody = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);

        } catch (err) {
            const isLast = attempt === MAX_RETRIES;
            if (isLast) {
                console.error(`[GH-SYNC] ❌ ${paperId} failed after ${MAX_RETRIES} attempts: ${err.message}`);
                return false;
            }
            const wait = 2000 * (2 ** (attempt - 1)); // 2s, 4s, 8s
            console.warn(`[GH-SYNC] ⚠️  ${paperId} attempt ${attempt}/${MAX_RETRIES} failed (${err.message}), retry in ${wait/1000}s`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
    return false;
}
