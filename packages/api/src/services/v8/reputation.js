/**
 * P2PCLAW v8 — Reputation / progress model (Eq. 8 and Eq. 9 of the paper)
 * ==========================================================================
 * Eq. 8 — progress indicator:
 *   P = alpha*(tps/tpsMax) + beta*(vwu/vwuMax) + gamma*clamp01(ig*thetaIG)
 *   (alpha + beta + gamma must equal 1)
 *
 * Eq. 9 — reputation delta with EMA-smoothed quality and cross-agent transfer:
 *   R_delta = lambda*(deltaIJ + (q0i - qBar0i))
 *             + (1-lambda)*(tauBarI/(2*tauBarJ))*dTauJ   (0 if tauBarJ <= 0)
 */

function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

function ratio(num, max) {
    if (!max || max <= 0) return 0;
    return clamp01(num / max);
}

/**
 * progressIndicator({tps, tpsMax, vwu, vwuMax, ig, thetaIG}, {alpha, beta, gamma})
 * alpha + beta + gamma must sum to 1 (throws otherwise).
 */
export function progressIndicator({ tps, tpsMax, vwu, vwuMax, ig, thetaIG }, { alpha = 0.3, beta = 0.5, gamma = 0.2 } = {}) {
    const sum = alpha + beta + gamma;
    if (Math.abs(sum - 1) > 1e-9) {
        throw new Error(`progressIndicator: alpha+beta+gamma must equal 1, got ${sum}`);
    }
    const tpsRatio = ratio(tps, tpsMax);
    const vwuRatio = ratio(vwu, vwuMax);
    const igTerm = clamp01((ig || 0) * (thetaIG || 0));
    return alpha * tpsRatio + beta * vwuRatio + gamma * igTerm;
}

/**
 * updateQualityEMA(qBarPrev, q, lambda)
 * qBar_t = lambda*qBar_{t-1} + (1-lambda)*q ; if qBarPrev is null/undefined -> q.
 */
export function updateQualityEMA(qBarPrev, q, lambda = 0.95) {
    if (qBarPrev === null || qBarPrev === undefined) return q;
    return lambda * qBarPrev + (1 - lambda) * q;
}

/**
 * reputationDelta({deltaIJ, q0i, qBar0i, tauBarI, tauBarJ, dTauJ, lambda})
 * = lambda*(deltaIJ + (q0i - qBar0i)) + (1-lambda)*(tauBarI/(2*tauBarJ))*dTauJ
 * The second term is 0 when tauBarJ <= 0.
 */
export function reputationDelta({ deltaIJ, q0i, qBar0i, tauBarI, tauBarJ, dTauJ }, { lambda = 0.95 } = {}) {
    const localTerm = lambda * (deltaIJ + (q0i - qBar0i));
    let transferTerm = 0;
    if (tauBarJ > 0) {
        transferTerm = (1 - lambda) * (tauBarI / (2 * tauBarJ)) * dTauJ;
    }
    return localTerm + transferTerm;
}

/**
 * applyReputation(R, delta) -> clamps the resulting reputation to [0,1].
 */
export function applyReputation(R, delta) {
    return clamp01((R || 0) + delta);
}
