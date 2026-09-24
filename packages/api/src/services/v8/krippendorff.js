/**
 * P2PCLAW v8 — Krippendorff's Alpha inter-rater reliability
 * ===========================================================
 * Standard coincidence-matrix formulation (Krippendorff, 2011,
 * "Computing Krippendorff's Alpha-Reliability").
 *
 * alpha = 1 - Do/De
 *   Do = observed disagreement  = (1/n) * sum_{c,k} o_ck * metric(c,k)
 *   De = expected disagreement  = (1/(n*(n-1))) * sum_{c,k} n_c * n_k * metric(c,k)
 *
 * where o_ck is the coincidence matrix built by, for each unit with m
 * pairable (non-missing) values, distributing every ordered pair of
 * values (i != j) with weight 1/(m-1); n_c are the row marginals of o;
 * n is the total number of pairable values across all units used.
 *
 * Units with fewer than 2 pairable values are dropped (they carry no
 * agreement information and are excluded from n and from n_units_used).
 *
 * Special case: when De == 0 (no expected disagreement at all, i.e. all
 * pairable values across all units are identical), alpha is undefined by
 * the classic formula (division by zero). By convention we return
 * alpha = 1 in that degenerate case (perfect agreement: Do is also 0),
 * matching common implementations (e.g. R's `irr` package documents the
 * same convention). This is documented behavior, not an approximation.
 */

function isMissing(v) {
    return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

function nominalDistance(c, k) {
    return c === k ? 0 : 1;
}

function intervalDistance(c, k) {
    const d = c - k;
    return d * d;
}

/**
 * krippendorffAlpha(matrix, {metric})
 * matrix: judges x units, array of arrays. null/undefined/NaN = missing.
 * metric: 'interval' (default) or 'nominal'.
 * Returns {alpha, n_pairable_values, n_units_used}.
 */
export function krippendorffAlpha(matrix, { metric = 'interval' } = {}) {
    if (!Array.isArray(matrix) || matrix.length === 0) {
        return { alpha: null, n_pairable_values: 0, n_units_used: 0 };
    }
    if (matrix.length < 2) {
        // Fewer than 2 judges: agreement is not computable.
        return { alpha: null, n_pairable_values: 0, n_units_used: 0 };
    }

    const distance = metric === 'nominal' ? nominalDistance : intervalDistance;

    const nUnits = Math.max(...matrix.map((row) => row.length));

    // Coincidence matrix, keyed by "c|k" -> weight
    const o = new Map();
    const addO = (c, k, w) => {
        const key = `${c}|${k}`;
        o.set(key, (o.get(key) || 0) + w);
    };

    let n = 0;
    let unitsUsed = 0;

    for (let u = 0; u < nUnits; u++) {
        const vals = [];
        for (const row of matrix) {
            const v = row[u];
            if (!isMissing(v)) vals.push(Number(v));
        }
        const m = vals.length;
        if (m < 2) continue;
        unitsUsed++;
        n += m;
        const w = 1 / (m - 1);
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < m; j++) {
                if (i === j) continue;
                addO(vals[i], vals[j], w);
            }
        }
    }

    if (n === 0 || unitsUsed === 0) {
        return { alpha: null, n_pairable_values: 0, n_units_used: 0 };
    }

    // Row marginals n_c
    const values = new Set();
    for (const key of o.keys()) {
        const [c, k] = key.split('|').map(Number);
        values.add(c);
        values.add(k);
    }
    const valuesArr = Array.from(values);
    const nC = new Map();
    for (const c of valuesArr) {
        let sum = 0;
        for (const k of valuesArr) {
            sum += o.get(`${c}|${k}`) || 0;
        }
        nC.set(c, sum);
    }

    let Do = 0;
    for (const [key, w] of o.entries()) {
        const [c, k] = key.split('|').map(Number);
        Do += w * distance(c, k);
    }
    Do = Do / n;

    let De = 0;
    for (const c of valuesArr) {
        for (const k of valuesArr) {
            De += nC.get(c) * nC.get(k) * distance(c, k);
        }
    }
    De = De / (n * (n - 1));

    let alpha;
    if (De === 0) {
        // No expected disagreement: perfect agreement by convention (Do is 0 too).
        alpha = 1;
    } else {
        alpha = 1 - Do / De;
    }

    return { alpha, n_pairable_values: n, n_units_used: unitsUsed };
}

function interpretAlpha(alpha) {
    if (alpha === null || alpha === undefined || Number.isNaN(alpha)) return 'insufficient';
    if (alpha >= 0.8) return 'reliable';
    if (alpha >= 0.667) return 'tentative';
    return 'low';
}

/**
 * interJudgeAgreement(judgeDetails, fields)
 * judgeDetails: granular scoring judge_details, [{judge, scores:{field:number}}]
 * fields: array of dimension names to include as "units" x each judge as "coder"
 * (matrix rows = judges, columns = fields/dimensions).
 * Returns the contract object.
 */
export function interJudgeAgreement(judgeDetails, fields) {
    const details = Array.isArray(judgeDetails) ? judgeDetails : [];
    const dims = Array.isArray(fields) ? fields : [];

    const nJudges = details.length;
    const nDimensions = dims.length;

    if (nJudges < 2 || nDimensions === 0) {
        return {
            alpha: null,
            metric: 'interval',
            n_judges: nJudges,
            n_dimensions: nDimensions,
            n_pairable_values: 0,
            interpretation: 'insufficient'
        };
    }

    const matrix = details.map((jd) => {
        const scores = (jd && jd.scores) || {};
        return dims.map((f) => {
            const v = scores[f];
            return typeof v === 'number' && !Number.isNaN(v) ? v : null;
        });
    });

    const { alpha, n_pairable_values } = krippendorffAlpha(matrix, { metric: 'interval' });
    const rounded = alpha === null ? null : Math.round(alpha * 1000) / 1000;

    return {
        alpha: rounded,
        metric: 'interval',
        n_judges: nJudges,
        n_dimensions: nDimensions,
        n_pairable_values,
        interpretation: interpretAlpha(rounded)
    };
}
