/**
 * P2PCLAW v8 — Paper lifecycle stage (CONTRACT.md section 1)
 * =============================================================
 * MEMPOOL (status MEMPOOL) -> VERIFIED (status VERIFIED)
 *   -> PROMOTED (status PROMOTED or network_validations >= 2)
 *   -> PODIUM (in current podium top list)
 *   -> CANONICAL (PROMOTED and overall >= 8.5 and ipfs_cid present)
 */

function parseGranularScores(paper) {
    const gs = paper && paper.granular_scores;
    if (!gs) return null;
    if (typeof gs === 'string') {
        try {
            return JSON.parse(gs);
        } catch {
            return null;
        }
    }
    return gs;
}

function overallScore(paper) {
    const gs = parseGranularScores(paper);
    if (gs && typeof gs.overall === 'number') return gs.overall;
    if (typeof paper.score === 'number') return paper.score;
    return null;
}

function networkValidationsCount(paper) {
    const field = paper.network_validations !== undefined ? paper.network_validations : paper.validations;
    if (Array.isArray(field)) return field.length;
    if (typeof field === 'number') return field;
    return 0;
}

/**
 * lifecycleStage(paper, {podiumIds, canonicalThreshold})
 * Returns one of "MEMPOOL" | "VERIFIED" | "PROMOTED" | "PODIUM" | "CANONICAL".
 */
export function lifecycleStage(paper, { podiumIds = new Set(), canonicalThreshold = 8.5 } = {}) {
    if (!paper) return 'MEMPOOL';

    const status = paper.status;
    const validations = networkValidationsCount(paper);
    const overall = overallScore(paper);
    const isPromoted = status === 'PROMOTED' || validations >= 2;
    const isVerified = status === 'VERIFIED' || isPromoted;
    const inPodium = podiumIds && podiumIds.has ? podiumIds.has(paper.id) : false;
    const isCanonical = isPromoted && overall !== null && overall >= canonicalThreshold && Boolean(paper.ipfs_cid);

    if (isCanonical) return 'CANONICAL';
    if (inPodium && isPromoted) return 'PODIUM';
    if (isPromoted) return 'PROMOTED';
    if (isVerified) return 'VERIFIED';
    return 'MEMPOOL';
}
