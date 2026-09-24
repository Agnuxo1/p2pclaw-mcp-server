/**
 * P2PCLAW v8 — Aether math primitives (HSR weighting, Chebyshev bounds,
 * PD governor, attention pruning upper bound).
 */

/**
 * hsrLevelWeight(j, {phi, beta}) = 10^(phi * j^beta)
 * j >= 1, phi > 0, beta in (0,1].
 */
export function hsrLevelWeight(j, { phi = 1.0, beta = 0.5 } = {}) {
    if (!(j >= 1)) throw new RangeError('hsrLevelWeight: j must be >= 1');
    if (!(phi > 0)) throw new RangeError('hsrLevelWeight: phi must be > 0');
    if (!(beta > 0 && beta <= 1)) throw new RangeError('hsrLevelWeight: beta must be in (0,1]');
    return Math.pow(10, phi * Math.pow(j, beta));
}

/**
 * chebyshevEvictionBound(k) = 1/k^2, k > 0.
 * Theoretical upper bound on the fraction of values with |x-mean| >= k*sd.
 */
export function chebyshevEvictionBound(k) {
    if (!(k > 0)) throw new RangeError('chebyshevEvictionBound: k must be > 0');
    return 1 / (k * k);
}

/**
 * chebyshevGuard(values, k) -> indices of values with |x-mean| >= k*sd (population sd).
 */
export function chebyshevGuard(values, k = 2) {
    if (!Array.isArray(values) || values.length === 0) return [];
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    const sd = Math.sqrt(variance);
    if (sd === 0) return [];
    const indices = [];
    for (let i = 0; i < n; i++) {
        if (Math.abs(values[i] - mean) >= k * sd) indices.push(i);
    }
    return indices;
}

/**
 * pdGovernorStep({a, e, ePrev, beta}) = a + e + beta*(e - ePrev), clamped >= 0.
 */
export function pdGovernorStep({ a, e, ePrev, beta }) {
    const raw = a + e + beta * (e - ePrev);
    return Math.max(0, raw);
}

function norm(vec) {
    return Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
}

function meanVector(vectors) {
    const n = vectors.length;
    const dim = vectors[0].length;
    const mean = new Array(dim).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++) mean[i] += v[i];
    }
    for (let i = 0; i < dim; i++) mean[i] /= n;
    return mean;
}

function distance(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        s += d * d;
    }
    return Math.sqrt(s);
}

/**
 * attentionUpperBound(q, bBar, rB) = ||q|| * (||bBar|| + rB)
 * Upper bound on max_x (q . x) for x within radius rB of centroid bBar.
 */
export function attentionUpperBound(q, bBar, rB) {
    return norm(q) * (norm(bBar) + rB);
}

/**
 * canPruneBlock(q, block, theta)
 * block: array of vectors (arrays of numbers).
 * bBar = mean of block vectors, rB = max distance from bBar to any block vector.
 * Returns {prune: bound < theta, bound}.
 */
export function canPruneBlock(q, block, theta) {
    if (!Array.isArray(block) || block.length === 0) {
        return { prune: true, bound: 0 };
    }
    const bBar = meanVector(block);
    let rB = 0;
    for (const x of block) {
        rB = Math.max(rB, distance(x, bBar));
    }
    const bound = attentionUpperBound(q, bBar, rB);
    return { prune: bound < theta, bound };
}
