import {
    hsrLevelWeight,
    chebyshevEvictionBound,
    chebyshevGuard,
    pdGovernorStep,
    attentionUpperBound,
    canPruneBlock
} from '../../../packages/api/src/services/v8/aetherMath.js';

// Deterministic seeded PRNG (mulberry32) for property-style tests.
function mulberry32(seed) {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('hsrLevelWeight', () => {
    test('w1 = 10, w4 = 100, w9 = 1000 (phi=1, beta=0.5 defaults)', () => {
        expect(hsrLevelWeight(1)).toBeCloseTo(10, 6);
        expect(hsrLevelWeight(4)).toBeCloseTo(100, 6);
        expect(hsrLevelWeight(9)).toBeCloseTo(1000, 6);
    });

    test('throws RangeError for invalid beta', () => {
        expect(() => hsrLevelWeight(1, { beta: 0 })).toThrow(RangeError);
        expect(() => hsrLevelWeight(1, { beta: 1.5 })).toThrow(RangeError);
    });

    test('throws RangeError for invalid phi', () => {
        expect(() => hsrLevelWeight(1, { phi: 0 })).toThrow(RangeError);
        expect(() => hsrLevelWeight(1, { phi: -1 })).toThrow(RangeError);
    });

    test('throws RangeError for j < 1', () => {
        expect(() => hsrLevelWeight(0)).toThrow(RangeError);
    });
});

describe('chebyshevEvictionBound', () => {
    test('1/k^2', () => {
        expect(chebyshevEvictionBound(2)).toBeCloseTo(0.25, 6);
        expect(chebyshevEvictionBound(4)).toBeCloseTo(0.0625, 6);
    });
});

describe('chebyshevGuard', () => {
    test('respects the theorem bound over 200 seeded trials', () => {
        const rng = mulberry32(12345);
        const k = 2;
        const bound = chebyshevEvictionBound(k);
        for (let trial = 0; trial < 200; trial++) {
            const n = 50 + Math.floor(rng() * 50);
            const values = Array.from({ length: n }, () => rng() * 100 - 50);
            const flagged = chebyshevGuard(values, k);
            const fraction = flagged.length / n;
            expect(fraction).toBeLessThanOrEqual(bound + 1e-9);
        }
    });

    test('returns empty array for constant values (sd=0)', () => {
        expect(chebyshevGuard([5, 5, 5, 5], 2)).toEqual([]);
    });
});

describe('pdGovernorStep', () => {
    test('clamps to 0 when result would be negative', () => {
        const step = pdGovernorStep({ a: -10, e: 0, ePrev: 0, beta: 0.5 });
        expect(step).toBe(0);
    });

    test('hand-computed positive step', () => {
        // a=1, e=2, ePrev=1, beta=0.5 -> 1 + 2 + 0.5*(2-1) = 3.5
        const step = pdGovernorStep({ a: 1, e: 2, ePrev: 1, beta: 0.5 });
        expect(step).toBeCloseTo(3.5, 6);
    });
});

describe('attentionUpperBound / canPruneBlock', () => {
    test('bound is always >= max q.x over random blocks (200 seeded trials)', () => {
        const rng = mulberry32(999);
        for (let trial = 0; trial < 200; trial++) {
            const dim = 3;
            const blockSize = 5 + Math.floor(rng() * 5);
            const q = Array.from({ length: dim }, () => rng() * 4 - 2);
            const block = Array.from({ length: blockSize }, () => Array.from({ length: dim }, () => rng() * 4 - 2));

            const { bound } = canPruneBlock(q, block, 1e9);
            let maxDot = -Infinity;
            for (const x of block) {
                const dot = q.reduce((s, qi, i) => s + qi * x[i], 0);
                if (dot > maxDot) maxDot = dot;
            }
            expect(bound).toBeGreaterThanOrEqual(maxDot - 1e-9);
        }
    });

    test('canPruneBlock returns prune true when bound below theta', () => {
        const q = [1, 0, 0];
        const block = [
            [10, 0, 0],
            [10, 0.1, 0]
        ];
        const { prune, bound } = canPruneBlock(q, block, 1000);
        expect(prune).toBe(true);
        expect(bound).toBeLessThan(1000);
    });

    test('canPruneBlock returns prune false when bound at/above theta', () => {
        const q = [1, 0, 0];
        const block = [
            [10, 0, 0],
            [10, 0.1, 0]
        ];
        const { prune } = canPruneBlock(q, block, 0.001);
        expect(prune).toBe(false);
    });

    test('empty block is always prunable', () => {
        expect(canPruneBlock([1, 2], [], 0)).toEqual({ prune: true, bound: 0 });
    });
});
